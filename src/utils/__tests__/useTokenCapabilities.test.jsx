import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../tokenEconomics/tokenProfileStorage.js', () => ({ getTokenProfile: vi.fn() }))
vi.mock('../tokenEconomics/tokenTierLoader.js', () => ({
  loadTokenTiersFromOntology: vi.fn(async () => null),
}))

import { getTokenProfile } from '../tokenEconomics/tokenProfileStorage.js'
import { useTokenCapabilities } from '../tokenEconomics/useTokenCapabilities.js'

describe('useTokenCapabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getTokenProfile.mockReturnValue({ tokenBalance: 0, tier: 'FREE' })
  })

  it('FREE tier returns roadmap, release, and premium analytics disabled', () => {
    getTokenProfile.mockReturnValue({ tokenBalance: 0, tier: 'FREE' })

    const { result } = renderHook(() => useTokenCapabilities())

    expect(result.current.canManageRoadmap).toBe(false)
    expect(result.current.canManageReleases).toBe(false)
    expect(result.current.premiumAnalytics).toBe(false)
  })

  it('PLUS tier returns premium analytics and advanced sprint metrics enabled but roadmap disabled', () => {
    getTokenProfile.mockReturnValue({ tokenBalance: 10, tier: 'PLUS' })

    const { result } = renderHook(() => useTokenCapabilities())

    expect(result.current.premiumAnalytics).toBe(true)
    expect(result.current.canManageRoadmap).toBe(false)
    expect(result.current.advancedSprintMetrics).toBe(true)
  })

  it('PREMIUM tier returns roadmap, release, and cross-project analytics enabled', () => {
    getTokenProfile.mockReturnValue({ tokenBalance: 50, tier: 'PREMIUM' })

    const { result } = renderHook(() => useTokenCapabilities())

    expect(result.current.canManageRoadmap).toBe(true)
    expect(result.current.canManageReleases).toBe(true)
    expect(result.current.crossProjectAnalytics).toBe(true)
  })

  it("dispatching 'zc-quota-changed' causes the hook to re-read and return updated values", () => {
    const { result } = renderHook(() => useTokenCapabilities())
    expect(result.current.canManageRoadmap).toBe(false)

    getTokenProfile.mockReturnValue({ tokenBalance: 50, tier: 'PREMIUM' })
    act(() => window.dispatchEvent(new CustomEvent('zc-quota-changed')))

    expect(result.current.canManageRoadmap).toBe(true)
    expect(result.current.canManageReleases).toBe(true)
  })

  it("'storage' event causes the hook to re-read", () => {
    const { result } = renderHook(() => useTokenCapabilities())
    expect(result.current.premiumAnalytics).toBe(false)

    getTokenProfile.mockReturnValue({ tokenBalance: 10, tier: 'PLUS' })
    act(() => window.dispatchEvent(new StorageEvent('storage')))

    expect(result.current.premiumAnalytics).toBe(true)
    expect(result.current.advancedSprintMetrics).toBe(true)
  })

  it('visibilitychange event while visible causes the hook to re-read', () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
    const { result } = renderHook(() => useTokenCapabilities())
    expect(result.current.crossProjectAnalytics).toBe(false)

    getTokenProfile.mockReturnValue({ tokenBalance: 50, tier: 'PREMIUM' })
    act(() => document.dispatchEvent(new Event('visibilitychange')))

    expect(result.current.crossProjectAnalytics).toBe(true)
  })

  it('returns tierKey and balance fields', () => {
    getTokenProfile.mockReturnValue({ tokenBalance: 10, tier: 'PLUS' })

    const { result } = renderHook(() => useTokenCapabilities())

    expect(result.current.tierKey).toBe('PLUS')
    expect(result.current.balance).toBe(10)
  })
})
