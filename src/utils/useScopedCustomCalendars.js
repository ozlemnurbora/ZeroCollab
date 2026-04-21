import { useEffect, useMemo, useState } from 'react'
import {
  CUSTOM_CALENDARS_UPDATED_EVENT,
  filterCustomCalendarsForScope,
  loadCustomCalendarsFromStorage,
} from './customCalendarStorage.js'

/**
 * Project- and owner-scoped custom calendars, re-read when storage updates (e.g. from Calendar page).
 */
export function useScopedCustomCalendars(projectId, ownerUserId) {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1)
    window.addEventListener(CUSTOM_CALENDARS_UPDATED_EVENT, bump)
    return () => window.removeEventListener(CUSTOM_CALENDARS_UPDATED_EVENT, bump)
  }, [])
  return useMemo(() => {
    void version
    const all = loadCustomCalendarsFromStorage()
    return filterCustomCalendarsForScope(all, {
      projectId: projectId ?? null,
      ownerUserId: ownerUserId ?? null,
    })
  }, [projectId, ownerUserId, version])
}
