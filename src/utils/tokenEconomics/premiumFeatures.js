/**
 * Tier comparison rows for Token Economics UI.
 * Each row's `introTier` is the first tier that includes that capability; higher
 * tiers inherit (see tierIncludesFeature). Content matches behavior shipped in
 * ZeroCollab today — not future roadmap marketing.
 */
export const PROFESSIONAL_FEATURES = {
  FREE: [
    'Starter project quota (enforced when creating projects)',
    'Starter AI evaluation quota',
    'Starter team member quota',
    'Token balance → plan tier (local profile)',
    'Product Roadmap (view items & details)',
    'Core workspace (backlog, Kanban, sprints, chat, calendar)',
    'Offline-first cache & P2P sync for shared work',
  ],
  PLUS: [
    'Higher project, evaluation, and team quotas',
  ],
  PREMIUM: [
    'Premium (highest) project, evaluation, and team quotas',
    'Product Roadmap full editing (save, reorder, inline changes)',
  ],
}

const TIER_ORDER = { FREE: 0, PLUS: 1, PREMIUM: 2 }

/** Features introduced at each tier (not cumulative in this list — inheritance is applied in the UI). */
export const FEATURE_INTRO_TIER = [
  ...PROFESSIONAL_FEATURES.FREE.map((label) => ({
    label,
    introTier: 'FREE',
  })),
  ...PROFESSIONAL_FEATURES.PLUS.map((label) => ({
    label,
    introTier: 'PLUS',
  })),
  ...PROFESSIONAL_FEATURES.PREMIUM.map((label) => ({
    label,
    introTier: 'PREMIUM',
  })),
]

/**
 * Whether tierKey includes a feature that first appears at introTier.
 * Example: introTier PLUS → only PLUS and PREMIUM columns show included.
 */
export function tierIncludesFeature(tierKey, introTier) {
  const t = TIER_ORDER[tierKey] ?? 0
  const need = TIER_ORDER[introTier] ?? 0
  return t >= need
}

export function getAllComparisonRows() {
  return FEATURE_INTRO_TIER
}
