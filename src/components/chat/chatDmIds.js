/** Normalized email for stable keys (lowercase, trimmed). */
export function normalizeChatEmail(email) {
  return String(email || '').trim().toLowerCase()
}

/**
 * Stable identity key for a user in DM routing.
 * Prefer user id; otherwise normalized email with safe slug suffix.
 */
export function participantKey(userId, email) {
  if (userId) return `uid_${String(userId)}`
  const em = normalizeChatEmail(email)
  if (!em) return ''
  return `em_${em.replace(/[^a-z0-9@._+-]/g, '_')}`
}

/**
 * Deterministic DM thread id for exactly two participants (same for both users).
 * Format: dm::<keyA>::<keyB> with keys sorted lexicographically.
 */
export function dmPairChannelId(selfUserId, selfEmail, otherUserId, otherEmail) {
  const a = participantKey(selfUserId, selfEmail)
  const b = participantKey(otherUserId, otherEmail)
  if (!a || !b || a === b) return ''
  const [x, y] = a < b ? [a, b] : [b, a]
  return `dm::${x}::${y}`
}

/** @returns {[string, string] | null} */
export function splitDmPairChannel(channelId) {
  if (!channelId?.startsWith('dm::')) return null
  const parts = channelId.split('::')
  if (parts.length !== 3 || parts[0] !== 'dm') return null
  return [parts[1], parts[2]]
}

export function userParticipatesInDmPair(channelId, selfUserId, selfEmail) {
  const keys = splitDmPairChannel(channelId)
  if (!keys) return false
  const selfKey = participantKey(selfUserId, selfEmail)
  return !!(selfKey && (keys[0] === selfKey || keys[1] === selfKey))
}

/**
 * Accept hub/P2P chat payloads only for channels this user may see.
 * Non-DM channels pass through. Legacy single-target dm:… ids are rejected (unsafe).
 */
export function shouldAcceptIncomingChatPayload(payload, selfUserId, selfEmail) {
  const cid = payload?.channelId
  if (!cid || typeof cid !== 'string') return true
  if (!cid.startsWith('dm:')) return true
  if (cid.startsWith('dm::')) {
    return userParticipatesInDmPair(cid, selfUserId, selfEmail)
  }
  return false
}
