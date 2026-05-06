import { describe, expect, it } from 'vitest'
import { filterTasksForVisibility } from '../taskP2PSync.js'

const uid = 'user-1'

const base = (overrides) => ({
  id: `t_${Math.random().toString(16).slice(2)}`,
  title: 'x',
  status: 'todo',
  updatedAt: Date.now(),
  ...overrides,
})

describe('filterTasksForVisibility', () => {
  it('deleted task is not visible even when allowedProjectIds is empty', () => {
    const tasks = [
      base({ id: 'd1', deleted: true, projectId: null, calendarType: 'personal' }),
      base({ id: 'p1', projectId: null, calendarType: 'personal' }),
    ]
    const visible = filterTasksForVisibility(tasks, {
      allowedProjectIds: [],
      currentUserId: uid,
    })
    expect(visible.map((t) => t.id)).toEqual(['p1'])
  })

  it('project task is not visible when memberProjectIds is empty', () => {
    const tasks = [
      base({ id: 'projTask', projectId: 'proj-1', calendarType: 'general' }),
      base({ id: 'personal', projectId: null, calendarType: 'personal' }),
    ]
    const visible = filterTasksForVisibility(tasks, {
      allowedProjectIds: [],
      currentUserId: uid,
    })
    expect(visible.map((t) => t.id)).toEqual(['personal'])
  })

  it('personal task with no projectId remains visible', () => {
    const tasks = [base({ id: 'personal', projectId: null, calendarType: 'personal' })]
    const visible = filterTasksForVisibility(tasks, {
      allowedProjectIds: [],
      currentUserId: uid,
    })
    expect(visible.map((t) => t.id)).toEqual(['personal'])
  })

  it('project task is visible only when its projectId is allowed', () => {
    const tasks = [
      base({ id: 'p1', projectId: 'proj-1', calendarType: 'general' }),
      base({ id: 'p2', projectId: 'proj-2', calendarType: 'general' }),
    ]
    const visible = filterTasksForVisibility(tasks, {
      allowedProjectIds: ['proj-2'],
      currentUserId: uid,
    })
    expect(visible.map((t) => t.id)).toEqual(['p2'])
  })
})

