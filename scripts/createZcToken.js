/**
 * Local developer-only script: creates the ZeroCollab fungible token on Hedera testnet.
 * Do not import this file from the React app. Keys stay in .env / .env.local only.
 *
 * Usage: npm run hedera:create-token
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
  TokenCreateTransaction,
  TokenSupplyType,
  TokenType,
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
    console.error('Copy .env.hedera.example to .env.local and fill in values (see file comments).')
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

loadEnvFiles()

const HEDERA_NETWORK = requireEnv('HEDERA_NETWORK')
const HEDERA_OPERATOR_ID = requireEnv('HEDERA_OPERATOR_ID')
const HEDERA_OPERATOR_KEY = requireEnv('HEDERA_OPERATOR_KEY')
const ZC_TOKEN_NAME = requireEnv('ZC_TOKEN_NAME')
const ZC_TOKEN_SYMBOL = requireEnv('ZC_TOKEN_SYMBOL')
const ZC_INITIAL_SUPPLY_RAW = requireEnv('ZC_INITIAL_SUPPLY')

if (HEDERA_NETWORK.toLowerCase() !== 'testnet') {
  console.error(
    `This script only supports HEDERA_NETWORK=testnet (got "${HEDERA_NETWORK}").`,
  )
  process.exit(1)
}

const initialSupply = Number(ZC_INITIAL_SUPPLY_RAW)
if (!Number.isFinite(initialSupply) || initialSupply < 0 || !Number.isInteger(initialSupply)) {
  console.error('ZC_INITIAL_SUPPLY must be a non-negative integer.')
  process.exit(1)
}
if (initialSupply > Number.MAX_SAFE_INTEGER) {
  console.error('ZC_INITIAL_SUPPLY is too large for this script (use a smaller integer).')
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
const treasuryId = operatorId

const client = Client.forTestnet()
client.setOperator(operatorId, operatorKey)

try {
  const tx = new TokenCreateTransaction()
    .setTokenName(ZC_TOKEN_NAME)
    .setTokenSymbol(ZC_TOKEN_SYMBOL)
    .setDecimals(0)
    .setInitialSupply(initialSupply)
    .setTreasuryAccountId(treasuryId)
    .setTokenType(TokenType.FungibleCommon)
    .setSupplyType(TokenSupplyType.Infinite)
    .setAdminKey(operatorKey.publicKey)
    .setSupplyKey(operatorKey.publicKey)

  const txResponse = await tx.execute(client)
  const receipt = await txResponse.getReceipt(client)

  if (receipt.status !== Status.Success) {
    console.error('Token creation failed. Receipt status:', receipt.status?.toString?.() ?? receipt.status)
    process.exit(1)
  }

  const tokenId = receipt.tokenId
  if (!tokenId) {
    console.error('Receipt succeeded but tokenId is missing.')
    process.exit(1)
  }

  const tokenIdStr = tokenId.toString()

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  ZeroCollab token created on Hedera Testnet')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('  Token ID (copy this):')
  console.log(`  ${tokenIdStr}`)
  console.log('')
  console.log('Next step — paste into your app config:')
  console.log('  File: src/utils/tokenEconomics/tokenConfig.js')
  console.log('  Set:  export const ZC_TOKEN_ID = \'' + tokenIdStr + '\'')
  console.log('')
} catch (err) {
  console.error('Token creation error:', err?.message || err)
  process.exit(1)
} finally {
  client.close()
}
