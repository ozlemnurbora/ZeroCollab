import { describe, expect, it } from 'vitest'
import {
  TOKEN_TIERS,
  getTierByBalance,
  getTierLimits,
} from '../tokenEconomics/tokenTiers.js'

describe('getTierByBalance', () => {
  it("returns 'FREE' when balance is 0", () => {
    expect(getTierByBalance(0)).toBe('FREE')
  })

  it("returns 'FREE' when balance is 9 (just below PLUS threshold of 10)", () => {
    expect(getTierByBalance(9)).toBe('FREE')
  })

  it("returns 'PLUS' when balance is exactly 10", () => {
    expect(getTierByBalance(10)).toBe('PLUS')
  })

  it("returns 'PLUS' when balance is 49 (just below PREMIUM threshold of 50)", () => {
    expect(getTierByBalance(49)).toBe('PLUS')
  })

  it("returns 'PREMIUM' when balance is exactly 50", () => {
    expect(getTierByBalance(50)).toBe('PREMIUM')
  })

  it("returns 'PREMIUM' when balance is 1000 (well above threshold)", () => {
    expect(getTierByBalance(1000)).toBe('PREMIUM')
  })

  it("returns 'FREE' when balance is negative (-5)", () => {
    expect(getTierByBalance(-5)).toBe('FREE')
  })

  it("returns 'FREE' when balance is NaN", () => {
    expect(getTierByBalance(Number.NaN)).toBe('FREE')
  })

  it("returns 'FREE' when balance is undefined", () => {
    expect(getTierByBalance(undefined)).toBe('FREE')
  })

  it("returns 'FREE' when balance is a non-numeric string like 'abc'", () => {
    expect(getTierByBalance('abc')).toBe('FREE')
  })

  it("returns 'PLUS' when balance is string '25' (should parse numeric strings)", () => {
    expect(getTierByBalance('25')).toBe('PLUS')
  })
})

describe('getTierLimits', () => {
  it("returns FREE tier config when key is 'FREE'", () => {
    expect(getTierLimits('FREE')).toBe(TOKEN_TIERS.FREE)
  })

  it("returns PLUS tier config when key is 'PLUS'", () => {
    expect(getTierLimits('PLUS')).toBe(TOKEN_TIERS.PLUS)
  })

  it("returns PREMIUM tier config when key is 'PREMIUM'", () => {
    expect(getTierLimits('PREMIUM')).toBe(TOKEN_TIERS.PREMIUM)
  })

  it("returns FREE tier config as fallback for unknown key like 'GOLD'", () => {
    expect(getTierLimits('GOLD')).toBe(TOKEN_TIERS.FREE)
  })

  it('FREE tier has projectLimit of 2, evaluationLimit of 3, teamMemberLimit of 5', () => {
    const free = getTierLimits('FREE')
    expect(free.projectLimit).toBe(2)
    expect(free.evaluationLimit).toBe(3)
    expect(free.teamMemberLimit).toBe(5)
  })

  it('PLUS tier has projectLimit of 5, evaluationLimit of 15, teamMemberLimit of 15', () => {
    const plus = getTierLimits('PLUS')
    expect(plus.projectLimit).toBe(5)
    expect(plus.evaluationLimit).toBe(15)
    expect(plus.teamMemberLimit).toBe(15)
  })

  it('PREMIUM tier has projectLimit of 20, evaluationLimit of 100, teamMemberLimit of 50', () => {
    const premium = getTierLimits('PREMIUM')
    expect(premium.projectLimit).toBe(20)
    expect(premium.evaluationLimit).toBe(100)
    expect(premium.teamMemberLimit).toBe(50)
  })

  it('FREE tier has aiPriority false, PLUS has aiPriority true', () => {
    expect(getTierLimits('FREE').aiPriority).toBe(false)
    expect(getTierLimits('PLUS').aiPriority).toBe(true)
  })

  it('PREMIUM has roadmapAccess true, FREE and PLUS have roadmapAccess false', () => {
    expect(getTierLimits('PREMIUM').roadmapAccess).toBe(true)
    expect(getTierLimits('FREE').roadmapAccess).toBe(false)
    expect(getTierLimits('PLUS').roadmapAccess).toBe(false)
  })
})
