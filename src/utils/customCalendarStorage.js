export const CUSTOM_CALENDARS_STORAGE_KEY = 'zc-custom-calendars'

export const CUSTOM_CALENDARS_UPDATED_EVENT = 'zc-custom-calendars-updated'

export function loadCustomCalendarsFromStorage() {
  try {
    if (typeof localStorage === 'undefined') return []
    const parsed = JSON.parse(
      localStorage.getItem(CUSTOM_CALENDARS_STORAGE_KEY) || '[]',
    )
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Custom calendars visible for the current project + user.
 * Legacy rows without projectId or ownerUserId are excluded (not shown in any project).
 */
export function filterCustomCalendarsForScope(calendars, { projectId, ownerUserId }) {
  if (!Array.isArray(calendars)) return []
  if (!projectId || !ownerUserId) return []
  return calendars.filter((c) => {
    if (!c?.id || typeof c.name !== 'string') return false
    if (!c.projectId || !c.ownerUserId) return false
    return c.projectId === projectId && c.ownerUserId === ownerUserId
  })
}
