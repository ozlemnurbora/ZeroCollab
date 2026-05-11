import { describe, expect, it } from 'vitest'
import { detectConflicts, formatConflictSummary } from '../calendar/conflictDetection.js'

describe('detectConflicts', () => {
  it('returns no conflict when no existing meetings', () => {
    const result = detectConflicts(
      { date: '2026-06-01', time: '10:00', duration: 60 },
      [],
      [],
    )
    expect(result.hasConflict).toBe(false)
    expect(result.conflicts).toEqual([])
  })

  it('returns no conflict when meetings are on different dates', () => {
    const result = detectConflicts(
      { date: '2026-06-01', time: '10:00', duration: 60 },
      [
        {
          id: 'm1',
          date: '2026-06-02',
          time: '10:00',
          duration: 60,
          title: 'Other day',
        },
      ],
      [],
    )
    expect(result.hasConflict).toBe(false)
    expect(result.conflicts).toEqual([])
  })

  it('returns no conflict when meetings are on same date but different times (no overlap)', () => {
    const result = detectConflicts(
      { date: '2026-06-01', time: '10:00', duration: 60 },
      [
        {
          id: 'm1',
          date: '2026-06-01',
          time: '14:00',
          duration: 60,
          title: 'Later',
        },
      ],
      [],
    )
    expect(result.hasConflict).toBe(false)
    expect(result.conflicts).toEqual([])
  })

  it('detects conflict when meetings overlap exactly', () => {
    const result = detectConflicts(
      { date: '2026-06-01', time: '10:00', duration: 60 },
      [
        {
          id: 'm1',
          date: '2026-06-01',
          time: '10:00',
          duration: 60,
          title: 'Standup',
        },
      ],
      [],
    )
    expect(result.hasConflict).toBe(true)
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0].type).toBe('meeting')
  })

  it('detects conflict when meetings partially overlap', () => {
    const result = detectConflicts(
      { date: '2026-06-01', time: '10:00', duration: 60 },
      [
        {
          id: 'm1',
          date: '2026-06-01',
          time: '10:30',
          duration: 60,
          title: 'Overlap',
        },
      ],
      [],
    )
    expect(result.hasConflict).toBe(true)
  })

  it('detects conflict when proposed is inside existing meeting', () => {
    const result = detectConflicts(
      { date: '2026-06-01', time: '10:30', duration: 30 },
      [
        {
          id: 'm1',
          date: '2026-06-01',
          time: '10:00',
          duration: 120,
          title: 'Long',
        },
      ],
      [],
    )
    expect(result.hasConflict).toBe(true)
  })

  it('returns no conflict when meetings are adjacent but not overlapping (half-open ranges)', () => {
    const result = detectConflicts(
      { date: '2026-06-01', time: '11:00', duration: 60 },
      [
        {
          id: 'm1',
          date: '2026-06-01',
          time: '10:00',
          duration: 60,
          title: 'Ends at 11:00 exclusive',
        },
      ],
      [],
    )
    expect(result.hasConflict).toBe(false)
  })

  it('excludes meeting with same id (edit mode)', () => {
    const proposed = {
      date: '2026-06-01',
      time: '10:00',
      duration: 60,
      id: 'meeting_1',
    }
    const existing = [
      {
        id: 'meeting_1',
        date: '2026-06-01',
        time: '10:00',
        duration: 60,
        title: 'Self',
      },
    ]
    const result = detectConflicts(proposed, existing, [], { excludeId: proposed.id })
    expect(result.hasConflict).toBe(false)
    expect(result.conflicts).toEqual([])
  })

  it('excludes meeting via options.excludeId', () => {
    const proposed = { date: '2026-06-01', time: '10:00', duration: 60 }
    const existing = [
      {
        id: 'meeting_1',
        date: '2026-06-01',
        time: '10:00',
        duration: 60,
        title: 'Excluded',
      },
      {
        id: 'meeting_2',
        date: '2026-06-01',
        time: '10:00',
        duration: 60,
        title: 'Still conflicts',
      },
    ]
    const result = detectConflicts(proposed, existing, [], { excludeId: 'meeting_1' })
    expect(result.hasConflict).toBe(true)
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0].id).toBe('meeting_2')
  })

  it('detects multiple conflicts', () => {
    const result = detectConflicts(
      { date: '2026-06-01', time: '10:00', duration: 60 },
      [
        {
          id: 'a',
          date: '2026-06-01',
          time: '10:00',
          duration: 60,
          title: 'A',
        },
        {
          id: 'b',
          date: '2026-06-01',
          time: '10:30',
          duration: 60,
          title: 'B',
        },
      ],
      [],
    )
    expect(result.hasConflict).toBe(true)
    expect(result.conflicts).toHaveLength(2)
  })

  it('detects conflict with weekly recurring meeting', () => {
    const result = detectConflicts(
      { date: '2026-06-08', time: '10:00', duration: 60 },
      [
        {
          id: 'rec',
          date: '2026-06-01',
          time: '10:00',
          duration: 60,
          title: 'Weekly',
          recurring: 'weekly',
        },
      ],
      [],
    )
    expect(result.hasConflict).toBe(true)
  })

  it('does NOT conflict with weekly recurring on non-matching day', () => {
    const result = detectConflicts(
      { date: '2026-06-03', time: '10:00', duration: 60 },
      [
        {
          id: 'rec',
          date: '2026-06-01',
          time: '10:00',
          duration: 60,
          title: 'Weekly',
          recurring: 'weekly',
        },
      ],
      [],
    )
    expect(result.hasConflict).toBe(false)
  })

  it('detects conflict with daily recurring meeting', () => {
    const result = detectConflicts(
      { date: '2026-06-05', time: '10:00', duration: 60 },
      [
        {
          id: 'daily',
          date: '2026-06-01',
          time: '10:00',
          duration: 60,
          title: 'Daily',
          recurring: 'daily',
        },
      ],
      [],
    )
    expect(result.hasConflict).toBe(true)
  })

  it('with checkTasks option, includes tasks due on same date', () => {
    const result = detectConflicts(
      { date: '2026-06-01', time: '10:00', duration: 60 },
      [],
      [
        {
          id: 't1',
          title: 'Due today',
          dueDate: '2026-06-01',
        },
      ],
      { checkTasks: true },
    )
    expect(result.hasConflict).toBe(true)
    expect(result.conflicts.some((c) => c.type === 'task')).toBe(true)
  })

  it('returns no conflict when date or time is missing from proposed', () => {
    const result = detectConflicts({ date: '', time: '10:00', duration: 60 }, [], [])
    expect(result.hasConflict).toBe(false)
    expect(result.conflicts).toEqual([])
  })
})

describe('formatConflictSummary', () => {
  it('returns empty string for no conflicts', () => {
    expect(formatConflictSummary([])).toBe('')
    expect(formatConflictSummary(null)).toBe('')
  })

  it('returns English summary for meeting conflicts', () => {
    const s = formatConflictSummary(
      [{ type: 'meeting', title: 'Standup', time: '10:00 (60 min)' }],
      'en',
    )
    expect(s).toContain('Conflicts with 1 meeting')
  })

  it('returns Turkish summary', () => {
    const s = formatConflictSummary([{ type: 'meeting', title: 'Standup', time: '10:00' }], 'tr')
    expect(s.toLowerCase()).toContain('toplantı ile çakışıyor')
  })

  it('includes task summary when task conflicts present', () => {
    const s = formatConflictSummary([{ type: 'task', title: 'Review' }], 'en')
    expect(s.toLowerCase()).toContain('task')
    expect(s.toLowerCase()).toContain('due')
  })
})
