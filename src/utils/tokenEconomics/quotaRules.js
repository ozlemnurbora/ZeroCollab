export const QUOTA_KEYS = {
  projects: 'projects',
  evaluations: 'evaluations',
  teamMembers: 'teamMembers',
}

// Translation keys, resolved at render time via t().
export const QUOTA_LABELS = {
  [QUOTA_KEYS.projects]: 'te_quota_projects',
  [QUOTA_KEYS.evaluations]: 'te_quota_evaluations',
  [QUOTA_KEYS.teamMembers]: 'te_quota_team_members',
}

// English fallbacks for non-React contexts (e.g. tests, plain string builders).
export const QUOTA_LABELS_EN = {
  [QUOTA_KEYS.projects]: 'Projects',
  [QUOTA_KEYS.evaluations]: 'Evaluations',
  [QUOTA_KEYS.teamMembers]: 'Team members',
}

