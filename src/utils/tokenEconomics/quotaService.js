import { getTierByBalance, getTierLimits } from './tokenTiers.js'
import { getQuotaUsage } from './quotaUsageStorage.js'
import { QUOTA_LABELS_EN } from './quotaRules.js'

const QUOTA_MSG_KEYS = {
  projects: 'te_quota_msg_projects',
  evaluations: 'te_quota_msg_evaluations',
  teamMembers: 'te_quota_msg_teamMembers',
}

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

export function getQuotaMessage(profile, quotaKey, t) {
  const state = getCurrentQuotaState(profile)
  const limit = getQuotaLimitForKey(state.limits, quotaKey)
  const tierLabel = state.tier?.label || state.tierKey
  const msgKey = QUOTA_MSG_KEYS[quotaKey]
  if (typeof t === 'function' && msgKey) {
    return t(msgKey, { tier: tierLabel, limit })
  }
  const label = QUOTA_LABELS_EN[quotaKey] || quotaKey
  return `${tierLabel} tier allows up to ${limit} ${label.toLowerCase()}. Hold more ZC tokens to unlock higher limits.`
}

