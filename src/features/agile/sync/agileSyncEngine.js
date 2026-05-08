/**
 * This central sync engine is used to keep Product Backlog, Roadmap, Sprint, and Task views consistent over P2P/Hub/IndexedDB.
 */
 
function nowMs() {
  return Date.now()
}
 
function toNumberOrNull(value) {
  if (value === '' || value == null) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const s = value.trim()
    if (!s) return null
    const n = Number(s)
    if (Number.isFinite(n)) return n
    const t = Date.parse(s)
    if (Number.isFinite(t)) return t
  }
  return null
}
 
function normTypeKey(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const low = s.toLowerCase().trim()
  if (low === 'task') return 'Task'
  if (low === 'user_story' || low === 'user story' || low === 'userstory')
    return 'User Story'
  if (low === 'feature') return 'Feature'
  if (low === 'epic') return 'Epic'
  // Already normalized or custom label
  if (s === 'Task' || s === 'User Story' || s === 'Feature' || s === 'Epic')
    return s
  return s
}
 
/**
 * getAgileItemType(item)
 * - supports item.type and item.itemType
 * - normalizes a small set of canonical types
 * - falls back to "Task" only if no type information exists
 */
export function getAgileItemType(item) {
  if (!item || typeof item !== 'object') return 'Task'
  const t = normTypeKey(item.type)
  if (t) return t
  const it = normTypeKey(item.itemType)
  if (it) return it
  return 'Task'
}
 
/**
 * isDeletedWorkItem(item)
 * Returns true if:
 * - item.deleted === true
 * - item.isDeleted === true
 * - item._deleted === true
 * - item.tombstone === true
 * - item.deletedAt exists
 */
export function isDeletedWorkItem(item) {
  if (!item || typeof item !== 'object') return false
  if (item.deleted === true) return true
  if (item.isDeleted === true) return true
  if (item._deleted === true) return true
  if (item.tombstone === true) return true
  const d = item.deletedAt ?? item.deleted_at ?? null
  return d != null && d !== ''
}
 
function pickString(value, fallback = '') {
  if (value == null) return fallback
  const s = String(value)
  return s
}
 
function pickNullableString(value) {
  if (value == null) return null
  const s = String(value).trim()
  return s ? s : null
}
 
/**
 * normalizeAgileWorkItem(item)
 * Preserves important fields and ensures:
 * - normalized itemType exists
 * - normalized type exists
 * - updatedAt exists if missing
 */
export function normalizeAgileWorkItem(item) {
  if (!item || typeof item !== 'object') return null
  const id = item.id != null ? String(item.id).trim() : ''
  if (!id) return null
 
  const type = getAgileItemType(item)
  const itemType =
    normTypeKey(item.itemType) || normTypeKey(item.type) || type || 'Task'
 
  const createdAt = toNumberOrNull(item.createdAt ?? item.created_at) ?? null
  const updatedAt =
    toNumberOrNull(item.updatedAt ?? item.updated_at) ?? createdAt ?? nowMs()
  const deletedAt = toNumberOrNull(item.deletedAt ?? item.deleted_at) ?? null
 
  const deleted =
    item.deleted === true ||
    item.isDeleted === true ||
    item._deleted === true ||
    item.tombstone === true ||
    deletedAt != null
 
  const tombstone = item.tombstone === true || deletedAt != null || item._deleted === true
 
  // Preserve unknown extra fields by spreading last.
  return {
    id,
    projectId: pickNullableString(item.projectId ?? item.project_id),
    teamId: pickNullableString(item.teamId ?? item.team_id),
    title: pickString(item.title ?? item.name ?? ''),
    description: item.description ?? null,
    type,
    itemType,
    priority: item.priority ?? null,
    state: item.state ?? null,
    backlogState: item.backlogState ?? item.backlog_state ?? null,
    status: item.status ?? null,
    storyPoints: item.storyPoints ?? item.story_points ?? item.points ?? null,
    assignee: item.assignee ?? null,
    parentEpicId: item.parentEpicId ?? null,
    parentFeatureId: item.parentFeatureId ?? null,
    parentStoryId: item.parentStoryId ?? null,
    roadmapBucket: item.roadmapBucket ?? null,
    plannedSprint: item.plannedSprint ?? null,
    roadmapOrder: item.roadmapOrder ?? null,
    sprintId: item.sprintId ?? item.sprint_id ?? null,
    sprintNumber: item.sprintNumber ?? item.sprint_number ?? null,
    sprintCommittedAt: item.sprintCommittedAt ?? item.sprint_committed_at ?? null,
    inSprint: item.inSprint ?? null,
    calendarType: item.calendarType ?? item.calendar_type ?? null,
    calendarId: item.calendarId ?? item.calendar_id ?? null,
    createdAt,
    updatedAt,
    deleted,
    deletedAt,
    tombstone,
    ...item,
    // Force normalized identity fields to win over spread.
    id: id,
    type: type,
    itemType: itemType,
    createdAt: createdAt,
    updatedAt: updatedAt,
    deleted: deleted,
    deletedAt: deletedAt,
    tombstone: tombstone,
  }
}
 
