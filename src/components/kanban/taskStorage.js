import { replaceTasksForOwner, getTasksForOwner } from '../../utils/database.js'

/** Fibonacci-style options for create/edit UI; values are not enforced server-side. */
export const STORY_POINT_SELECT_OPTIONS = [0, 1, 2, 3, 5, 8, 13, 21]

/** MoSCoW rank for board sort (ascending: must first). */
export const PRIORITY_RANK = {
  must: 1,
  should: 2,
  could: 3,
  wont: 4,
}

/** True when the task is soft-deleted (tombstone) and must be hidden from UI and lose merges to non-deleted copies. */
export function isTaskDeleted(task) {
  if (!task || typeof task !== 'object') return false
  const d = task.deleted
  if (d === true || d === 1 || d === 'true' || d === '1') return true
  const raw = task.deletedAt ?? task.deleted_at
  if (raw == null || raw === '') return false
  if (typeof raw === 'number' && Number.isFinite(raw)) return true
  if (typeof raw === 'string' && raw.trim()) return true
  return false
}

/** Mark a task as soft-deleted; bump updatedAt for merge ordering. */
export function markTaskSoftDeleted(task, now = Date.now()) {
  if (!task || typeof task !== 'object') return task
  return {
    ...task,
    deleted: true,
    deletedAt: now,
    updatedAt: now,
  }
}

/** Timestamp used when comparing two task revisions (sync / merge). */
export function getTaskMergeTimestamp(task) {
  const v =
    task?.updatedAt ??
    task?.updated_at ??
    task?.modifiedAt ??
    task?.modified_at ??
    task?.lastUpdatedAt ??
    null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
    const t = Date.parse(v)
    if (Number.isFinite(t)) return t
  }
  const created = task?.createdAt ?? task?.created_at ?? null
  if (typeof created === 'number' && Number.isFinite(created)) return created
  if (typeof created === 'string') {
    const t = Date.parse(created)
    if (Number.isFinite(t)) return t
  }
  return 0
}

/**
 * Merge two versions of the same task id. Tombstones win over non-deleted peers;
 * among tombstones or among active tasks, newer updatedAt wins.
 */
export function mergeTaskVersionsPreferringTombstone(existing, incoming) {
  if (!existing) return incoming
  if (!incoming) return existing
  const exDel = isTaskDeleted(existing)
  const inDel = isTaskDeleted(incoming)
  if (exDel && !inDel) return existing
  if (!exDel && inDel) return incoming
  const exTs = getTaskMergeTimestamp(existing)
  const inTs = getTaskMergeTimestamp(incoming)
  if (exDel && inDel) return inTs >= exTs ? incoming : existing
  return inTs >= exTs ? incoming : existing
}

/** Merge local + remote task arrays by id with tombstone-safe rules (Supabase / hydration). */
export function mergeTaskListsByIdPreferNewer(localAll, remoteAll) {
  const local = Array.isArray(localAll) ? localAll : []
  const remote = Array.isArray(remoteAll) ? remoteAll : []
  const map = new Map()
  for (const t of local) {
    if (t?.id) map.set(t.id, t)
  }
  for (const rt of remote) {
    if (!rt?.id) continue
    const existing = map.get(rt.id)
    map.set(rt.id, mergeTaskVersionsPreferringTombstone(existing, rt))
  }
  return Array.from(map.values())
}

/** Stable position within the same status column and priority group. */
export function getTaskPosition(task) {
  if (!task || typeof task !== 'object') return null
  const raw = task.position ?? task.orderIndex ?? task.sortOrder
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw)
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw)
    if (Number.isFinite(n)) return Math.round(n)
  }
  return null
}

/**
 * Sort for tasks in one Kanban column: priority rank, then position, then createdAt ascending.
 */
export function compareKanbanTasksInColumn(a, b) {
  const ar = PRIORITY_RANK[a?.priority || 'must'] ?? 99
  const br = PRIORITY_RANK[b?.priority || 'must'] ?? 99
  if (ar !== br) return ar - br
  const ap = getTaskPosition(a)
  const bp = getTaskPosition(b)
  if (ap != null && bp != null && ap !== bp) return ap - bp
  if (ap != null && bp == null) return -1
  if (ap == null && bp != null) return 1
  return (a?.createdAt ?? 0) - (b?.createdAt ?? 0)
}

/**
 * After load or merge: for each (status, priority) group, sort and assign contiguous positions.
 */
export function dedupeAndNormalizePositions(tasks) {
  const list = Array.isArray(tasks) ? tasks.map((t) => ({ ...t })) : []
  const tombstones = list.filter((t) => t?.id && isTaskDeleted(t))
  const active = list.filter((t) => t?.id && !isTaskDeleted(t))
  const byKey = new Map()
  for (const t of active) {
    if (!t?.id) continue
    const status = t.status || 'todo'
    const pri = t.priority || 'must'
    const key = `${status}\0${pri}`
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(t)
  }
  for (const group of byKey.values()) {
    group.sort(compareKanbanTasksInColumn)
    group.forEach((t, i) => {
      t.position = i
    })
  }
  const normalizedActive = Array.from(byKey.values()).flat()
  return [...normalizedActive, ...tombstones]
}

/** Next position when appending to a (status, priority) group. */
export function nextPositionForGroup(tasks, status, priority) {
  const list = Array.isArray(tasks) ? tasks : []
  const pri = priority || 'must'
  const st = status || 'todo'
  let max = -1
  for (const t of list) {
    if (isTaskDeleted(t)) continue
    if ((t.status || 'todo') !== st) continue
    if ((t.priority || 'must') !== pri) continue
    const p = getTaskPosition(t)
    if (p != null && p > max) max = p
  }
  return max + 1
}

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

  const resolvedPosition = getTaskPosition(task)

  let doneAt = null
  if (status === 'done') {
    const doneAtRaw = task.doneAt ?? task.done_at ?? null
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
  }

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
    doneAt,
  }

  if (resolvedPosition != null) next.position = resolvedPosition
  else delete next.position

  const dorRaw = task.definitionOfReady
  const dor =
    dorRaw && typeof dorRaw === 'object'
      ? dorRaw
      : {}
  next.definitionOfReady = {
    independent: !!dor.independent,
    negotiable: !!dor.negotiable,
    valuable: !!dor.valuable,
    estimable: !!dor.estimable,
    small: !!dor.small,
    testable: !!dor.testable,
  }

  const delRaw = task.deleted
  const explicitlyDeleted =
    delRaw === true || delRaw === 1 || delRaw === 'true' || delRaw === '1'
  const delAtRaw = task.deletedAt ?? task.deleted_at ?? null
  let deletedAtParsed = null
  if (delAtRaw != null && delAtRaw !== '') {
    if (typeof delAtRaw === 'number' && Number.isFinite(delAtRaw)) {
      deletedAtParsed = delAtRaw
    } else if (typeof delAtRaw === 'string' && delAtRaw.trim()) {
      const n = Number(delAtRaw)
      deletedAtParsed = Number.isFinite(n) ? n : Date.parse(delAtRaw) || null
    }
  }
  if (explicitlyDeleted || (deletedAtParsed != null && Number.isFinite(deletedAtParsed))) {
    next.deleted = true
    next.deletedAt = deletedAtParsed ?? next.updatedAt ?? Date.now()
  } else {
    next.deleted = false
    delete next.deletedAt
    delete next.deleted_at
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
