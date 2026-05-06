export const TOKEN_TIERS = {
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
