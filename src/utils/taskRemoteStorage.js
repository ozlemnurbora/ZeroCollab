import { supabase } from './supabase.js'
import {
  normalizeStoryPointsValue,
  normalizeTaskForStorage,
  markTaskSoftDeleted,
} from '../components/kanban/taskStorage.js'
import { getAgileItemType } from './agile/getAgileItemType.js'

/** True when a task row should be upserted to Supabase `tasks` (project-scoped work items). */
export function isSharedProjectTask(task) {
  if (!task || typeof task !== 'object') return false
  if (!task.projectId) return false
  // Project work items must sync so sprint assignment and backlog are visible to all members.
  if (task.calendarType === 'general' || !task.calendarType) return true
  if (task.calendarType === 'personal' || task.calendarType === 'custom') return true
  return false
}

function toIso(ts) {
  const n = typeof ts === 'number' && Number.isFinite(ts) ? ts : Date.now()
  return new Date(n).toISOString()
}

function sprintCommittedAtToIso(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString()
  }
  if (typeof value === 'string' && value.trim()) {
    const t = Date.parse(value)
    if (Number.isFinite(t)) return new Date(t).toISOString()
    return value
  }
  return null
}

export function normalizeTaskForRemote(task, fallbackUserId) {
  if (!isSharedProjectTask(task)) return null
  const id = typeof task.id === 'string' ? task.id : String(task.id || '')
  const projectId = typeof task.projectId === 'string' ? task.projectId : String(task.projectId || '')
  if (!id || !projectId) return null

  const snRaw = task.sprintNumber ?? task.sprint_number
  const snNum = snRaw == null || snRaw === '' ? NaN : Number(snRaw)
  const sprintNumber = Number.isFinite(snNum) ? Math.round(snNum) : null

  const doneAtRaw = task.doneAt ?? task.done_at ?? null
  let doneAt = null
  if (typeof doneAtRaw === 'number' && Number.isFinite(doneAtRaw)) {
    doneAt = doneAtRaw
  } else if (typeof doneAtRaw === 'string' && doneAtRaw.trim()) {
    const n = Number(doneAtRaw)
    if (Number.isFinite(n)) doneAt = n
    else {
      const p = Date.parse(doneAtRaw)
      doneAt = Number.isFinite(p) ? p : null
    }
  }

  const statusNorm =
    typeof task.status === 'string' && task.status.trim()
      ? task.status.trim().toLowerCase()
      : 'todo'

  const { itemTypeKey, displayType } = getAgileItemType(task)

  const normalized = {
    ...task,
    id,
    projectId,
    status: statusNorm,
    priority: typeof task.priority === 'string' && task.priority.trim() ? task.priority.trim() : 'must',
    itemType: itemTypeKey ?? (typeof task.itemType === 'string' && task.itemType.trim() ? task.itemType.trim() : 'task'),
    type: task.type ?? displayType ?? task.type,
    backlogState: typeof task.backlogState === 'string' && task.backlogState.trim() ? task.backlogState.trim() : 'new',
    storyPoints: normalizeStoryPointsValue(
      task.storyPoints ?? task.story_points ?? task.points ?? 0,
    ),
    sprintId: task.sprintId == null || task.sprintId === '' ? null : String(task.sprintId),
    sprintNumber,
    sprintCommittedAt: task.sprintCommittedAt ?? task.sprint_committed_at ?? null,
    calendarType: 'general',
    calendarId: 'general',
    ownerUserId: task.ownerUserId || fallbackUserId || null,
    updatedAt:
      typeof task.updatedAt === 'number' && Number.isFinite(task.updatedAt)
        ? task.updatedAt
        : Date.now(),
    doneAt: statusNorm === 'done' ? doneAt : null,
    deleted:
      task.deleted === true ||
      task.deleted === 1 ||
      task.deleted === 'true' ||
      task.deleted === '1',
    deletedAt: (() => {
      const raw = task.deletedAt ?? task.deleted_at ?? null
      if (raw == null || raw === '') return null
      if (typeof raw === 'number' && Number.isFinite(raw)) return raw
      if (typeof raw === 'string' && raw.trim()) {
        const n = Number(raw)
        if (Number.isFinite(n)) return n
        const p = Date.parse(raw)
        return Number.isFinite(p) ? p : null
      }
      return null
    })(),
  }

  return {
    id: normalized.id,
    project_id: normalized.projectId,
    title: normalized.title || normalized.name || 'Untitled',
    description: normalized.description ?? null,
    assignee: normalized.assignee ?? null,
    status: normalized.status || 'todo',
    priority: normalized.priority || 'must',
    item_type: normalized.itemType || 'task',
    backlog_state: normalized.backlogState || 'new',
    story_points: normalizeStoryPointsValue(normalized.storyPoints),
    sprint_id: normalized.sprintId || null,
    sprint_number: normalized.sprintNumber ?? null,
    sprint_committed_at: sprintCommittedAtToIso(normalized.sprintCommittedAt),
    calendar_type: normalized.calendarType || 'general',
    calendar_id: normalized.calendarId || 'general',
    team_id: normalized.teamId || null,
    owner_user_id: normalized.ownerUserId || fallbackUserId || null,
    payload: {
      ...normalized,
      sprintId: normalized.sprintId,
      sprintNumber: normalized.sprintNumber,
      sprintCommittedAt: normalized.sprintCommittedAt,
      backlogState: normalized.backlogState,
      storyPoints: normalized.storyPoints,
      calendarType: 'general',
      calendarId: 'general',
    },
    updated_at: toIso(normalized.updatedAt),
  }
}

