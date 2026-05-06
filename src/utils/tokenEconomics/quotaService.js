import { getTierByBalance, getTierLimits } from './tokenTiers.js'
import { getQuotaUsage } from './quotaUsageStorage.js'
import { QUOTA_LABELS } from './quotaRules.js'

function getQuotaLimitForKey(limits, quotaKey) {
  if (!limits) return 0
  if (quotaKey === 'projects') return limits.projectLimit
  if (quotaKey === 'evaluations') return limits.evaluationLimit
  if (quotaKey === 'teamMembers') return limits.teamMemberLimit
  return 0
}

export function getCurrentQuotaState(profile) {
  const balance = profile?.tokenBalance ?? 0
  const tierKey = profile?.tier || getTierByBalance(balance)
  const tier = getTierLimits(tierKey)
  const usage = getQuotaUsage()

  return {
    tierKey,
    tier,
    limits: tier,
    usage,
  }
}

export function canUseQuota(profile, quotaKey) {
  const state = getCurrentQuotaState(profile)
  const used = Number(state.usage?.[quotaKey] ?? 0) || 0
  const limit = getQuotaLimitForKey(state.limits, quotaKey)
  return used < limit
}

export function getQuotaMessage(profile, quotaKey) {
  const state = getCurrentQuotaState(profile)
  const limit = getQuotaLimitForKey(state.limits, quotaKey)
  const label = QUOTA_LABELS[quotaKey] || quotaKey
  const tierLabel = state.tier?.label || state.tierKey
  return `${tierLabel} tier allows up to ${limit} ${label.toLowerCase()}. Hold more ZC tokens to unlock higher limits.`
}

