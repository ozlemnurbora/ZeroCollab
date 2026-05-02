import {
  normalizeStoryPointsValue,
  normalizeTaskForStorage,
  isTaskDeleted,
  mergeTaskVersionsPreferringTombstone,
  markTaskSoftDeleted,
} from '../components/kanban/taskStorage.js'

function normalizeSet(values) {
  return new Set(Array.isArray(values) ? values.filter(Boolean) : [])
}

function normalizeTaskShape(task) {
  if (!task || typeof task !== 'object') return null
  if (!task.id) return null
  const statusRaw = task.status
  const status =
    typeof statusRaw === 'string' && statusRaw.trim()
      ? statusRaw.trim().toLowerCase()
      : 'todo'
  const itemTypeRaw = task.itemType ?? task.type
  const itemType =
    typeof itemTypeRaw === 'string' && itemTypeRaw.trim()
      ? itemTypeRaw.trim()
      : 'task'
  const backlogStateRaw = task.backlogState
  const backlogState =
    typeof backlogStateRaw === 'string' && backlogStateRaw.trim()
      ? backlogStateRaw.trim()
      : 'new'
  const sprintId =
    task.sprintId == null || task.sprintId === '' ? null : task.sprintId
  const calendarTypeRaw = task.calendarType
  const projectId = task.projectId ?? null
  const calendarType =
    typeof calendarTypeRaw === 'string' && calendarTypeRaw.trim()
      ? calendarTypeRaw.trim()
      : projectId
        ? 'general'
        : 'personal'
  const ownerUserId =
    task.ownerUserId != null && String(task.ownerUserId).trim()
      ? String(task.ownerUserId).trim()
      : null
  const storyPoints = normalizeStoryPointsValue(
    task.storyPoints ?? task.story_points ?? task.points ?? 0,
  )
  return {
    ...task,
    status,
    itemType,
    backlogState,
    sprintId,
    calendarType,
    ownerUserId,
    projectId,
    storyPoints,
  }
}

function isGeneralTask(task) {
  if (!task) return false
  if (task.calendarType === 'general') return true
  // Legacy: missing calendarType but has projectId => treat as general.
  if (!task.calendarType && !!task.projectId) return true
  return false
}

function isAuthorizedProjectTask(task, allowedProjectIds) {
  if (!isGeneralTask(task)) return false
  if (!task.projectId) return false
  return allowedProjectIds.has(task.projectId)
}

function isOwnedPersonalTask(task, currentUserId) {
  if (!task || isGeneralTask(task)) return false
  // Legacy: missing calendarType and no projectId => treat as personal.
  const isPersonalLike =
    task.calendarType === 'personal' ||
    task.calendarType === 'custom' ||
    (!task.calendarType && !task.projectId)
  if (!isPersonalLike) return false
  // Legacy: missing ownerUserId should be visible to current user (recovery scenario).
  if (!task.ownerUserId) return true
  if (!currentUserId) return true
  return task.ownerUserId === currentUserId
}

/** Personal/custom tasks scoped to a project the user belongs to (excludes legacy null projectId). */
function isOwnedPersonalTaskInAllowedProjects(task, currentUserId, allowedProjectIds) {
  if (!isOwnedPersonalTask(task, currentUserId)) return false
  const allowed = normalizeSet(allowedProjectIds)
  // Legacy personal tasks can have no projectId — treat as visible (All Tasks recovery).
  if (!task.projectId) return true
  return allowed.has(task.projectId) || allowed.size === 0
}

export function tasksForP2PBroadcast(tasks, options = {}) {
  const list = Array.isArray(tasks) ? tasks : []
  const { activeProjectId = null, allowedProjectIds = [] } = options
  const allowed = normalizeSet(allowedProjectIds)
  if (!activeProjectId || !allowed.has(activeProjectId)) return []
  return list.filter(
    (task) =>
      isGeneralTask(task) &&
      task.projectId === activeProjectId &&
      allowed.has(task.projectId),
  )
}

