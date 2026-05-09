/**
 * Local developer-only script: transfers ZC tokens from the operator/treasury
 * account to a recipient on Hedera Testnet.
 *
 * Why this is a script and NOT in the React app:
 * - Token transfers require the operator's PRIVATE KEY to sign.
 * - Shipping a private key to the browser is unsafe in any environment.
 * - Production should sign via a wallet (HashPack / WalletConnect) or a
 *   trusted backend. This script keeps the prototype safe by signing with
 *   .env.local credentials only on the developer machine.
 *
 * Usage:
 *   npm run hedera:transfer-token -- --to 0.0.12345 --amount 10
 *
 * Optional flags:
 *   --token 0.0.xxxxx   Override ZC token id (default: ZC_TOKEN_ID env)
 *   --memo "..."        Optional transaction memo (max 100 bytes)
 *
 * Env (loaded from .env / .env.local — never committed):
 *   HEDERA_NETWORK=testnet
 *   HEDERA_OPERATOR_ID=0.0.xxxx
 *   HEDERA_OPERATOR_KEY=<DER / ECDSA / ED25519 private key>
 *   ZC_TOKEN_ID=0.0.xxxx     (or pass --token)
 *   ZC_DECIMALS=2            (optional override; otherwise read from network)
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
  TokenId,
  TokenInfoQuery,
  TransferTransaction,
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

function parseOperatorKey(raw) {
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

loadEnvFiles()

const args = parseArgs(process.argv.slice(2))

const HEDERA_NETWORK = requireEnv('HEDERA_NETWORK')
const HEDERA_OPERATOR_ID = requireEnv('HEDERA_OPERATOR_ID')
const HEDERA_OPERATOR_KEY = requireEnv('HEDERA_OPERATOR_KEY')
const TOKEN_ID = String(args.token || process.env.ZC_TOKEN_ID || '').trim()
const RECIPIENT = String(args.to || '').trim()
const AMOUNT_RAW = String(args.amount || '').trim()
const MEMO = args.memo ? String(args.memo) : null

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
if (!RECIPIENT) {
  console.error('Missing --to recipient account. Example: --to 0.0.12345')
  process.exit(1)
}
if (!isValidAccountId(RECIPIENT)) {
  console.error(`Invalid recipient: "${RECIPIENT}". Expected 0.0.xxxxx.`)
  process.exit(1)
}
const amount = Number(AMOUNT_RAW)
if (!Number.isFinite(amount) || amount <= 0) {
  console.error(`Invalid --amount "${AMOUNT_RAW}". Must be a positive number.`)
  process.exit(1)
}

let operatorKey
try {
  operatorKey = parseOperatorKey(HEDERA_OPERATOR_KEY)
} catch (e) {
  console.error('Failed to parse HEDERA_OPERATOR_KEY:', e?.message || e)
  process.exit(1)
}

const operatorId = AccountId.fromString(HEDERA_OPERATOR_ID)
const recipientId = AccountId.fromString(RECIPIENT)
const tokenIdParsed = TokenId.fromString(TOKEN_ID)

const client = Client.forTestnet()
client.setOperator(operatorId, operatorKey)

async function resolveDecimals() {
  const envDecimals = Number(process.env.ZC_DECIMALS)
  if (Number.isInteger(envDecimals) && envDecimals >= 0) return envDecimals
  try {
    const info = await new TokenInfoQuery()
      .setTokenId(tokenIdParsed)
      .execute(client)
    const d = Number(info?.decimals)
    return Number.isInteger(d) && d >= 0 ? d : 0
  } catch (e) {
    console.warn(
      '[hedera:transfer-token] could not read token decimals from network, defaulting to 0.',
      e?.message || e,
    )
    return 0
  }
}

function rawUnits(humanAmount, decimals) {
  if (decimals === 0) return Math.round(humanAmount)
  const factor = Math.pow(10, decimals)
  return Math.round(humanAmount * factor)
}

try {
  const decimals = await resolveDecimals()
  const sendUnits = rawUnits(amount, decimals)

  if (!Number.isFinite(sendUnits) || sendUnits <= 0) {
    console.error(
      `Computed transfer amount in raw units is invalid (${sendUnits}).`,
    )
    process.exit(1)
  }
  if (sendUnits > Number.MAX_SAFE_INTEGER) {
    console.error('Amount too large for this script (use a smaller value).')
    process.exit(1)
  }

  const tx = new TransferTransaction()
    .addTokenTransfer(tokenIdParsed, operatorId, -sendUnits)
    .addTokenTransfer(tokenIdParsed, recipientId, sendUnits)

  if (MEMO) tx.setTransactionMemo(String(MEMO).slice(0, 100))

  const frozen = await tx.freezeWith(client)
  const signed = await frozen.sign(operatorKey)
  const submit = await signed.execute(client)
  const receipt = await submit.getReceipt(client)
  const txId = submit.transactionId?.toString?.() ?? '(unknown)'

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  ZC token transfer — Hedera Testnet')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  Token ID  : ${TOKEN_ID}`)
  console.log(`  From      : ${HEDERA_OPERATOR_ID} (operator)`)
  console.log(`  Recipient : ${RECIPIENT}`)
  console.log(`  Amount    : ${amount} ZC  (decimals=${decimals}, raw=${sendUnits})`)
  console.log(`  Tx ID     : ${txId}`)
  console.log(`  Receipt   : ${receipt.status?.toString?.() ?? receipt.status}`)
  if (receipt.status === Status.Success) {
    console.log('  Result    : SUCCESS')
  } else {
    console.log('  Result    : FAILED')
    process.exit(1)
  }
} catch (err) {
  const msg = err?.message || String(err)
  console.error('')
  console.error('Transfer error:', msg)
  if (/TOKEN_NOT_ASSOCIATED_TO_ACCOUNT/i.test(msg)) {
    console.error(
      'Hint: the recipient account must associate the ZC token before it can receive transfers.',
    )
  }
  console.log('  Result    : FAILED')
  process.exit(1)
} finally {
  client.close()
}
