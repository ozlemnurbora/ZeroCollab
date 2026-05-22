/**
 * Pure constants for the audit log feature.
 * No IndexedDB, no React — safe to import anywhere.
 */

export const LOG_CATEGORIES = {
  TASK: 'task',
  STORY: 'story',
  EPIC: 'epic',
  FEATURE: 'feature',
  MEETING: 'meeting',
  PROJECT: 'project',
  TEAM: 'team',
  SPRINT: 'sprint',
  CALENDAR: 'calendar',
  AUTH: 'auth',
  SYSTEM: 'system',
}

export const LOG_SEVERITIES = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
}

export const LOG_CATEGORY_META = {
  task: { icon: '✅', label: 'Task', color: 'text-green-400' },
  story: { icon: '📖', label: 'Story', color: 'text-violet-400' },
  epic: { icon: '🏔️', label: 'Epic', color: 'text-purple-400' },
  feature: { icon: '⭐', label: 'Feature', color: 'text-amber-400' },
  meeting: { icon: '📅', label: 'Meeting', color: 'text-orange-400' },
  project: { icon: '🎯', label: 'Project', color: 'text-rose-400' },
  team: { icon: '👥', label: 'Team', color: 'text-cyan-400' },
  sprint: { icon: '📌', label: 'Sprint', color: 'text-indigo-400' },
  calendar: { icon: '🗓️', label: 'Calendar', color: 'text-sky-400' },
  auth: { icon: '🔐', label: 'Auth', color: 'text-emerald-400' },
  system: { icon: '⚙️', label: 'System', color: 'text-slate-400' },
}

export const LOG_SEVERITY_META = {
  info: {
    label: 'Info',
    badgeClass: 'bg-sky-500/15 text-sky-300 border border-sky-500/30',
  },
  success: {
    label: 'Success',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  },
  warning: {
    label: 'Warning',
    badgeClass: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
  },
  error: {
    label: 'Error',
    badgeClass: 'bg-rose-500/15 text-rose-300 border border-rose-500/30',
  },
}

/**
 * Derives a sensible log category from a backlog item's itemType string.
 * Falls back to TASK when the type is unknown.
 */
export function categoryFromItemType(itemType) {
  const t = String(itemType ?? '').toLowerCase().trim()
  if (t === 'epic') return LOG_CATEGORIES.EPIC
  if (t === 'feature') return LOG_CATEGORIES.FEATURE
  if (t === 'story' || t === 'user_story' || t === 'user story') return LOG_CATEGORIES.STORY
  return LOG_CATEGORIES.TASK
}