function mergeTimestamp(item) {
  const norm = normalizeAgileWorkItem(item)
  if (!norm) return 0
  const u = toNumberOrNull(norm.updatedAt) ?? 0
  const d = toNumberOrNull(norm.deletedAt) ?? null
  // If tombstoned, deletedAt controls precedence when newer.
  return d != null ? Math.max(u, d) : u
}
 
/**
 * areAgileItemsEqual(a, b)
 * Compare arrays by:
 * - id
 * - updatedAt
 * - deleted/deletedAt
 * - type/itemType
 * - roadmapBucket
 * - sprintId
 * - parentEpicId/parentFeatureId/parentStoryId
 * - state/backlogState/status
 */
export function areAgileItemsEqual(a, b) {
  const aa = Array.isArray(a) ? a : []
  const bb = Array.isArray(b) ? b : []
  if (aa === bb) return true
  if (aa.length !== bb.length) return false
 
  const keyOf = (x) => (x?.id != null ? String(x.id) : '')
  const aById = new Map(aa.map((it) => [keyOf(it), it]))
  const bById = new Map(bb.map((it) => [keyOf(it), it]))
  if (aById.size !== bById.size) return false
 
  for (const [id, ai] of aById.entries()) {
    const bi = bById.get(id)
    if (!bi) return false
    const an = normalizeAgileWorkItem(ai)
    const bn = normalizeAgileWorkItem(bi)
    if (!an || !bn) return false
 
    if (String(an.id) !== String(bn.id)) return false
    if ((toNumberOrNull(an.updatedAt) ?? 0) !== (toNumberOrNull(bn.updatedAt) ?? 0))
      return false
    if (Boolean(isDeletedWorkItem(an)) !== Boolean(isDeletedWorkItem(bn))) return false
    if ((toNumberOrNull(an.deletedAt) ?? 0) !== (toNumberOrNull(bn.deletedAt) ?? 0))
      return false
 
    if (String(an.type || '') !== String(bn.type || '')) return false
    if (String(an.itemType || '') !== String(bn.itemType || '')) return false
 
    if (String(an.roadmapBucket || '') !== String(bn.roadmapBucket || '')) return false
    if (String(an.sprintId || '') !== String(bn.sprintId || '')) return false
 
    if (String(an.parentEpicId || '') !== String(bn.parentEpicId || '')) return false
    if (String(an.parentFeatureId || '') !== String(bn.parentFeatureId || '')) return false
    if (String(an.parentStoryId || '') !== String(bn.parentStoryId || '')) return false
 
    if (String(an.state || '') !== String(bn.state || '')) return false
    if (String(an.backlogState || '') !== String(bn.backlogState || '')) return false
    if (String(an.status || '') !== String(bn.status || '')) return false
  }
 
  return true
}
 
/**
 * mergeAgileWorkItems(localItems, incomingItems)
 * - If incomingItems is empty, return localItems.
 * - Never let empty incoming payload wipe local data.
 * - Merge by id.
 * - Newer updatedAt wins.
 * - If deletedAt is newer, tombstone wins.
 * - Preserve unknown extra fields when possible.
 * - Do not drop Epic, Feature, User Story, or Task.
 * - Return normalized merged array.
 */
