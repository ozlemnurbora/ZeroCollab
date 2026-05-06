import { describe, expect, it } from 'vitest'
import { calculateSprintProgress } from '../sprint/sprintProgressUtils.js'

const sprint = { id: 's1' }
const pid = 'p1'

const mk = (overrides) => ({
  id: `t_${Math.random().toString(16).slice(2)}`,
  projectId: pid,
  status: 'todo',
  ...overrides,
})

describe('calculateSprintProgress', () => {
  it('counts sprintId match', () => {
    const p = calculateSprintProgress([mk({ sprintId: 's1' })], sprint, pid)
    expect(p.totalTasks).toBe(1)
  })

  it('counts sprint_id match', () => {
    const p = calculateSprintProgress([mk({ sprint_id: 's1' })], sprint, pid)
    expect(p.totalTasks).toBe(1)
  })

  it('ignores deleted/tombstone tasks', () => {
    const p = calculateSprintProgress(
      [mk({ sprintId: 's1', deleted: true }), mk({ sprintId: 's1' })],
      sprint,
      pid,
    )
    expect(p.totalTasks).toBe(1)
  })

  it('ignores other project tasks', () => {
    const p = calculateSprintProgress(
      [mk({ sprintId: 's1', projectId: 'other' }), mk({ sprintId: 's1' })],
      sprint,
      pid,
    )
    expect(p.totalTasks).toBe(1)
  })

  it('calculates completion percent correctly', () => {
    const p = calculateSprintProgress(
      [mk({ sprintId: 's1', status: 'done' }), mk({ sprintId: 's1', status: 'todo' })],
      sprint,
      pid,
    )
    expect(p.completedTasks).toBe(1)
    expect(p.totalTasks).toBe(2)
    expect(p.completionPercent).toBe(50)
  })

  it('handles In Progress and In Review status variants', () => {
    const p = calculateSprintProgress(
      [
        mk({ sprintId: 's1', status: 'In Progress' }),
        mk({ sprintId: 's1', status: 'in-review' }),
      ],
      sprint,
      pid,
    )
    expect(p.inProgressTasks).toBe(1)
    expect(p.inReviewTasks).toBe(1)
  })
})

