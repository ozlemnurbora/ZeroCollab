import {
  HEDERA_NETWORK,
  MIRROR_NODE_BASE_URL,
  ZC_TOKEN_ID,
} from './tokenConfig.js'

/**
 * Read-only Hedera Mirror Node helpers for the Token Economics page.
 * No wallet connection, no signing, no Hedera SDK — just public REST calls.
 *
 * Endpoint used:
 *   GET {MIRROR_NODE_BASE_URL}/api/v1/accounts/{accountId}/tokens?token.id={tokenId}&limit=1
 *   Response shape: { tokens: [{ token_id, balance, decimals, ... }] }
 *   `balance` is in the token's lowest denomination → divide by 10^decimals.
 *
 * Decimals fallback (when missing on the row, e.g. tier-1 mirror responses):
 *   GET {MIRROR_NODE_BASE_URL}/api/v1/tokens/{tokenId}
 */

const ACCOUNT_ID_RE = /^\d+\.\d+\.\d+$/

export class MirrorNodeError extends Error {
  constructor(message, code = 'mirror_error') {
    super(message)
    this.name = 'MirrorNodeError'
    this.code = code
  }
}

export function isValidHederaAccountId(value) {
  return ACCOUNT_ID_RE.test(String(value || '').trim())
}

function joinUrl(base, path) {
  const b = String(base || '').replace(/\/+$/, '')
  const p = String(path || '').replace(/^\/+/, '')
  return `${b}/${p}`
}

async function getJson(url, signal) {
  let res
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    })
  } catch (err) {
    throw new MirrorNodeError(
      `Network error contacting Mirror Node: ${err?.message || err}`,
      'network_error',
    )
  }
  if (!res.ok) {
    if (res.status === 404) {
      throw new MirrorNodeError('Account not found on this network.', 'not_found')
    }
    throw new MirrorNodeError(
      `Mirror Node responded ${res.status} ${res.statusText}`,
      'http_error',
    )
  }
  try {
    return await res.json()
  } catch {
    throw new MirrorNodeError('Invalid JSON from Mirror Node.', 'parse_error')
  }
}

async function fetchTokenDecimals(tokenId, signal) {
  const url = joinUrl(MIRROR_NODE_BASE_URL, `api/v1/tokens/${tokenId}`)
  const data = await getJson(url, signal)
  const d = Number(data?.decimals)
  return Number.isFinite(d) && d >= 0 ? d : 0
}

/**
 * Fetch the ZC balance (in whole-token units) for the given account.
 * Returns { balance, raw, decimals, tokenId, network, mirrorUrl, hasToken }.
 *  - balance: number in whole units (raw / 10^decimals)
 *  - hasToken: false when the account is not associated with the token
 */
export async function fetchZcTokenBalance(accountId, options = {}) {
  const { signal, tokenId = ZC_TOKEN_ID } = options
  const acct = String(accountId || '').trim()
  if (!isValidHederaAccountId(acct)) {
    throw new MirrorNodeError(
      'Invalid Hedera account ID. Expected format like 0.0.12345.',
      'invalid_account',
    )
  }
  if (!tokenId) {
    throw new MirrorNodeError(
      'ZC token id is not configured.',
      'missing_token_id',
    )
  }

  const url = joinUrl(
    MIRROR_NODE_BASE_URL,
    `api/v1/accounts/${acct}/tokens?token.id=${tokenId}&limit=1`,
  )
  const data = await getJson(url, signal)
  const row = Array.isArray(data?.tokens) ? data.tokens[0] : null

  if (!row) {
    return {
      balance: 0,
      raw: 0,
      decimals: 0,
      tokenId,
      network: HEDERA_NETWORK,
      mirrorUrl: MIRROR_NODE_BASE_URL,
      hasToken: false,
    }
  }

  let decimals = Number(row.decimals)
  if (!Number.isFinite(decimals) || decimals < 0) {
    decimals = await fetchTokenDecimals(tokenId, signal)
  }

  const raw = Number(row.balance)
  const safeRaw = Number.isFinite(raw) ? Math.max(0, raw) : 0
  const balance = decimals > 0 ? safeRaw / Math.pow(10, decimals) : safeRaw

  return {
    balance,
    raw: safeRaw,
    decimals,
    tokenId,
    network: HEDERA_NETWORK,
    mirrorUrl: MIRROR_NODE_BASE_URL,
    hasToken: true,
  }
}
