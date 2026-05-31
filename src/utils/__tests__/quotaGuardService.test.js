import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../tokenEconomics/tokenProfileStorage.js', () => ({ getTokenProfile: vi.fn() }))
vi.mock('../tokenEconomics/tokenTierLoader.js', () => ({
  loadTokenTiersFromOntology: vi.fn(async () => null),
}))
vi.mock('../tokenEconomics/quotaUsageStorage.js', () => ({
  getQuotaUsage: vi.fn(),
  incrementQuotaUsage: vi.fn(),
  syncProjectsQuotaUsageToCount: vi.fn(),
}))

import { getTokenProfile } from '../tokenEconomics/tokenProfileStorage.js'
import {
  getQuotaUsage,
  incrementQuotaUsage,
  syncProjectsQuotaUsageToCount,
} from '../tokenEconomics/quotaUsageStorage.js'
import {
  canAddTeamMember,
  canCreateProject,
  canRunEvaluation,
  getProjectLimit,
  recordEvaluationRun,
  recordTeamMemberAdded,
  syncProjectsQuotaFromWorkspaceCount,
} from '../tokenEconomics/quotaGuardService.js'

describe('quotaGuardService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getTokenProfile.mockReturnValue({ tokenBalance: 0, tier: 'FREE' })
    getQuotaUsage.mockReturnValue({ projects: 0, evaluations: 0, teamMembers: 0 })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('canCreateProject returns true for FREE tier with 1 project used', () => {
    getQuotaUsage.mockReturnValue({ projects: 1, evaluations: 0, teamMembers: 0 })

    expect(canCreateProject()).toBe(true)
  })

  it('canCreateProject returns false for FREE tier with 2 projects used', () => {
    getQuotaUsage.mockReturnValue({ projects: 2, evaluations: 0, teamMembers: 0 })

    expect(canCreateProject()).toBe(false)
  })

  it('canCreateProject(activeProjectCount) returns true for 1 active project with limit 2', () => {
    expect(canCreateProject(1)).toBe(true)
  })

  it('canCreateProject(activeProjectCount) returns false for 2 active projects with limit 2', () => {
    expect(canCreateProject(2)).toBe(false)
  })

  it('getProjectLimit returns 2 for FREE, 5 for PLUS, and 20 for PREMIUM', () => {
    getTokenProfile.mockReturnValue({ tokenBalance: 0, tier: 'FREE' })
    expect(getProjectLimit()).toBe(2)

    getTokenProfile.mockReturnValue({ tokenBalance: 10, tier: 'PLUS' })
    expect(getProjectLimit()).toBe(5)

    getTokenProfile.mockReturnValue({ tokenBalance: 50, tier: 'PREMIUM' })
    expect(getProjectLimit()).toBe(20)
  })

  it('canRunEvaluation returns false at FREE limit and true below it', () => {
    getQuotaUsage.mockReturnValue({ projects: 0, evaluations: 3, teamMembers: 0 })
    expect(canRunEvaluation()).toBe(false)

    getQuotaUsage.mockReturnValue({ projects: 0, evaluations: 2, teamMembers: 0 })
    expect(canRunEvaluation()).toBe(true)
  })

  it('canAddTeamMember returns false at FREE limit and true below it', () => {
    getQuotaUsage.mockReturnValue({ projects: 0, evaluations: 0, teamMembers: 5 })
    expect(canAddTeamMember()).toBe(false)

    getQuotaUsage.mockReturnValue({ projects: 0, evaluations: 0, teamMembers: 4 })
    expect(canAddTeamMember()).toBe(true)
  })

  it("recordEvaluationRun calls incrementQuotaUsage('evaluations', 1) and dispatches zc-quota-changed", () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    recordEvaluationRun()

    expect(incrementQuotaUsage).toHaveBeenCalledWith('evaluations', 1)
    expect(dispatchSpy).toHaveBeenCalledTimes(1)
    expect(dispatchSpy.mock.calls[0][0].type).toBe('zc-quota-changed')
  })

  it("recordTeamMemberAdded calls incrementQuotaUsage('teamMembers', 1)", () => {
    recordTeamMemberAdded()

    expect(incrementQuotaUsage).toHaveBeenCalledWith('teamMembers', 1)
  })

  it('syncProjectsQuotaFromWorkspaceCount(3) calls syncProjectsQuotaUsageToCount(3)', () => {
    getQuotaUsage.mockReturnValue({ projects: 0, evaluations: 0, teamMembers: 0 })
    syncProjectsQuotaUsageToCount.mockReturnValue({
      projects: 3,
      evaluations: 0,
      teamMembers: 0,
    })

    syncProjectsQuotaFromWorkspaceCount(3)

    expect(syncProjectsQuotaUsageToCount).toHaveBeenCalledWith(3)
  })
})
