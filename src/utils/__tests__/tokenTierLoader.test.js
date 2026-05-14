import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadTokenTiersFromOntology } from '../tokenEconomics/tokenTierLoader.js'

const SAMPLE_TTL = `
@prefix zct: <http://zerocollab.2025.2/token#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .

zct:FreeTier a zct:TokenTier ;
    zct:tierKey "FREE" ;
    zct:tierLabel "Free" ;
    zct:minBalance "0" ;
    zct:projectLimit "2" ;
    zct:evaluationLimit "3" ;
    zct:teamMemberLimit "5" ;
    zct:aiPriority "false" ;
    zct:premiumAnalytics "false" ;
    zct:roadmapAccess "false" ;
    zct:releaseManagementAccess "false" ;
    zct:advancedSprintMetrics "false" ;
    zct:exportReports "false" ;
    zct:crossProjectAnalytics "false" .

zct:PlusTier a zct:TokenTier ;
    zct:tierKey "PLUS" ;
    zct:tierLabel "Plus" ;
    zct:minBalance "10" ;
    zct:projectLimit "5" ;
    zct:evaluationLimit "15" ;
    zct:teamMemberLimit "15" ;
    zct:aiPriority "true" ;
    zct:premiumAnalytics "true" ;
    zct:roadmapAccess "false" ;
    zct:releaseManagementAccess "false" ;
    zct:advancedSprintMetrics "true" ;
    zct:exportReports "true" ;
    zct:crossProjectAnalytics "false" .

zct:PremiumTier a zct:TokenTier ;
    zct:tierKey "PREMIUM" ;
    zct:tierLabel "Premium" ;
    zct:minBalance "50" ;
    zct:projectLimit "20" ;
    zct:evaluationLimit "100" ;
    zct:teamMemberLimit "50" ;
    zct:aiPriority "true" ;
    zct:premiumAnalytics "true" ;
    zct:roadmapAccess "true" ;
    zct:releaseManagementAccess "true" ;
    zct:advancedSprintMetrics "true" ;
    zct:exportReports "true" ;
    zct:crossProjectAnalytics "true" .
`

const TTL_PLUS_PREMIUM_ONLY = `
@prefix zct: <http://zerocollab.2025.2/token#> .

zct:PlusTier a zct:TokenTier ;
    zct:tierKey "PLUS" ;
    zct:tierLabel "Plus" ;
    zct:minBalance "10" ;
    zct:projectLimit "5" ;
    zct:evaluationLimit "15" ;
    zct:teamMemberLimit "15" ;
    zct:aiPriority "true" ;
    zct:premiumAnalytics "true" ;
    zct:roadmapAccess "false" ;
    zct:releaseManagementAccess "false" ;
    zct:advancedSprintMetrics "true" ;
    zct:exportReports "true" ;
    zct:crossProjectAnalytics "false" .

zct:PremiumTier a zct:TokenTier ;
    zct:tierKey "PREMIUM" ;
    zct:tierLabel "Premium" ;
    zct:minBalance "50" ;
    zct:projectLimit "20" ;
    zct:evaluationLimit "100" ;
    zct:teamMemberLimit "50" ;
    zct:aiPriority "true" ;
    zct:premiumAnalytics "true" ;
    zct:roadmapAccess "true" ;
    zct:releaseManagementAccess "true" ;
    zct:advancedSprintMetrics "true" ;
    zct:exportReports "true" ;
    zct:crossProjectAnalytics "true" .
`

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('loadTokenTiersFromOntology', () => {
  it('successfully parses all three tiers from TTL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: () => Promise.resolve(SAMPLE_TTL) }))
    const tiers = await loadTokenTiersFromOntology()
    expect(tiers).not.toBeNull()
    expect(Object.keys(tiers)).toEqual(expect.arrayContaining(['FREE', 'PLUS', 'PREMIUM']))
  })

  it('FREE tier has correct limits', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: () => Promise.resolve(SAMPLE_TTL) }))
    const tiers = await loadTokenTiersFromOntology()
    expect(tiers.FREE.projectLimit).toBe(2)
    expect(tiers.FREE.evaluationLimit).toBe(3)
    expect(tiers.FREE.teamMemberLimit).toBe(5)
    expect(tiers.FREE.minBalance).toBe(0)
  })

  it('PLUS tier has correct limits', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: () => Promise.resolve(SAMPLE_TTL) }))
    const tiers = await loadTokenTiersFromOntology()
    expect(tiers.PLUS.projectLimit).toBe(5)
    expect(tiers.PLUS.evaluationLimit).toBe(15)
    expect(tiers.PLUS.minBalance).toBe(10)
  })

  it('PREMIUM tier has correct limits', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: () => Promise.resolve(SAMPLE_TTL) }))
    const tiers = await loadTokenTiersFromOntology()
    expect(tiers.PREMIUM.projectLimit).toBe(20)
    expect(tiers.PREMIUM.evaluationLimit).toBe(100)
    expect(tiers.PREMIUM.minBalance).toBe(50)
  })

  it('FREE tier has aiPriority false, PLUS has aiPriority true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: () => Promise.resolve(SAMPLE_TTL) }))
    const tiers = await loadTokenTiersFromOntology()
    expect(tiers.FREE.aiPriority).toBe(false)
    expect(tiers.PLUS.aiPriority).toBe(true)
  })

  it('PREMIUM tier has roadmapAccess true, FREE and PLUS have false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: () => Promise.resolve(SAMPLE_TTL) }))
    const tiers = await loadTokenTiersFromOntology()
    expect(tiers.PREMIUM.roadmapAccess).toBe(true)
    expect(tiers.FREE.roadmapAccess).toBe(false)
    expect(tiers.PLUS.roadmapAccess).toBe(false)
  })

  it('each tier has a label property', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: () => Promise.resolve(SAMPLE_TTL) }))
    const tiers = await loadTokenTiersFromOntology()
    expect(tiers.FREE.label).toBe('Free')
    expect(tiers.PLUS.label).toBe('Plus')
    expect(tiers.PREMIUM.label).toBe('Premium')
  })

  it('returns null when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    expect(await loadTokenTiersFromOntology()).toBeNull()
  })

  it('returns null when TTL has no TokenTier entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ text: () => Promise.resolve('@prefix zct: <...> .\n') }),
    )
    expect(await loadTokenTiersFromOntology()).toBeNull()
  })

  it('returns null when TTL is missing FREE tier (validation check)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: () => Promise.resolve(TTL_PLUS_PREMIUM_ONLY) }))
    expect(await loadTokenTiersFromOntology()).toBeNull()
  })
})
