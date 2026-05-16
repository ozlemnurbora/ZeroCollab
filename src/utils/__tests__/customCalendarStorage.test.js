import { describe, expect, it } from 'vitest'
import { filterCustomCalendarsForScope } from '../customCalendarStorage.js'

describe('filterCustomCalendarsForScope', () => {
  const calendars = [
    { id: 'c1', name: 'Dev Calendar', projectId: 'p1', ownerUserId: 'u1' },
    { id: 'c2', name: 'Design Calendar', projectId: 'p1', ownerUserId: 'u2' },
    { id: 'c3', name: 'QA Calendar', projectId: 'p2', ownerUserId: 'u1' },
    { id: 'c4', name: 'Legacy', projectId: null, ownerUserId: 'u1' },
    { id: 'c5', name: 'No Owner', projectId: 'p1', ownerUserId: null },
    { id: null, name: 'Bad ID', projectId: 'p1', ownerUserId: 'u1' },
  ]

  it('returns calendars matching projectId and ownerUserId', () => {
    const result = filterCustomCalendarsForScope(calendars, { projectId: 'p1', ownerUserId: 'u1' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('c1')
  })

  it('returns different user calendars for same project', () => {
    const result = filterCustomCalendarsForScope(calendars, { projectId: 'p1', ownerUserId: 'u2' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('c2')
  })

  it('returns calendars for different project', () => {
    const result = filterCustomCalendarsForScope(calendars, { projectId: 'p2', ownerUserId: 'u1' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('c3')
  })

  it('excludes calendars without projectId', () => {
    const result = filterCustomCalendarsForScope(calendars, { projectId: 'p1', ownerUserId: 'u1' })
    expect(result.find((c) => c.id === 'c4')).toBeUndefined()
  })

  it('excludes calendars without ownerUserId', () => {
    const result = filterCustomCalendarsForScope(calendars, { projectId: 'p1', ownerUserId: 'u1' })
    expect(result.find((c) => c.id === 'c5')).toBeUndefined()
  })
})
