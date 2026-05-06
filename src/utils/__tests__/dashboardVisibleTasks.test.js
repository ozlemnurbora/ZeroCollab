import { describe, expect, it } from 'vitest'
import { getVisibleDashboardTasks } from '../dashboard/dashboardTaskUtils.js'

const mk = (overrides) => ({
  id: `t_${Math.random().toString(16).slice(2)}`,
  title: 'x',
  status: 'todo',
  ...overrides,
})

describe('getVisibleDashboardTasks', () => {
  it('no member projects does not show orphan project tasks', () => {
    const raw = [
      mk({ id: 'orphan', projectId: 'proj-1', calendarType: 'general' }),
      mk({ id: 'personal', projectId: null, calendarType: 'personal', ownerUserId: 'u1' }),
    ]
    const visible = getVisibleDashboardTasks({
      rawTasks: raw,
      memberProjectIds: [],
      currentUserId: 'u1',
      activeProjectId: null,
    })
    expect(visible.map((t) => t.id)).toEqual(['personal'])
  })

  it('deleted/tombstone task is not counted', () => {
    const raw = [
      mk({ id: 'del', deleted: true, projectId: null, calendarType: 'personal' }),
      mk({ id: 'ok', projectId: null, calendarType: 'personal' }),
    ]
    const visible = getVisibleDashboardTasks({
      rawTasks: raw,
      memberProjectIds: [],
      currentUserId: 'u1',
      activeProjectId: null,
    })
    expect(visible.map((t) => t.id)).toEqual(['ok'])
  })

  it('personal task with no projectId can be counted', () => {
    const raw = [mk({ id: 'p', projectId: null, calendarType: 'personal' })]
    const visible = getVisibleDashboardTasks({
      rawTasks: raw,
      memberProjectIds: [],
      currentUserId: 'u1',
      activeProjectId: null,
    })
    expect(visible.map((t) => t.id)).toEqual(['p'])
  })

  it('team workload should not include assignees from orphan tasks (filtered out)', () => {
    const raw = [
      mk({ id: 'orphan', projectId: 'proj-x', calendarType: 'general', assignee: 'Ghost' }),
      mk({ id: 'p', projectId: null, calendarType: 'personal', assignee: 'Me' }),
    ]
    const visible = getVisibleDashboardTasks({
      rawTasks: raw,
      memberProjectIds: [],
      currentUserId: 'u1',
      activeProjectId: null,
    })
    expect(visible.some((t) => t.assignee === 'Ghost')).toBe(false)
    expect(visible.some((t) => t.assignee === 'Me')).toBe(true)
  })

  it('project task is visible only when its projectId is allowed', () => {
    const raw = [
      mk({ id: 'p1', projectId: 'proj-1', calendarType: 'general' }),
      mk({ id: 'p2', projectId: 'proj-2', calendarType: 'general' }),
    ]
    const visible = getVisibleDashboardTasks({
      rawTasks: raw,
      memberProjectIds: ['proj-2'],
      currentUserId: 'u1',
      activeProjectId: null,
    })
    expect(visible.map((t) => t.id)).toEqual(['p2'])
  })
})

