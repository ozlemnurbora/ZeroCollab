/**
 * Token Tier Ontology Loader (ZTAD)
 *
 * Loads tier definitions from public/ontology/token-tiers.ttl at runtime.
 * Falls back to null if loading fails — callers must handle the fallback.
 */

function extractLiteral(block, predicate) {
  const patterns = [
    new RegExp(`${predicate}\\s+"([^"]+)"(?:\\s*;|\\s*\\.)?`),
    new RegExp(`${predicate}\\s+"([^"]+)"\\s*\\^\\^`),
    new RegExp(`${predicate}\\s+"([^"]*)"\\s*`),
  ]
  for (const pattern of patterns) {
    const match = block.match(pattern)
    if (match) return match[1].trim()
  }
  return null
}

function parseBoolean(val) {
  return val === 'true'
}

function parseNumber(val) {
  const n = Number(val)
  return Number.isFinite(n) ? n : 0
}

/**
 * Fetch and parse token-tiers.ttl, returning a map of tier objects keyed by tierKey.
 * Returns null on any failure.
 */
export async function loadTokenTiersFromOntology() {
  try {
    const response = await fetch('/ontology/token-tiers.ttl')
    const text = await response.text()
    if (!text || !text.includes('zct:TokenTier')) return null

    const tiers = {}
    const lines = text.split('\n')
    let currentBlock = []
    let inTier = false

    const pushTier = (blockLines) => {
      if (!blockLines.length) return
      const block = blockLines.join('\n')
      const key = extractLiteral(block, 'zct:tierKey')
      if (!key) return

      tiers[key] = {
        minBalance: parseNumber(extractLiteral(block, 'zct:minBalance')),
        projectLimit: parseNumber(extractLiteral(block, 'zct:projectLimit')),
        evaluationLimit: parseNumber(extractLiteral(block, 'zct:evaluationLimit')),
        teamMemberLimit: parseNumber(extractLiteral(block, 'zct:teamMemberLimit')),
        aiPriority: parseBoolean(extractLiteral(block, 'zct:aiPriority')),
        premiumAnalytics: parseBoolean(extractLiteral(block, 'zct:premiumAnalytics')),
        roadmapAccess: parseBoolean(extractLiteral(block, 'zct:roadmapAccess')),
        releaseManagementAccess: parseBoolean(extractLiteral(block, 'zct:releaseManagementAccess')),
        advancedSprintMetrics: parseBoolean(extractLiteral(block, 'zct:advancedSprintMetrics')),
        exportReports: parseBoolean(extractLiteral(block, 'zct:exportReports')),
        crossProjectAnalytics: parseBoolean(extractLiteral(block, 'zct:crossProjectAnalytics')),
        label: extractLiteral(block, 'zct:tierLabel') || key,
      }
    }

    for (const line of lines) {
      if (line.includes('a zct:TokenTier') && !line.includes('owl:Class')) {
        if (inTier && currentBlock.length) pushTier(currentBlock)
        inTier = true
        currentBlock = [line]
      } else if (inTier) {
        currentBlock.push(line)
        if (line.trim() === '.' || (line.trim() === '' && currentBlock.length > 3)) {
          pushTier(currentBlock)
          currentBlock = []
          inTier = false
        }
      }
    }
    if (inTier && currentBlock.length) pushTier(currentBlock)

    // Must have at least FREE tier to be valid
    if (!tiers.FREE) return null

    console.log('[ZTAD] Token tiers loaded from ontology:', Object.keys(tiers))
    return tiers
  } catch (err) {
    console.warn('[ZTAD] Failed to load token tiers from ontology, will use fallback:', err)
    return null
  }
}
