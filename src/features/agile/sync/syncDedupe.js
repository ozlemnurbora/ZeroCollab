/**
 * This central sync engine is used to keep Product Backlog, Roadmap, Sprint, and Task views consistent over P2P/Hub/IndexedDB.
 */
 
const MAX = 100
/** @type {string[]} */
let order = []
/** @type {Set<string>} */
let seen = new Set()
 
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
  if (order.length > MAX) {
    const overflow = order.length - MAX
    const toDrop = order.slice(0, overflow)
    order = order.slice(overflow)
    for (const old of toDrop) {
      seen.delete(old)
    }
  }
}
 
export function resetSeenSyncs() {
  order = []
  seen = new Set()
}

