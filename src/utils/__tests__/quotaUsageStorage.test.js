import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_USAGE,
  getQuotaUsage,
  incrementQuotaUsage,
  resetQuotaUsage,
  saveQuotaUsage,
  setQuotaUsageUser,
  syncProjectsQuotaUsageToCount,
} from '../tokenEconomics/quotaUsageStorage.js'

const STORAGE_KEY = 'zc-quota-usage-v1::anon'

function createLocalStorageMock() {
  const store = new Map()

  return {
    getItem: vi.fn((key) => (store.has(key) ? store.get(key) : null)),
    setItem: vi.fn((key, value) => {
      store.set(key, String(value))
    }),
    removeItem: vi.fn((key) => {
      store.delete(key)
    }),
    clear: vi.fn(() => {
      store.clear()
    }),
  }
}

describe('quotaUsageStorage', () => {
  let localStorageMock

  beforeEach(() => {
    localStorageMock = createLocalStorageMock()
    vi.stubGlobal('localStorage', localStorageMock)
    setQuotaUsageUser(null)
  })

  it('getQuotaUsage returns DEFAULT_USAGE when localStorage is empty', () => {
    expect(getQuotaUsage()).toEqual(DEFAULT_USAGE)
  })

  it('getQuotaUsage returns parsed data when key exists', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ projects: 2, evaluations: 4, teamMembers: 1 }),
    )

    expect(getQuotaUsage()).toEqual({
      projects: 2,
      evaluations: 4,
      teamMembers: 1,
    })
  })

  it('getQuotaUsage returns DEFAULT_USAGE on JSON parse error', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json')

    expect(getQuotaUsage()).toEqual(DEFAULT_USAGE)
  })

  it('saveQuotaUsage writes to localStorage correctly', () => {
    saveQuotaUsage({ projects: 1, evaluations: 2, teamMembers: 3 })

    expect(localStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify({ projects: 1, evaluations: 2, teamMembers: 3 }),
    )
  })

  it("incrementQuotaUsage('evaluations', 1) increments from 0 to 1", () => {
    const next = incrementQuotaUsage('evaluations', 1)

    expect(next).toEqual({ projects: 0, evaluations: 1, teamMembers: 0 })
    expect(getQuotaUsage()).toEqual(next)
  })

  it("incrementQuotaUsage('projects', 2) increments correctly", () => {
    const next = incrementQuotaUsage('projects', 2)

    expect(next).toEqual({ projects: 2, evaluations: 0, teamMembers: 0 })
    expect(getQuotaUsage()).toEqual(next)
  })

  it('incrementQuotaUsage with NaN amount uses safe increment of 1', () => {
    const next = incrementQuotaUsage('evaluations', Number.NaN)

    expect(next).toEqual({ projects: 0, evaluations: 1, teamMembers: 0 })
    expect(getQuotaUsage()).toEqual(next)
  })

  it('syncProjectsQuotaUsageToCount(3) sets projects to 3', () => {
    const next = syncProjectsQuotaUsageToCount(3)

    expect(next).toEqual({ projects: 3, evaluations: 0, teamMembers: 0 })
    expect(getQuotaUsage()).toEqual(next)
  })

  it('syncProjectsQuotaUsageToCount(3) called twice does not write again on same count', () => {
    syncProjectsQuotaUsageToCount(3)
    localStorage.setItem.mockClear()

    const next = syncProjectsQuotaUsageToCount(3)

    expect(next).toEqual({ projects: 3, evaluations: 0, teamMembers: 0 })
    expect(localStorage.setItem).not.toHaveBeenCalled()
  })

  it('resetQuotaUsage resets to zeros', () => {
    saveQuotaUsage({ projects: 4, evaluations: 5, teamMembers: 6 })

    const next = resetQuotaUsage()

    expect(next).toEqual(DEFAULT_USAGE)
    expect(getQuotaUsage()).toEqual(DEFAULT_USAGE)
  })

  it('resetQuotaUsage({ activeProjectCount: 2 }) resets but keeps projects at 2', () => {
    saveQuotaUsage({ projects: 4, evaluations: 5, teamMembers: 6 })

    const next = resetQuotaUsage({ activeProjectCount: 2 })

    expect(next).toEqual({ projects: 2, evaluations: 0, teamMembers: 0 })
    expect(getQuotaUsage()).toEqual(next)
  })

  it('scopes quota usage per active user', () => {
    setQuotaUsageUser('user-a')
    saveQuotaUsage({ projects: 1, evaluations: 2, teamMembers: 3 })

    setQuotaUsageUser('user-b')
    expect(getQuotaUsage()).toEqual(DEFAULT_USAGE)
    saveQuotaUsage({ projects: 4, evaluations: 5, teamMembers: 6 })

    setQuotaUsageUser('user-a')
    expect(getQuotaUsage()).toEqual({ projects: 1, evaluations: 2, teamMembers: 3 })

    setQuotaUsageUser('user-b')
    expect(getQuotaUsage()).toEqual({ projects: 4, evaluations: 5, teamMembers: 6 })
  })
})