export function mapRemoteTask(row) {
  if (!row) return null
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {}
  const id = typeof row.id === 'string' ? row.id : String(payload.id || '')
  const projectId = row.project_id ?? payload.projectId ?? null

  const createdAt = row.created_at ? Date.parse(row.created_at) : payload.createdAt ?? null
  const updatedAt = row.updated_at ? Date.parse(row.updated_at) : payload.updatedAt ?? null

  return {
    ...payload,
    id,
    projectId,
    title: payload.title ?? row.title ?? 'Untitled',
    description: payload.description ?? row.description ?? '',
    assignee: payload.assignee ?? row.assignee ?? '',
    status: payload.status ?? row.status ?? 'todo',
    priority: payload.priority ?? row.priority ?? 'must',
    itemType: (() => {
      const { itemTypeKey } = getAgileItemType({ itemType: payload.itemType ?? row.item_type, type: payload.type })
      return itemTypeKey ?? payload.itemType ?? row.item_type ?? 'task'
    })(),
    type: payload.type ?? null,
    backlogState: payload.backlogState ?? row.backlog_state ?? 'new',
    storyPoints: normalizeStoryPointsValue(
      payload.storyPoints ?? row.story_points ?? 0,
    ),
    sprintId: payload.sprintId ?? row.sprint_id ?? null,
    sprintNumber: payload.sprintNumber ?? row.sprint_number ?? null,
    sprintCommittedAt: payload.sprintCommittedAt ?? row.sprint_committed_at ?? null,
    calendarType: payload.calendarType ?? row.calendar_type ?? 'general',
    calendarId: payload.calendarId ?? row.calendar_id ?? 'general',
    teamId: payload.teamId ?? row.team_id ?? null,
    ownerUserId: payload.ownerUserId ?? row.owner_user_id ?? null,
    createdAt: payload.createdAt ?? createdAt ?? Date.now(),
    updatedAt: payload.updatedAt ?? updatedAt ?? Date.now(),
    doneAt: (() => {
      const raw = payload.doneAt ?? payload.done_at ?? null
      if (typeof raw === 'number' && Number.isFinite(raw)) return raw
      if (typeof raw === 'string' && raw.trim()) {
        const n = Number(raw)
        if (Number.isFinite(n)) return n
        const p = Date.parse(raw)
        if (Number.isFinite(p)) return p
      }
      return null
    })(),
    deleted:
      payload.deleted === true ||
      payload.deleted === 1 ||
      payload.deleted === 'true' ||
      row?.deleted === true,
    deletedAt: (() => {
      const raw = payload.deletedAt ?? payload.deleted_at ?? row?.deleted_at ?? null
      if (raw == null || raw === '') return null
      if (typeof raw === 'number' && Number.isFinite(raw)) return raw
      if (typeof raw === 'string' && raw.trim()) {
        const n = Number(raw)
        if (Number.isFinite(n)) return n
        const p = Date.parse(raw)
        if (Number.isFinite(p)) return p
      }
      return null
    })(),
  }
}

export async function fetchRemoteProjectTasks(projectId) {
  try {
    if (!projectId) return []
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: true })
    if (error) {
      console.error('[TaskRemoteStorage] fetchRemoteProjectTasks error', error)
      return []
    }
    return (Array.isArray(data) ? data : []).map(mapRemoteTask).filter(Boolean)
  } catch (err) {
    console.error('[TaskRemoteStorage] fetchRemoteProjectTasks exception', err)
    return []
  }
}

export async function upsertRemoteTasks(tasks, userId) {
  try {
    const list = Array.isArray(tasks) ? tasks : []
    const rows = list
      .filter(isSharedProjectTask)
      .map((t) => normalizeTaskForRemote(t, userId))
      .filter(Boolean)
    if (rows.length === 0) return
    const { error } = await supabase.from('tasks').upsert(rows, { onConflict: 'id' })
    if (error) console.error('[TaskRemoteStorage] upsertRemoteTasks error', error)
  } catch (err) {
    console.error('[TaskRemoteStorage] upsertRemoteTasks exception', err)
  }
}

/**
 * Soft-delete on Supabase (tombstone upsert). Avoids resurrecting the row when other clients still have old payloads.
 * @param {string} userId
 * @param {object} [existingTask] Full task if available (richer payload).
 */
export async function deleteRemoteTask(taskId, projectId, userId = null, existingTask = null) {
  try {
    if (!taskId || !projectId || !userId) return
    const now = Date.now()
    const base =
      existingTask && String(existingTask.id) === String(taskId)
        ? markTaskSoftDeleted({ ...existingTask }, now)
        : markTaskSoftDeleted(
            {
              id: taskId,
              projectId,
              calendarType: 'general',
              calendarId: 'general',
              title: '',
              status: 'todo',
              itemType: 'task',
              backlogState: 'new',
              createdAt: now,
            },
            now,
          )
    const norm = normalizeTaskForStorage(base, userId)
    if (!norm || !isSharedProjectTask(norm)) return
    await upsertRemoteTasks([norm], userId)
  } catch (err) {
    console.error('[TaskRemoteStorage] deleteRemoteTask exception', err)
  }
}

