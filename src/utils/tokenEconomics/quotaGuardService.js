/**
 * App-level quota checks (local token profile + usage).
 * - Project create: WorkspaceContext.addProject (limit vs live `projects.length`)
 * - Project usage display/storage: synced from `WorkspaceContext.projects` via
 *   syncProjectsQuotaFromWorkspaceCount (not a monotonic create counter).
 * - AI evaluation: EvaluationPage after successful run
 * - Team member: InvitationsPanel (accept team invite, join with code) + TeamDetailModal (pre-check before sending invite)
 * To also gate project-only invites (ProjectDetailModal) or other join paths, call the same canAddTeamMember / recordTeamMemberAdded pattern there.
 */
import { getTokenProfile } from './tokenProfileStorage.js'
import { getTierByBalance, getTierLimits } from './tokenTiers.js'
import { canUseQuota } from './quotaService.js'
import {
  getQuotaUsage,
  incrementQuotaUsage,
  syncProjectsQuotaUsageToCount,
} from './quotaUsageStorage.js'
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

/**
 * Project quota gate.
 * - When `activeProjectCount` is provided (number), compares the live count of
 *   currently active/visible projects against the tier's project limit. This
 *   ensures deleting a project actually frees a slot (vs. relying on the
 *   monotonically-incrementing usage counter).
 * - When called with no argument the original counter-based behavior is used,
 *   so existing call sites continue to work unchanged.
 */
export function canCreateProject(activeProjectCount) {
  if (
    typeof activeProjectCount === 'number' &&
    Number.isFinite(activeProjectCount)
  ) {
    const limit = getProjectLimit()
    return Math.max(0, activeProjectCount) < limit
  }
  return canUseQuota(profileForQuota(), QUOTA_KEYS.projects)
}

/**
 * Resolve the current tier's project limit from the local Token Economics
 * profile. Pure read — no storage writes, no network calls.
 */
export function getProjectLimit() {
  const profile = profileForQuota()
  const tier = getTierLimits(profile.tier)
  return Number(tier?.projectLimit ?? 0) || 0
}

export function canRunEvaluation() {
  return canUseQuota(profileForQuota(), QUOTA_KEYS.evaluations)
}

export function canAddTeamMember() {
  return canUseQuota(profileForQuota(), QUOTA_KEYS.teamMembers)
}

/**
 * Keeps the scoped `zc-quota-usage-v1::{user}` projects counter aligned with the live workspace list.
 * Call when `WorkspaceContext.projects` changes or after auth state changes.
 */
export function syncProjectsQuotaFromWorkspaceCount(activeCount) {
  const prev = getQuotaUsage()
  const next = syncProjectsQuotaUsageToCount(activeCount)
  if (Number(prev.projects) !== Number(next.projects)) {
    notifyQuotaChanged()
  }
  return next
}

export function recordEvaluationRun() {
  incrementQuotaUsage(QUOTA_KEYS.evaluations, 1)
  notifyQuotaChanged()
}

export function recordTeamMemberAdded() {
  incrementQuotaUsage(QUOTA_KEYS.teamMembers, 1)
  notifyQuotaChanged()
}
