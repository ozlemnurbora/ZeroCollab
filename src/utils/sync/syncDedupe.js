const MAX = 100
/** @type {Set<string>} */
const seen = new Set()
/** @type {string[]} */
const order = []

export function hasSeenSync(syncId) {
  if (!syncId) return false
  return seen.has(String(syncId))
}

export function markSyncSeen(syncId) {
  if (!syncId) return
  const id = String(syncId)
  if (seen.has(id)) return
  seen.add(id)
  order.push(id)
  while (order.length > MAX) {
    const oldest = order.shift()
    if (oldest) seen.delete(oldest)
  }
}