export function mergeTasksFromSync(localTasks, incomingTasks, options = {}) {
  const local = Array.isArray(localTasks) ? localTasks : []
  const incoming = Array.isArray(incomingTasks) ? incomingTasks : []
  const { allowedProjectIds = [] } = options
  const allowed = normalizeSet(allowedProjectIds)

  // Non-destructive merge:
  // - always keep existing local tasks (even if not in allowed projects)
  // - apply incoming *general* tasks only for allowed projects
  // - merge by id using updatedAt/createdAt when available
  // - never delete local tasks just because they are missing from incoming payload
  const mergedById = new Map()
  for (const task of local) {
    const normalized = normalizeTaskShape(task)
    if (normalized) mergedById.set(normalized.id, normalized)
  }

  for (const task of incoming) {
    const normalized = normalizeTaskShape(task)
    if (!normalized || !isAuthorizedProjectTask(normalized, allowed)) continue
    const existing = mergedById.get(normalized.id)
    if (!existing) {
      mergedById.set(normalized.id, normalized)
      continue
    }

    // Only replace an existing task if it's the same sync scope (general+authorized).
    // Never overwrite a personal/custom task with a shared payload.
    if (!isGeneralTask(existing)) continue
    if (!isAuthorizedProjectTask(existing, allowed)) continue

    mergedById.set(
      normalized.id,
      mergeTaskVersionsPreferringTombstone(existing, normalized),
    )
  }

  // Preserve local ordering as much as possible: start with local order, then append new incoming.
  const out = []
  const seen = new Set()
  for (const task of local) {
    const id = task?.id
    if (!id || seen.has(id)) continue
    const value = mergedById.get(id)
    if (value) {
      out.push(value)
      seen.add(id)
    }
  }
  for (const [id, value] of mergedById.entries()) {
    if (!seen.has(id)) out.push(value)
  }

  return out
}

/** When a project is selected: general tasks in that project, or personal/custom owned by current user in that project. */
export function taskVisibleInActiveProject(task, activeProjectId, ownerUserId) {
  if (!activeProjectId) return true
  if (!task) return false
  if (task.projectId === activeProjectId) return true
  // Don't hide legacy/personal tasks that have no projectId; keep them visible so users can recover/edit them.
  const isLegacyOrOwnedPersonal =
    !task.projectId && (!task.ownerUserId || (ownerUserId && task.ownerUserId === ownerUserId))
  if (isLegacyOrOwnedPersonal) return true
  return false
}

export function filterTasksForVisibility(tasks, options = {}) {
  const list = Array.isArray(tasks) ? tasks : []
  const { allowedProjectIds = [], currentUserId = null } = options
  const allowed = normalizeSet(allowedProjectIds)
  const normalized = list.map(normalizeTaskShape).filter(Boolean)
  // Backward-compat: if membership/projects haven't loaded yet, do not hide everything.
  if (allowed.size === 0) return normalized
  return normalized.filter(
    (task) =>
      !isTaskDeleted(task) &&
      (isOwnedPersonalTaskInAllowedProjects(task, currentUserId, allowedProjectIds) ||
        isAuthorizedProjectTask(task, allowed)),
  )
}

/** General/shared task deleted locally — safe to tell peers (same scope as project task sync). */
export function shouldBroadcastGeneralTaskDelete(task, allowedProjectIds = []) {
  if (!task?.id || !task.projectId) return false
  if (!isGeneralTask(task)) return false
  return normalizeSet(allowedProjectIds).has(task.projectId)
}

/** Incoming TASK_DELETE payload is for a project we are allowed to sync. */
export function canApplyIncomingTaskDelete(payload, allowedProjectIds = []) {
  const { taskId, projectId } = payload || {}
  const allowed = normalizeSet(allowedProjectIds)
  return !!(taskId && projectId && allowed.has(projectId))
}

/**
 * Soft-delete one general project task after an authorized TASK_DELETE / hub delete.
 * Inserts a minimal tombstone if the task was never in this client's list.
 */
export function applyAuthorizedGeneralTaskSoftDelete(
  tasks,
  taskId,
  projectId,
  allowedProjectIds = [],
  ownerUserId = null,
) {
  if (!canApplyIncomingTaskDelete({ taskId, projectId }, allowedProjectIds)) {
    return { next: Array.isArray(tasks) ? tasks : [], changed: false }
  }
  const list = Array.isArray(tasks) ? [...tasks] : []
  const now = Date.now()
  const idx = list.findIndex(
    (t) =>
      t?.id === taskId &&
      String(t?.projectId ?? '') === String(projectId) &&
      isGeneralTask(t),
  )
  if (idx >= 0) {
    if (isTaskDeleted(list[idx])) return { next: list, changed: false }
    const marked = markTaskSoftDeleted(list[idx], now)
    list[idx] = ownerUserId
      ? normalizeTaskForStorage(marked, ownerUserId)
      : marked
    return { next: list, changed: true }
  }
  const stub = normalizeTaskForStorage(
    {
      id: taskId,
      projectId,
      calendarType: 'general',
      calendarId: 'general',
      title: '',
      status: 'todo',
      itemType: 'task',
      backlogState: 'new',
      deleted: true,
      deletedAt: now,
      updatedAt: now,
      createdAt: now,
    },
    ownerUserId,
  )
  if (stub) list.push(stub)
  return { next: list, changed: true }
}

