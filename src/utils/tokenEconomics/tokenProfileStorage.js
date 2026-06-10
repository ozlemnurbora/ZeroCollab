const STORAGE_PREFIX = 'zc-token-profile-v1'
let activeUserId = null

const DEFAULT_PROFILE = {
  hederaAccountId: '',
  tokenId: '',
  tokenBalance: 0,
  tier: 'FREE',
  lastCheckedAt: null,
}

export function setTokenProfileUser(userId) {
  activeUserId = userId || null
}

function storageKey() {
  return `${STORAGE_PREFIX}::${activeUserId || 'anon'}`
}

export function getTokenProfile() {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_PROFILE }
  try {
    const raw = localStorage.getItem(storageKey())
    if (!raw) return { ...DEFAULT_PROFILE }
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_PROFILE, ...(parsed || {}) }
  } catch {
    return { ...DEFAULT_PROFILE }
  }
}

export function saveTokenProfile(profile) {
  if (typeof localStorage === 'undefined') return
  const next = { ...DEFAULT_PROFILE, ...(profile || {}) }
  try {
    localStorage.setItem(storageKey(), JSON.stringify(next))
  } catch {
    // ignore storage failures (private mode / quota / etc.)
  }
}

export function clearTokenProfile() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(storageKey())
  } catch {
    // ignore
  }
}

export { DEFAULT_PROFILE }

