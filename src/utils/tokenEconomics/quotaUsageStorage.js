const STORAGE_KEY = 'zc-quota-usage-v1'

const DEFAULT_USAGE = {
  projects: 0,
  evaluations: 0,
  teamMembers: 0,
}

export function getQuotaUsage() {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_USAGE }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_USAGE }
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_USAGE, ...(parsed || {}) }
  } catch {
    return { ...DEFAULT_USAGE }
  }
}

export function saveQuotaUsage(usage) {
  if (typeof localStorage === 'undefined') return
  const next = { ...DEFAULT_USAGE, ...(usage || {}) }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}

export function incrementQuotaUsage(key, amount = 1) {
  const usage = getQuotaUsage()
  const inc = Number(amount)
  const safeInc = Number.isFinite(inc) ? inc : 1
  const current = Number(usage[key])
  const safeCurrent = Number.isFinite(current) ? current : 0
  const next = { ...usage, [key]: Math.max(0, safeCurrent + safeInc) }
  saveQuotaUsage(next)
  return next
}

export function resetQuotaUsage() {
  saveQuotaUsage(DEFAULT_USAGE)
  return { ...DEFAULT_USAGE }
}

export { DEFAULT_USAGE }

