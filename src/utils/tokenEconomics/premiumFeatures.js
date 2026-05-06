/**
 * SaaS-style professional feature lists per release tier.
 * Lower tiers inherit toward higher tiers: Premium ⊃ Plus ⊃ Free.
 */
export const PROFESSIONAL_FEATURES = {
  FREE: [
    'Basic Kanban board',
    'Basic calendar',
    'Team chat',
    '1-1 calls',
    'Offline-first support',
    'Basic sprint planning',
    'P2P file transfer',
  ],
  PLUS: [
    'Advanced sprint metrics',
    'Burndown analytics',
    'Multi-team projects',
    'Priority AI evaluation queue',
    'Enhanced file transfer limits',
    'Premium analytics dashboard',
    'Export reports',
  ],
  PREMIUM: [
    'Unlimited AI evaluations',
    'Product roadmap management',
    'Release & delivery management',
    'Cross-project analytics',
    'Velocity tracking',
    'Retrospective workflows',
    'Enterprise-level quota limits',
    'Advanced collaboration insights',
  ],
}

const TIER_ORDER = { FREE: 0, PLUS: 1, PREMIUM: 2 }

/** Features introduced at each tier (not cumulative). */
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
