import { describe, expect, it } from 'vitest'
import { sprintDayRangeMs, totalCommittedStoryPoints } from '../sprintBurndown.js'

describe('sprintDayRangeMs', () => {
  it('returns correct day range for a 7-day sprint', () => {
    const result = sprintDayRangeMs('2026-05-01', '2026-05-07')
    expect(result).not.toBeNull()
    expect(result.days).toHaveLength(7)
  })

  it('returns correct day range for a 14-day sprint', () => {
    const result = sprintDayRangeMs('2026-05-01', '2026-05-14')
    expect(result.days).toHaveLength(14)
  })

  it('returns 1 day for same start and end date', () => {
    const result = sprintDayRangeMs('2026-05-01', '2026-05-01')
    expect(result.days).toHaveLength(1)
  })

  it('returns null when end is before start', () => {
    const result = sprintDayRangeMs('2026-05-07', '2026-05-01')
    expect(result).toBeNull()
  })

  it('returns null for null start', () => {
    expect(sprintDayRangeMs(null, '2026-05-07')).toBeNull()
  })

  it('returns null for null end', () => {
    expect(sprintDayRangeMs('2026-05-01', null)).toBeNull()
  })

  it('returns null for empty strings', () => {
    expect(sprintDayRangeMs('', '')).toBeNull()
  })

  it('startMs is less than endMs', () => {
    const result = sprintDayRangeMs('2026-05-01', '2026-05-07')
    expect(result.startMs).toBeLessThan(result.endMs)
  })
})

describe('totalCommittedStoryPoints', () => {
  it('sums story points from tasks', () => {
    const tasks = [
      { storyPoints: 3 },
      { storyPoints: 5 },
      { storyPoints: 2 },
    ]
    expect(totalCommittedStoryPoints(tasks)).toBe(10)
  })

  it('handles story_points field', () => {
    const tasks = [
      { story_points: 3 },
      { story_points: 5 },
    ]
    expect(totalCommittedStoryPoints(tasks)).toBe(8)
  })

  it('returns 0 for empty array', () => {
    expect(totalCommittedStoryPoints([])).toBe(0)
  })

  it('returns 0 for null input', () => {
    expect(totalCommittedStoryPoints(null)).toBe(0)
  })

  it('handles mixed point fields', () => {
    const tasks = [
      { storyPoints: 3 },
      { story_points: 5 },
      { points: 2 },
    ]
    expect(totalCommittedStoryPoints(tasks)).toBe(10)
  })

  it('ignores tasks with 0 points', () => {
    const tasks = [
      { storyPoints: 3 },
      { storyPoints: 0 },
      { storyPoints: 5 },
    ]
    expect(totalCommittedStoryPoints(tasks)).toBe(8)
  })

  it('handles string point values', () => {
    const tasks = [
      { storyPoints: '3' },
      { storyPoints: '5' },
    ]
    expect(totalCommittedStoryPoints(tasks)).toBe(8)
  })
})
