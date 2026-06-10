import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_PROFILE,
  clearTokenProfile,
  getTokenProfile,
  saveTokenProfile,
  setTokenProfileUser,
} from '../tokenEconomics/tokenProfileStorage.js'

const STORAGE_KEY = 'zc-token-profile-v1::anon'

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

describe('tokenProfileStorage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock())
    setTokenProfileUser(null)
  })

  it('getTokenProfile returns DEFAULT_PROFILE when localStorage is empty', () => {
    expect(getTokenProfile()).toEqual(DEFAULT_PROFILE)
  })

  it('saveTokenProfile writes to the anonymous scoped key', () => {
    saveTokenProfile({ tokenBalance: 50, tier: 'PREMIUM' })

    expect(localStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_PROFILE, tokenBalance: 50, tier: 'PREMIUM' }),
    )
  })

  it('scopes token profiles per active user', () => {
    setTokenProfileUser('user-a')
    saveTokenProfile({ tokenBalance: 50, tier: 'PREMIUM' })

    setTokenProfileUser('user-b')
    expect(getTokenProfile()).toEqual(DEFAULT_PROFILE)
    saveTokenProfile({ tokenBalance: 10, tier: 'PLUS' })

    setTokenProfileUser('user-a')
    expect(getTokenProfile()).toEqual({
      ...DEFAULT_PROFILE,
      tokenBalance: 50,
      tier: 'PREMIUM',
    })

    setTokenProfileUser('user-b')
    expect(getTokenProfile()).toEqual({
      ...DEFAULT_PROFILE,
      tokenBalance: 10,
      tier: 'PLUS',
    })
  })

  it('clearTokenProfile clears only the active user profile', () => {
    setTokenProfileUser('user-a')
    saveTokenProfile({ tokenBalance: 50, tier: 'PREMIUM' })
    setTokenProfileUser('user-b')
    saveTokenProfile({ tokenBalance: 10, tier: 'PLUS' })

    clearTokenProfile()

    expect(getTokenProfile()).toEqual(DEFAULT_PROFILE)
    setTokenProfileUser('user-a')
    expect(getTokenProfile()).toEqual({
      ...DEFAULT_PROFILE,
      tokenBalance: 50,
      tier: 'PREMIUM',
    })
  })
})
