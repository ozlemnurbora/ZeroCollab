import { loadTokenTiersFromOntology } from './tokenTierLoader.js'

// ── Hardcoded fallback (used if ontology loading fails) ──
const FALLBACK_TIERS = {
  FREE: {
    minBalance: 0,
    projectLimit: 2,
    evaluationLimit: 3,
    teamMemberLimit: 5,
    aiPriority: false,
    premiumAnalytics: false,
    roadmapAccess: false,
    releaseManagementAccess: false,
    advancedSprintMetrics: false,
    exportReports: false,
    crossProjectAnalytics: false,
    label: 'Free',
  },
  PLUS: {
    minBalance: 10,
    projectLimit: 5,
    evaluationLimit: 15,
    teamMemberLimit: 15,
    aiPriority: true,
    premiumAnalytics: true,
    roadmapAccess: false,
    releaseManagementAccess: false,
    advancedSprintMetrics: true,
    exportReports: true,
    crossProjectAnalytics: false,
    label: 'Plus',
  },
  PREMIUM: {
    minBalance: 50,
    projectLimit: 20,
    evaluationLimit: 100,
    teamMemberLimit: 50,
    aiPriority: true,
    premiumAnalytics: true,
    roadmapAccess: true,
    releaseManagementAccess: true,
    advancedSprintMetrics: true,
    exportReports: true,
    crossProjectAnalytics: true,
    label: 'Premium',
  },
}

// ── Live tier data (starts as fallback, replaced when ontology loads) ──
export const TOKEN_TIERS = { ...FALLBACK_TIERS }

/**
 * Initialize tiers from ontology. Call once at app startup.
 * If ontology loading fails, TOKEN_TIERS keeps the hardcoded fallback values.
 */
export async function initTokenTiersFromOntology() {
  try {
    const loaded = await loadTokenTiersFromOntology()
    if (loaded) {
      for (const key of Object.keys(loaded)) {
        TOKEN_TIERS[key] = loaded[key]
      }
      console.log('[ZTAD] TOKEN_TIERS updated from ontology')
    }
  } catch (err) {
    console.warn('[ZTAD] Ontology init failed, using fallback tiers:', err)
  }
}

export function getTierByBalance(balance) {
  const numeric = Number(balance)
  const safe = Number.isFinite(numeric) ? numeric : 0

  if (safe >= TOKEN_TIERS.PREMIUM.minBalance) return 'PREMIUM'
  if (safe >= TOKEN_TIERS.PLUS.minBalance) return 'PLUS'
  return 'FREE'
}

export function getTierLimits(tierKey) {
  return TOKEN_TIERS[tierKey] || TOKEN_TIERS.FREE
}

// Auto-initialize when module loads (non-blocking)
initTokenTiersFromOntology()
