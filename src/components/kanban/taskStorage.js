import { replaceTasksForOwner, getTasksForOwner } from '../../utils/database.js'

/** Fibonacci-style options for create/edit UI; values are not enforced server-side. */
export const STORY_POINT_SELECT_OPTIONS = [0, 1, 2, 3, 5, 8, 13, 21]

export function normalizeStoryPointsValue(raw) {
  if (raw === '' || raw == null) return 0
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n)
}

/** Select options: recommended set plus current value when it falls outside (e.g. legacy data). */
export function storyPointOptionsForValue(raw) {
  const v = normalizeStoryPointsValue(raw)
  const set = new Set(STORY_POINT_SELECT_OPTIONS)
  set.add(v)
  return [...set].sort((a, b) => a - b)
}

export function normalizeTaskForStorage(task, ownerUserId) {
  if (!task || typeof task !== 'object') return null
  const id = typeof task.id === 'string' ? task.id : String(task.id || '')
  if (!id) return null

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

  const sprintNumber =
    task.sprintNumber == null || task.sprintNumber === '' ? null : task.sprintNumber

  const storyPoints = normalizeStoryPointsValue(
    task.storyPoints ?? task.story_points ?? task.points ?? 0,
  )

  const owner =
    task.ownerUserId != null && String(task.ownerUserId).trim()
      ? String(task.ownerUserId).trim()
      : ownerUserId || null

  const projectId = task.projectId ?? null

  const calendarTypeRaw = task.calendarType
  const calendarType =
    typeof calendarTypeRaw === 'string' && calendarTypeRaw.trim()
      ? calendarTypeRaw.trim()
      : projectId
        ? 'general'
        : 'personal'

  const updatedAtRaw = task.updatedAt ?? task.updated_at ?? null
  const createdAtRaw = task.createdAt ?? task.created_at ?? null
  const updatedAt =
    typeof updatedAtRaw === 'number' && Number.isFinite(updatedAtRaw)
      ? updatedAtRaw
      : typeof updatedAtRaw === 'string' && updatedAtRaw.trim()
        ? Number(updatedAtRaw) || Date.parse(updatedAtRaw) || null
        : null
  const createdAt =
    typeof createdAtRaw === 'number' && Number.isFinite(createdAtRaw)
      ? createdAtRaw
      : typeof createdAtRaw === 'string' && createdAtRaw.trim()
        ? Date.parse(createdAtRaw) || null
        : null

  // Keep other fields as-is; only fill required defaults for backward compatibility.
  const next = {
    ...task,
    id,
    status,
    itemType,
    backlogState,
    sprintId,
    sprintNumber,
    storyPoints,
    ownerUserId: owner,
    calendarType,
    projectId: projectId ?? undefined,
    updatedAt: updatedAt ?? createdAt ?? Date.now(),
  }

  return next
}

export async function loadTasks(ownerUserId) {
  try {
    if (!ownerUserId) return []
    const raw = await getTasksForOwner(ownerUserId)
    const list = Array.isArray(raw) ? raw : []
    const normalized = list
      .map((t) => normalizeTaskForStorage(t, ownerUserId))
      .filter(Boolean)

    // Temporary recovery logs
    console.log('[TaskStorage] loadTasks', {
      ownerUserId,
      indexedDbCount: list.length,
      normalizedCount: normalized.length,
    })

    return normalized
  } catch {
    return []
  }
}

export async function saveTasks(tasks, ownerUserId, options = {}) {
  try {
    if (!ownerUserId) return
    const { allowEmpty = false, reason = '' } = options || {}
    const list = Array.isArray(tasks) ? tasks : []
    if (!allowEmpty && list.length === 0) {
      // Never write [] unless caller explicitly intends to delete everything.
      console.log('[TaskStorage] blocked empty save', { ownerUserId, reason })
      return
    }
    const normalized = list
      .map((t) => normalizeTaskForStorage(t, ownerUserId))
      .filter(Boolean)
    if (!allowEmpty && normalized.length === 0) return
    console.log('[TaskStorage] saving full task list count:', normalized.length, { ownerUserId, reason })
    await replaceTasksForOwner(ownerUserId, normalized, { allowEmpty, reason })
  } catch {
    // ignore storage errors
  }
}

export async function pruneSharedTasksByProjectIds(projectIds, ownerUserId) {
  if (!ownerUserId) return
  const ids = new Set(Array.isArray(projectIds) ? projectIds.filter(Boolean) : [])
  if (ids.size === 0) return
  const current = await loadTasks(ownerUserId)
  const next = current.filter((task) => {
    if (!task?.projectId) return true
    return !ids.has(task.projectId)
  })
  if (next.length !== current.length) {
    await saveTasks(next, ownerUserId, {
      allowEmpty: true,
      reason: 'pruneSharedTasksByProjectIds',
    })
  }
}
