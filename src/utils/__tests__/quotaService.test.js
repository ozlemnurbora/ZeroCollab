import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../tokenEconomics/quotaUsageStorage.js', () => ({
  getQuotaUsage: vi.fn(),
}))

import { getQuotaUsage } from '../tokenEconomics/quotaUsageStorage.js'
import {
  canUseQuota,
  getCurrentQuotaState,
  getQuotaMessage,
} from '../tokenEconomics/quotaService.js'

describe('canUseQuota', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('FREE tier, 0 projects used, can create project (limit is 2)', () => {
    getQuotaUsage.mockReturnValue({ projects: 0, evaluations: 0, teamMembers: 0 })
    expect(canUseQuota({ tokenBalance: 0, tier: 'FREE' }, 'projects')).toBe(true)
  })

  it('FREE tier, 2 projects used, CANNOT create project (at limit)', () => {
    getQuotaUsage.mockReturnValue({ projects: 2, evaluations: 0, teamMembers: 0 })
    expect(canUseQuota({ tokenBalance: 0, tier: 'FREE' }, 'projects')).toBe(false)
  })

  it('FREE tier, 1 project used, can still create (below limit)', () => {
    getQuotaUsage.mockReturnValue({ projects: 1, evaluations: 0, teamMembers: 0 })
    expect(canUseQuota({ tokenBalance: 0, tier: 'FREE' }, 'projects')).toBe(true)
  })

  it('PLUS tier, 4 projects used, can create (limit is 5)', () => {
    getQuotaUsage.mockReturnValue({ projects: 4, evaluations: 0, teamMembers: 0 })
    expect(canUseQuota({ tokenBalance: 10, tier: 'PLUS' }, 'projects')).toBe(true)
  })

  it('PLUS tier, 5 projects used, CANNOT create', () => {
    getQuotaUsage.mockReturnValue({ projects: 5, evaluations: 0, teamMembers: 0 })
    expect(canUseQuota({ tokenBalance: 10, tier: 'PLUS' }, 'projects')).toBe(false)
  })

  it('FREE tier, 3 evaluations used, CANNOT run evaluation (limit is 3)', () => {
    getQuotaUsage.mockReturnValue({ projects: 0, evaluations: 3, teamMembers: 0 })
    expect(canUseQuota({ tokenBalance: 0, tier: 'FREE' }, 'evaluations')).toBe(false)
  })

  it('PREMIUM tier, 99 evaluations used, CAN run evaluation (limit is 100)', () => {
    getQuotaUsage.mockReturnValue({ projects: 0, evaluations: 99, teamMembers: 0 })
    expect(canUseQuota({ tokenBalance: 50, tier: 'PREMIUM' }, 'evaluations')).toBe(true)
  })

  it('FREE tier, 5 team members, CANNOT add member (limit is 5)', () => {
    getQuotaUsage.mockReturnValue({ projects: 0, evaluations: 0, teamMembers: 5 })
    expect(canUseQuota({ tokenBalance: 0, tier: 'FREE' }, 'teamMembers')).toBe(false)
  })

  it('PLUS tier, 14 team members, CAN add member (limit is 15)', () => {
    getQuotaUsage.mockReturnValue({ projects: 0, evaluations: 0, teamMembers: 14 })
    expect(canUseQuota({ tokenBalance: 10, tier: 'PLUS' }, 'teamMembers')).toBe(true)
  })
})

describe('getQuotaMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getQuotaUsage.mockReturnValue({ projects: 0, evaluations: 0, teamMembers: 0 })
  })

  it('returns message containing tier label and limit number', () => {
    const msg = getQuotaMessage({ tokenBalance: 0, tier: 'FREE' }, 'projects')
    expect(msg).toContain('Free')
    expect(msg).toContain('2')
  })

  it("returns message with 'ZC tokens' hint", () => {
    const msg = getQuotaMessage({ tokenBalance: 0, tier: 'FREE' }, 'projects')
    expect(msg).toContain('ZC tokens')
  })

  it("PREMIUM tier message contains '100' for evaluations", () => {
    const msg = getQuotaMessage({ tokenBalance: 50, tier: 'PREMIUM' }, 'evaluations')
    expect(msg).toContain('100')
  })
})

describe('getCurrentQuotaState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getQuotaUsage.mockReturnValue({ projects: 1, evaluations: 2, teamMembers: 3 })
  })

  it('returns tierKey, tier, limits, and usage', () => {
    const state = getCurrentQuotaState({ tokenBalance: 0, tier: 'FREE' })
    expect(state.tierKey).toBe('FREE')
    expect(state.usage.projects).toBe(1)
    expect(state.limits.projectLimit).toBe(2)
  })

  it('determines tier from balance when tier field is missing', () => {
    const state = getCurrentQuotaState({ tokenBalance: 50 })
    expect(state.tierKey).toBe('PREMIUM')
  })
})
