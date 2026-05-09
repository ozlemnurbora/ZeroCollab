import { useEffect, useState } from 'react'
import { getTokenProfile } from './tokenProfileStorage.js'
import { getTierByBalance, getTierLimits } from './tokenTiers.js'

/**
 * Resolve the active tier from the local token profile.
 * Same logic the rest of Token Economics uses, hoisted so feature gates
 * stay consistent (no Mirror Node / wallet — local config only).
 */
function resolveActiveTier() {
  const profile = getTokenProfile() || {}
  const raw = Number(profile.tokenBalance)
  const balance = Number.isFinite(raw) ? Math.max(0, raw) : 0
  const tierKey = profile.tier || getTierByBalance(balance)
  const tier = getTierLimits(tierKey)
  return { profile, tierKey, tier, balance }
}

/**
 * Reactive token-capability hook. Re-reads when:
 * - the Token Economics page fires `zc-quota-changed`
 * - localStorage is updated (multi-tab)
 * - tab visibility flips back to visible
 *
 * Returns: { canManageRoadmap, canManageReleases, advancedSprintMetrics,
 *           crossProjectAnalytics, exportReports, premiumAnalytics,
 *           tierKey, tier, balance }
 */
export function useTokenCapabilities() {
  const [snapshot, setSnapshot] = useState(() => resolveActiveTier())

  useEffect(() => {
    if (typeof window === 'undefined') return
    const refresh = () => setSnapshot(resolveActiveTier())
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('zc-quota-changed', refresh)
    window.addEventListener('storage', refresh)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('zc-quota-changed', refresh)
      window.removeEventListener('storage', refresh)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  const tier = snapshot.tier || {}
  return {
    canManageRoadmap: !!tier.roadmapAccess,
    canManageReleases: !!tier.releaseManagementAccess,
    advancedSprintMetrics: !!tier.advancedSprintMetrics,
    crossProjectAnalytics: !!tier.crossProjectAnalytics,
    exportReports: !!tier.exportReports,
    premiumAnalytics: !!tier.premiumAnalytics,
    tierKey: snapshot.tierKey,
    tier,
    balance: snapshot.balance,
  }
}
