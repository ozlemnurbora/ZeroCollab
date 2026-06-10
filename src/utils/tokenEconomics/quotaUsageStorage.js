const STORAGE_PREFIX = 'zc-quota-usage-v1'
let activeUserId = null

const DEFAULT_USAGE = {
  projects: 0,
  evaluations: 0,
  teamMembers: 0,
}

export function setQuotaUsageUser(userId) {
  activeUserId = userId || null
}

function storageKey() {
  return `${STORAGE_PREFIX}::${activeUserId || 'anon'}`
}

export function getQuotaUsage() {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_USAGE }
  try {
    const raw = localStorage.getItem(storageKey())
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
    localStorage.setItem(storageKey(), JSON.stringify(next))
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

/**
 * Set the Projects quota counter to the number of active workspace projects.
 * Project usage is not incremented on create anymore — it mirrors the same
 * list the sidebar uses (`WorkspaceContext.projects`).
 */
export function syncProjectsQuotaUsageToCount(activeCount) {
  const usage = getQuotaUsage()
  const n = Math.max(0, Number(activeCount) || 0)
  const current = Number(usage.projects)
  const safeCurrent = Number.isFinite(current) ? current : 0
  if (safeCurrent === n) return usage
  const next = { ...usage, projects: n }
  saveQuotaUsage(next)
  return next
}

/**
 * Reset evaluation / team counters. Optionally set `projects` to the current
 * active workspace count so the Projects row stays truthful after reset.
 */
export function resetQuotaUsage(options = {}) {
  const activeProjectCount = options.activeProjectCount
  const next = { ...DEFAULT_USAGE }
  if (
    typeof activeProjectCount === 'number' &&
    Number.isFinite(activeProjectCount)
  ) {
    next.projects = Math.max(0, activeProjectCount)
  }
  saveQuotaUsage(next)
  return getQuotaUsage()
}

export { DEFAULT_USAGE }

