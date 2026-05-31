/**
 * Local developer-only script: associates the ZC token with a Hedera Testnet
 * account so it can receive ZC token transfers.
 *
 * Usage:
 *   npm run hedera:associate-token -- --account 0.0.12345 --key <private-key>
 *
 * Optional flags:
 *   --token 0.0.xxxxx   Override ZC token id (default: ZC_TOKEN_ID env)
 *
 * Env (loaded from .env / .env.local — never committed):
 *   HEDERA_NETWORK=testnet
 *   ZC_TOKEN_ID=0.0.xxxx     (or pass --token)
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import {
  AccountId,
  Client,
  PrivateKey,
  Status,
  TokenAssociateTransaction,
  TokenId,
} from '@hashgraph/sdk'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function loadEnvFiles() {
  const envPath = path.join(repoRoot, '.env')
  const envLocalPath = path.join(repoRoot, '.env.local')
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath, quiet: true })
  if (fs.existsSync(envLocalPath))
    dotenv.config({ path: envLocalPath, override: true, quiet: true })
}

function requireEnv(name) {
  const v = process.env[name]
  if (v == null || String(v).trim() === '') {
    console.error(`Missing required environment variable: ${name}`)
    console.error(
      'Copy .env.hedera.example to .env.local and fill in values (see file comments).',
    )
    process.exit(1)
  }
  return String(v).trim()
}

function parsePrivateKey(raw) {
  const s = raw.trim()
  try {
    return PrivateKey.fromStringDer(s)
  } catch {
    try {
      return PrivateKey.fromStringECDSA(s)
    } catch {
      try {
        return PrivateKey.fromStringED25519(s)
      } catch {
        return PrivateKey.fromString(s)
      }
    }
  }
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      out[key] = true
      continue
    }
    out[key] = next
    i += 1
  }
  return out
}

const ACCOUNT_ID_RE = /^\d+\.\d+\.\d+$/

function isValidAccountId(v) {
  return ACCOUNT_ID_RE.test(String(v || '').trim())
}

function isAlreadyAssociatedError(err) {
  const msg = err?.message || String(err)
  const status = err?.status?.toString?.() ?? err?.status
  return /TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT/i.test(`${msg} ${status}`)
}

loadEnvFiles()

const args = parseArgs(process.argv.slice(2))

const HEDERA_NETWORK = requireEnv('HEDERA_NETWORK')
const TOKEN_ID = String(args.token || process.env.ZC_TOKEN_ID || '').trim()
const ACCOUNT = String(args.account || '').trim()
const ACCOUNT_KEY = String(args.key || '').trim()

if (HEDERA_NETWORK.toLowerCase() !== 'testnet') {
  console.error(
    `This script only supports HEDERA_NETWORK=testnet (got "${HEDERA_NETWORK}").`,
  )
  process.exit(1)
}

if (!TOKEN_ID) {
  console.error('Missing token id. Set ZC_TOKEN_ID or pass --token 0.0.xxxxx.')
  process.exit(1)
}
if (!isValidAccountId(TOKEN_ID)) {
  console.error(`Invalid token id: "${TOKEN_ID}". Expected 0.0.xxxxx.`)
  process.exit(1)
}
if (!ACCOUNT) {
  console.error('Missing --account target account. Example: --account 0.0.12345')
  process.exit(1)
}
if (!isValidAccountId(ACCOUNT)) {
  console.error(`Invalid account: "${ACCOUNT}". Expected 0.0.xxxxx.`)
  process.exit(1)
}
if (!ACCOUNT_KEY) {
  console.error('Missing --key private key for the target account.')
  process.exit(1)
}

let accountKey
try {
  accountKey = parsePrivateKey(ACCOUNT_KEY)
} catch (e) {
  console.error('Failed to parse --key:', e?.message || e)
  process.exit(1)
}

const accountId = AccountId.fromString(ACCOUNT)
const tokenIdParsed = TokenId.fromString(TOKEN_ID)

const client = Client.forTestnet()
client.setOperator(accountId, accountKey)

try {
  const tx = new TokenAssociateTransaction()
    .setAccountId(accountId)
    .setTokenIds([tokenIdParsed])

  const frozen = await tx.freezeWith(client)
  const signed = await frozen.sign(accountKey)
  const submit = await signed.execute(client)
  const receipt = await submit.getReceipt(client)
  const txId = submit.transactionId?.toString?.() ?? '(unknown)'
  const receiptStatus = receipt.status?.toString?.() ?? receipt.status

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  ZC token association — Hedera Testnet')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  Token ID  : ${TOKEN_ID}`)
  console.log(`  Account   : ${ACCOUNT}`)
  console.log(`  Tx ID     : ${txId}`)
  console.log(`  Receipt   : ${receiptStatus}`)
  if (receipt.status === Status.Success) {
    console.log('  Result    : SUCCESS')
  } else if (receiptStatus === 'TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT') {
    console.log('  Result    : Already associated')
    process.exit(0)
  } else {
    console.log('  Result    : FAILED')
    process.exit(1)
  }
} catch (err) {
  const msg = err?.message || String(err)
  console.error('')
  if (isAlreadyAssociatedError(err)) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('  ZC token association — Hedera Testnet')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`  Token ID  : ${TOKEN_ID}`)
    console.log(`  Account   : ${ACCOUNT}`)
    console.log('  Result    : Already associated')
    process.exit(0)
  }
  console.error('Association error:', msg)
  console.log('  Result    : FAILED')
  process.exit(1)
} finally {
  client.close()
}
