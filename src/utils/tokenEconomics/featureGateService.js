import { getTokenProfile } from './tokenProfileStorage.js'
import { getTierByBalance, getTierLimits } from './tokenTiers.js'

/** Features that first unlock at Premium (50+ ZC). */
const PREMIUM_ONLY_FEATURES = new Set([
  'roadmapAccess',
  'releaseManagementAccess',
  'crossProjectAnalytics',
])

/**
 * Normalized profile + limits derived from token balance (single source of truth).
 */
export function getCurrentTokenProfile() {
  const p = getTokenProfile()
  const raw = Number(p.tokenBalance)
  const tokenBalance = Number.isFinite(raw) ? Math.max(0, raw) : 0
  const effectiveTierKey = getTierByBalance(tokenBalance)
  const tierLimits = getTierLimits(effectiveTierKey)
  return {
    ...p,
    tokenBalance,
    effectiveTierKey,
    tierLimits,
  }
}

export function hasFeatureAccess(featureKey) {
  const { tierLimits } = getCurrentTokenProfile()
  return Boolean(tierLimits?.[featureKey])
}

export function getFeatureUpgradeMessage(featureKey) {
  if (PREMIUM_ONLY_FEATURES.has(featureKey)) {
    return 'This feature requires Premium access. Hold at least 50 ZC tokens to unlock it.'
  }
  return 'This feature requires Plus or Premium access. Hold at least 10 ZC tokens to unlock it.'
}

/**
 * Use before gated UI or routes. Does not throw — returns { ok, message? }.
 */
export function requireFeatureAccess(featureKey) {
  if (hasFeatureAccess(featureKey)) return { ok: true }
  return { ok: false, message: getFeatureUpgradeMessage(featureKey) }
}

/**
 * For future route wrappers (roadmap, release, analytics).
 * Same behavior as requireFeatureAccess — alias for readability at call sites.
 */
export function guardPremiumRoute(featureKey) {
  return requireFeatureAccess(featureKey)
}