export function mergeAgileWorkItems(localItems, incomingItems) {
  const local = Array.isArray(localItems) ? localItems : []
  const incoming = Array.isArray(incomingItems) ? incomingItems : []
  if (incoming.length === 0) return local
 
  const mergedById = new Map()
 
  for (const it of local) {
    const norm = normalizeAgileWorkItem(it)
    if (!norm) continue
    mergedById.set(norm.id, norm)
  }
 
  for (const it of incoming) {
    const normIncoming = normalizeAgileWorkItem(it)
    if (!normIncoming) continue
 
    const existing = mergedById.get(normIncoming.id)
    if (!existing) {
      mergedById.set(normIncoming.id, normIncoming)
      continue
    }
 
    const exTs = mergeTimestamp(existing)
    const inTs = mergeTimestamp(normIncoming)
    if (inTs > exTs) {
      // Prefer incoming but preserve unknown fields from both sides.
      mergedById.set(normIncoming.id, { ...existing, ...normIncoming })
      continue
    }
    if (inTs === exTs) {
      // Tombstone wins ties if either is tombstoned.
      const exDel = isDeletedWorkItem(existing)
      const inDel = isDeletedWorkItem(normIncoming)
      if (inDel && !exDel) {
        mergedById.set(normIncoming.id, { ...existing, ...normIncoming })
      } else if (exDel && !inDel) {
        // keep existing
      } else {
        // Stable tie: keep existing but merge fields so we don't drop schema additions.
        mergedById.set(normIncoming.id, { ...normIncoming, ...existing })
      }
    }
  }
 
  const out = []
  for (const value of mergedById.values()) {
    const norm = normalizeAgileWorkItem(value)
    if (norm) out.push(norm)
  }
  return out
}
 
/**
 * buildAgileSyncPayload({ items, projectId, sourceUserId, sourcePeerId })
 */
export function buildAgileSyncPayload({
  items,
  projectId,
  sourceUserId,
  sourcePeerId,
}) {
  const list = Array.isArray(items) ? items : []
  const normalizedItems = list.map(normalizeAgileWorkItem).filter(Boolean)
 
  const syncId = `${sourceUserId || 'unknown'}-${nowMs()}-${Math.random()
    .toString(36)
    .slice(2)}`
 
  return {
    type: 'TASK_SYNC',
    action: 'task-sync',
    projectId: projectId ?? null,
    sourceUserId: sourceUserId ?? null,
    sourcePeerId: sourcePeerId ?? null,
    syncId,
    sentAt: nowMs(),
    items: normalizedItems,
  }
}
 
/**
 * shouldIgnoreIncomingSync(payload, currentUserId, seenSyncIds)
 */
export function shouldIgnoreIncomingSync(payload, currentUserId, seenSyncIds) {
  if (!payload) return true
  const items = extractAgileItemsFromSyncMessage(payload)
  if (!Array.isArray(items) || items.length === 0) return true
  if (payload.sourceUserId && currentUserId && payload.sourceUserId === currentUserId)
    return true
  const syncId = payload.syncId ?? payload.payload?.syncId ?? null
  if (syncId && seenSyncIds) {
    // Supports either:
    // - a Set-like object with .has(syncId), or
    // - a function hasSeenSync(syncId) => boolean
    if (typeof seenSyncIds === 'function') {
      if (seenSyncIds(syncId)) return true
    } else if (typeof seenSyncIds.has === 'function') {
      if (seenSyncIds.has(syncId)) return true
    }
  }
  return false
}
 
/**
 * extractAgileItemsFromSyncMessage(message)
 * Supports:
 * - message.items
 * - message.tasks
 * - message.payload.items
 * - message.payload.tasks
 */
export function extractAgileItemsFromSyncMessage(message) {
  if (!message) return []
  const direct =
    message.items ??
    message.tasks ??
    message?.payload?.items ??
    message?.payload?.tasks ??
    []
  return Array.isArray(direct) ? direct : []
}

