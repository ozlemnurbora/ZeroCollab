import { describe, expect, it } from 'vitest'
import {
  buildSprintBurndownSeries,
  totalCommittedStoryPoints,
} from '../sprintBurndown.js'

describe('totalCommittedStoryPoints', () => {
  it('sums committed story points', () => {
    const tasks = [
      { storyPoints: 3 },
      { story_points: 5 },
      { points: 2 },
    ]
    expect(totalCommittedStoryPoints(tasks)).toBe(10)
  })

  it('treats missing story points as 0', () => {
    expect(totalCommittedStoryPoints([{ title: 'x' }, { storyPoints: 0 }])).toBe(0)
  })
})

describe('buildSprintBurndownSeries', () => {
  const sprint = {
    id: 's1',
    start_date: '2024-01-01',
    end_date: '2024-01-03',
    capacityPoints: 20,
  }

  it('returns null without active sprint', () => {
    expect(buildSprintBurndownSeries(null, [])).toBeNull()
  })

  it('handles empty sprint task list gracefully', () => {
    const out = buildSprintBurndownSeries(sprint, [])
    expect(out).not.toBeNull()
    expect(out.meta.totalCommitted).toBe(0)
    expect(out.chartData.length).toBeGreaterThan(0)
    expect(out.meta.remainingActual).toBe(0)
  })

  it('decreases remaining when tasks are Done with completion time in range', () => {
    const day0End = new Date('2024-01-01T23:59:59.999').getTime()
    const tasks = [
      {
        status: 'done',
        storyPoints: 5,
        doneAt: day0End - 1000,
      },
      { status: 'todo', storyPoints: 3 },
    ]
    const out = buildSprintBurndownSeries(sprint, tasks)
    expect(out.meta.totalCommitted).toBe(8)
    expect(out.meta.completedSp).toBe(5)
    const lastDay = out.chartData[out.chartData.length - 1]
    expect(lastDay.actual).toBeLessThanOrEqual(out.meta.totalCommitted)
  })
})
