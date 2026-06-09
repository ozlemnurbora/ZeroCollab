/**
 * Log-derived notification generator (Phase 1: project-level events).
 *
 * Reads the already-synced Activity Log (`activity_logs`) across every project
 * the current user is a member of and turns relevant, NEW entries into local
 * notifications scoped to that user. It never notifies a user about their own
 * actions, and is fully wrapped so it can never throw or block the UI.
 *
 * This does NOT touch P2P/hub, task/meeting sync, or the Activity Log page; it
 * only READS logs (via logRemoteStorage) and WRITES notifications.
 */

import {
  fetchUserMemberProjectIds,
  fetchRemoteLogs,
  fetchProjectNamesByIds,
} from './logRemoteStorage.js'
import { addNotification, getExistingSourceLogIds } from './notificationService.js'

const watermarkKey = (userId) => `zc-notif-watermark-${userId}`

/** Readable label for a backlog/task item type ('task' | 'story' | 'epic' | 'feature'). */
const itemTypeLabel = (t) => {
  const v = String(t || '').toLowerCase()
  if (v === 'epic') return 'epic'
  if (v === 'feature') return 'feature'
  if (v === 'story' || v === 'user_story') return 'user story'
  return 'task'
}

function readWatermark(userId) {
  try {
    const raw = localStorage.getItem(watermarkKey(userId))
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function writeWatermark(userId, ts) {
  try {
    localStorage.setItem(watermarkKey(userId), String(ts))
  } catch {
    /* ignore storage errors */
  }
}

/**
 * Map a project-level activity log to a notification payload (without recipient/
 * source fields). Returns null when the log type isn't surfaced this phase.
 */
function buildNotification(log, user, projectName) {
  const who = log.userName || 'Someone'
  // `projectName` is resolved authoritatively from the projects table by the
  // caller, keyed on the member project id we're iterating (not the log field).
  // Only append "in <project>" when we actually have a name; otherwise omit it.
  const inProject = projectName ? ` in ${projectName}` : ''
  const projectSuffix = projectName ? ` ${projectName}` : ''
  switch (log.action) {
    case 'meeting.created':
      return {
        type: 'meeting_created',
        title: 'New meeting',
        message: `${who} scheduled a meeting "${log.entityName || ''}"${inProject}`,
      }
    case 'sprint.created':
      return {
        type: 'sprint_created',
        title: 'New sprint',
        message: `${who} created a sprint${inProject}`,
      }
    case 'sprint.completed':
    case 'sprint.updated':
      return {
        type: 'sprint_completed',
        title: 'Sprint updated',
        message: `${who} updated a sprint${inProject}`,
      }
    case 'evaluation.created':
      return {
        type: 'task_update',
        title: 'New evaluation',
        message: `${who} created an evaluation${inProject}`,
      }
    case 'team.assigned':
      return {
        type: 'task_assigned',
        title: 'Team assigned',
        message: projectName
          ? `${who} assigned a team to project${projectSuffix}`
          : `${who} assigned a team to a project`,
      }
    case 'project.member_added': {
      // Only notify the added user, and only when we can identify them from
      // metadata (a different actor added them). Self-joins are skipped upstream.
      const md = log.metadata || {}
      const addedId = md.addedUserId || md.userId || md.memberUserId || null
      const addedEmail = md.addedUserEmail || md.email || md.memberEmail || null
      const isMe =
        (addedId && addedId === user.id) ||
        (addedEmail && user.email && addedEmail === user.email)
      if (!isMe) return null
      return {
        type: 'task_assigned',
        title: 'Added to project',
        message: projectName
          ? `${who} added you to project${projectSuffix}`
          : `${who} added you to a project`,
      }
    }
    // ---- Phase 2: task / backlog assignment & ownership ----
    // The card's assignee is an email; only the assignee (and never the actor)
    // is notified. `assignee`/`assigneeChanged`/`toStatus` come from log metadata.
    case 'task.created':
    case 'story.created':
    case 'epic.created':
    case 'feature.created': {
      if (log.metadata?.assignee !== user.email) return null
      const kind = itemTypeLabel(log.entityType || log.category)
      return {
        type: 'task_assigned',
        title: 'Assigned to you',
        message: `${who} assigned the ${kind} "${log.entityName || ''}" to you${inProject}`,
      }
    }
    case 'task.updated':
    case 'story.updated':
    case 'epic.updated':
    case 'feature.updated': {
      if (log.metadata?.assignee !== user.email) return null
      const kind = itemTypeLabel(log.entityType || log.category)
      if (log.metadata?.assigneeChanged) {
        return {
          type: 'task_assigned',
          title: 'Assigned to you',
          message: `${who} assigned the ${kind} "${log.entityName || ''}" to you${inProject}`,
        }
      }
      return {
        type: 'task_update',
        title: 'Card updated',
        message: `${who} updated your ${kind} "${log.entityName || ''}"${inProject}`,
      }
    }
    case 'task.moved': {
      if (log.metadata?.assignee !== user.email) return null
      const kind = itemTypeLabel(log.entityType || log.category)
      const toStatus = log.metadata?.toStatus || 'a new status'
      return {
        type: 'task_moved',
        title: 'Task moved',
        message: `${who} moved your ${kind} "${log.entityName || ''}" to ${toStatus}${inProject}`,
      }
    }
    default:
      return null
  }
}

/**
 * Generate notifications for `user` from synced activity logs. Safe to call
 * frequently: it de-duplicates by source log id and uses a per-user watermark
 * so only events newer than the last run (or feature-enable time) are surfaced.
 */
export async function generateNotificationsForUser(user) {
  try {
    if (!user?.id) return

    const memberProjectIds = await fetchUserMemberProjectIds(user.id)
    if (!Array.isArray(memberProjectIds) || memberProjectIds.length === 0) return

    // Authoritative project id -> name map straight from the projects table.
    const nameById = await fetchProjectNamesByIds(memberProjectIds)

    const existingWatermark = readWatermark(user.id)

    // Gather recent logs per member project, carrying the LOOP project id so the
    // project name resolves from the id we fetched with (not a log field).
    const entries = []
    for (const pid of memberProjectIds) {
      const logs = await fetchRemoteLogs(pid, { limit: 100 })
      for (const log of logs) {
        if (log) entries.push({ log, pid })
      }
    }
    if (entries.length === 0) return

    const newestTs = entries.reduce(
      (max, e) => Math.max(max, e.log.timestamp || 0),
      0,
    )

    // First run for this account: set the watermark to now and generate nothing,
    // so we never flood the bell with historical events.
    if (existingWatermark === null) {
      writeWatermark(user.id, newestTs || Date.now())
      return
    }

    const candidates = entries
      .filter((e) => (e.log.timestamp || 0) > existingWatermark)
      .filter((e) => e.log.userId !== user.id) // never notify about my own actions
      .sort((a, b) => (a.log.timestamp || 0) - (b.log.timestamp || 0))

    if (candidates.length === 0) {
      if (newestTs > existingWatermark) writeWatermark(user.id, newestTs)
      return
    }

    const existingSourceIds = await getExistingSourceLogIds(user.id)

    for (const { log, pid } of candidates) {
      if (log.id && existingSourceIds.has(log.id)) continue
      const projectName = nameById.get(String(pid)) || ''
      const payload = buildNotification(log, user, projectName)
      if (!payload) continue
      await addNotification({
        ...payload,
        recipientUserId: user.id,
        sourceLogId: log.id || null,
        projectName,
      })
      if (log.id) existingSourceIds.add(log.id)
    }

    // Advance the watermark past everything we processed.
    writeWatermark(user.id, Math.max(existingWatermark, newestTs))
  } catch (err) {
    console.error('[NotificationGenerator] generateNotificationsForUser error:', err)
  }
}
