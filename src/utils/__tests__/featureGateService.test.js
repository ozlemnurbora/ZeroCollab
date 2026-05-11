import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../tokenEconomics/tokenProfileStorage.js', () => ({
  getTokenProfile: vi.fn(),
}))

import { getTokenProfile } from '../tokenEconomics/tokenProfileStorage.js'
import {
  getFeatureUpgradeMessage,
  hasFeatureAccess,
  requireFeatureAccess,
} from '../tokenEconomics/featureGateService.js'

describe('hasFeatureAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('FREE tier (balance 0) does NOT have aiPriority access', () => {
    getTokenProfile.mockReturnValue({ tokenBalance: 0, tier: 'FREE' })
    expect(hasFeatureAccess('aiPriority')).toBe(false)
  })

  it('PLUS tier (balance 10) HAS aiPriority access', () => {
    getTokenProfile.mockReturnValue({ tokenBalance: 10, tier: 'PLUS' })
    expect(hasFeatureAccess('aiPriority')).toBe(true)
  })

  it('FREE tier does NOT have roadmapAccess', () => {
    getTokenProfile.mockReturnValue({ tokenBalance: 0, tier: 'FREE' })
    expect(hasFeatureAccess('roadmapAccess')).toBe(false)
  })

  it('PLUS tier does NOT have roadmapAccess', () => {
    getTokenProfile.mockReturnValue({ tokenBalance: 10, tier: 'PLUS' })
    expect(hasFeatureAccess('roadmapAccess')).toBe(false)
  })

  it('PREMIUM tier (balance 50) HAS roadmapAccess', () => {
    getTokenProfile.mockReturnValue({ tokenBalance: 50, tier: 'PREMIUM' })
    expect(hasFeatureAccess('roadmapAccess')).toBe(true)
  })

  it('FREE tier does NOT have premiumAnalytics', () => {
    getTokenProfile.mockReturnValue({ tokenBalance: 0, tier: 'FREE' })
    expect(hasFeatureAccess('premiumAnalytics')).toBe(false)
  })

  it('PLUS tier HAS premiumAnalytics', () => {
    getTokenProfile.mockReturnValue({ tokenBalance: 10, tier: 'PLUS' })
    expect(hasFeatureAccess('premiumAnalytics')).toBe(true)
  })

  it('PREMIUM tier HAS premiumAnalytics', () => {
    getTokenProfile.mockReturnValue({ tokenBalance: 50, tier: 'PREMIUM' })
    expect(hasFeatureAccess('premiumAnalytics')).toBe(true)
  })
})

describe('requireFeatureAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns { ok: true } when tier has access', () => {
    getTokenProfile.mockReturnValue({ tokenBalance: 50, tier: 'PREMIUM' })
    expect(requireFeatureAccess('roadmapAccess')).toEqual({ ok: true })
  })

  it('returns { ok: false, message } when tier lacks access', () => {
    getTokenProfile.mockReturnValue({ tokenBalance: 0, tier: 'FREE' })
    const result = requireFeatureAccess('aiPriority')
    expect(result.ok).toBe(false)
    expect(typeof result.message).toBe('string')
    expect(result.message.length).toBeGreaterThan(0)
  })

  it("message contains 'Premium' for roadmapAccess (premium-only feature)", () => {
    getTokenProfile.mockReturnValue({ tokenBalance: 0, tier: 'FREE' })
    const result = requireFeatureAccess('roadmapAccess')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Premium')
  })

  it("message contains 'Plus or Premium' for aiPriority (plus+ feature)", () => {
    getTokenProfile.mockReturnValue({ tokenBalance: 0, tier: 'FREE' })
    const result = requireFeatureAccess('aiPriority')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Plus or Premium')
  })
})

describe('getFeatureUpgradeMessage', () => {
  it("returns message mentioning '50 ZC' for premium-only features (roadmapAccess, releaseManagementAccess, crossProjectAnalytics)", () => {
    expect(getFeatureUpgradeMessage('roadmapAccess')).toContain('50 ZC')
    expect(getFeatureUpgradeMessage('releaseManagementAccess')).toContain('50 ZC')
    expect(getFeatureUpgradeMessage('crossProjectAnalytics')).toContain('50 ZC')
  })

  it("returns message mentioning '10 ZC' for plus+ features (others)", () => {
    expect(getFeatureUpgradeMessage('aiPriority')).toContain('10 ZC')
    expect(getFeatureUpgradeMessage('premiumAnalytics')).toContain('10 ZC')
    expect(getFeatureUpgradeMessage('advancedSprintMetrics')).toContain('10 ZC')
    expect(getFeatureUpgradeMessage('exportReports')).toContain('10 ZC')
  })
})
