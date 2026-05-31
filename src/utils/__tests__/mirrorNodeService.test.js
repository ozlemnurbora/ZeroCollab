import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MirrorNodeError,
  fetchZcTokenBalance,
  isValidHederaAccountId,
} from '../tokenEconomics/mirrorNodeService.js'

function mockMirrorResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
  }
}

describe('mirrorNodeService', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it("isValidHederaAccountId('0.0.12345') returns true", () => {
    expect(isValidHederaAccountId('0.0.12345')).toBe(true)
  })

  it("isValidHederaAccountId('abc') returns false", () => {
    expect(isValidHederaAccountId('abc')).toBe(false)
  })

  it("isValidHederaAccountId('') returns false", () => {
    expect(isValidHederaAccountId('')).toBe(false)
  })

  it("fetchZcTokenBalance throws MirrorNodeError with code 'invalid_account' for bad account id", async () => {
    await expect(fetchZcTokenBalance('bad-account')).rejects.toMatchObject({
      name: 'MirrorNodeError',
      code: 'invalid_account',
    })
    await expect(fetchZcTokenBalance('bad-account')).rejects.toBeInstanceOf(MirrorNodeError)
  })

  it("fetchZcTokenBalance throws with code 'not_found' when fetch returns 404", async () => {
    fetch.mockResolvedValueOnce(mockMirrorResponse({}, { ok: false, status: 404 }))

    await expect(fetchZcTokenBalance('0.0.12345')).rejects.toMatchObject({
      code: 'not_found',
    })
  })

  it("fetchZcTokenBalance throws with code 'network_error' when fetch throws", async () => {
    fetch.mockRejectedValueOnce(new Error('offline'))

    await expect(fetchZcTokenBalance('0.0.12345')).rejects.toMatchObject({
      code: 'network_error',
    })
  })

  it('fetchZcTokenBalance returns no token state when tokens array is empty', async () => {
    fetch.mockResolvedValueOnce(mockMirrorResponse({ tokens: [] }))

    await expect(fetchZcTokenBalance('0.0.12345')).resolves.toMatchObject({
      hasToken: false,
      balance: 0,
    })
  })

  it('fetchZcTokenBalance divides raw balance by 10^decimals', async () => {
    fetch.mockResolvedValueOnce(
      mockMirrorResponse({ tokens: [{ token_id: '0.0.8904048', balance: '1500', decimals: 2 }] }),
    )

    await expect(fetchZcTokenBalance('0.0.12345')).resolves.toMatchObject({
      hasToken: true,
      raw: 1500,
      decimals: 2,
      balance: 15,
    })
  })

  it('fetchZcTokenBalance falls back to token info endpoint when decimals are missing from row', async () => {
    fetch
      .mockResolvedValueOnce(
        mockMirrorResponse({ tokens: [{ token_id: '0.0.8904048', balance: '1500' }] }),
      )
      .mockResolvedValueOnce(mockMirrorResponse({ decimals: 2 }))

    await expect(fetchZcTokenBalance('0.0.12345')).resolves.toMatchObject({
      hasToken: true,
      raw: 1500,
      decimals: 2,
      balance: 15,
    })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('fetchZcTokenBalance returns hasToken true when token row is present', async () => {
    fetch.mockResolvedValueOnce(
      mockMirrorResponse({ tokens: [{ token_id: '0.0.8904048', balance: '1', decimals: 0 }] }),
    )

    await expect(fetchZcTokenBalance('0.0.12345')).resolves.toMatchObject({
      hasToken: true,
    })
  })
})
