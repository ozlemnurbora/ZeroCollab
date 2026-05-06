/**
 * App-level quota checks (local token profile + usage).
 * - Project create: WorkspaceContext.addProject
 * - AI evaluation: EvaluationPage after successful run
 * - Team member: InvitationsPanel (accept team invite, join with code) + TeamDetailModal (pre-check before sending invite)
 * To also gate project-only invites (ProjectDetailModal) or other join paths, call the same canAddTeamMember / recordTeamMemberAdded pattern there.
 */
import { getTokenProfile } from './tokenProfileStorage.js'
import { getTierByBalance } from './tokenTiers.js'
import { canUseQuota } from './quotaService.js'
import { incrementQuotaUsage } from './quotaUsageStorage.js'
import { QUOTA_KEYS } from './quotaRules.js'

function profileForQuota() {
  const p = getTokenProfile()
  const raw = Number(p.tokenBalance)
  const tokenBalance = Number.isFinite(raw) ? Math.max(0, raw) : 0
  const tierKey = p.tier || getTierByBalance(tokenBalance)
  return { ...p, tokenBalance, tier: tierKey }
}

function notifyQuotaChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('zc-quota-changed'))
}

export function canCreateProject() {
  return canUseQuota(profileForQuota(), QUOTA_KEYS.projects)
}

export function canRunEvaluation() {
  return canUseQuota(profileForQuota(), QUOTA_KEYS.evaluations)
}

export function canAddTeamMember() {
  return canUseQuota(profileForQuota(), QUOTA_KEYS.teamMembers)
}

export function recordProjectCreated() {
  incrementQuotaUsage(QUOTA_KEYS.projects, 1)
  notifyQuotaChanged()
}

export function recordEvaluationRun() {
  incrementQuotaUsage(QUOTA_KEYS.evaluations, 1)
  notifyQuotaChanged()
}

export function recordTeamMemberAdded() {
  incrementQuotaUsage(QUOTA_KEYS.teamMembers, 1)
  notifyQuotaChanged()
}
