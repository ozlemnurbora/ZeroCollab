/**
 * Tier comparison rows for Token Economics UI.
 * Each row's `introTier` is the first tier that includes that capability; higher
 * tiers inherit (see tierIncludesFeature). Content matches behavior shipped in
 * ZeroCollab today — not future roadmap marketing.
 *
 * Labels are translation keys resolved at render time via t() so the comparison
 * table follows the active language.
 */
export const PROFESSIONAL_FEATURES = {
  FREE: [
    'te_feat_free_project_quota',
    'te_feat_free_eval_quota',
    'te_feat_free_team_quota',
    'te_feat_free_token_tier',
    'te_feat_free_roadmap_view',
    'te_feat_free_core_workspace',
    'te_feat_free_offline_sync',
  ],
  PLUS: [
    'te_feat_plus_quotas',
  ],
  PREMIUM: [
    'te_feat_premium_quotas',
    'te_feat_premium_roadmap_edit',
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
