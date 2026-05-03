import { describe, expect, it } from 'vitest'
import {
  filterBacklogTasks,
  filterReadyBacklogTasks,
  filterRefinementSessionTasks,
  filterSprintBoardScopedTasks,
  filterSprintTasksForActiveSprint,
} from '../kanbanBoardFilters.js'

const pid = 'proj-1'
const sprint1 = 'sprint-1'

const mk = (overrides) => ({
  id: `id-${Math.random()}`,
  projectId: pid,
  backlogState: 'new',
  sprintId: null,
  status: 'todo',
  ...overrides,
})

describe('kanban board filters', () => {
  const tasks = [
    mk({ id: 'ready-1', backlogState: 'ready' }),
    mk({ id: 'new-1', backlogState: 'new' }),
    mk({ id: 'refined-1', backlogState: 'refined' }),
    mk({
      id: 'sprint-1',
      backlogState: 'ready',
      sprintId: sprint1,
    }),
    mk({
      id: 'deleted-1',
      backlogState: 'new',
      deleted: true,
    }),
  ]

  it('All Tasks-style full list includes Ready; backlog filter excludes Ready', () => {
    const nonDeleted = tasks.filter((t) => !t.deleted)
    expect(nonDeleted.some((t) => String(t.backlogState).toLowerCase() === 'ready')).toBe(true)
    const bl = filterBacklogTasks(nonDeleted)
    expect(bl.some((t) => String(t.backlogState).toLowerCase() === 'ready')).toBe(false)
  })

  it('Backlog excludes Ready items', () => {
    const bl = filterBacklogTasks(tasks)
    expect(bl.every((t) => String(t.backlogState).toLowerCase() !== 'ready')).toBe(true)
    expect(bl.map((t) => t.id)).toContain('new-1')
    expect(bl.map((t) => t.id)).toContain('refined-1')
    expect(bl.map((t) => t.id)).not.toContain('ready-1')
  })

  it('Refinement session includes only Refined non-sprint items', () => {
    const rf = filterRefinementSessionTasks(tasks)
    expect(rf.map((t) => t.id)).toEqual(['refined-1'])
  })

  it('Ready backlog includes Ready non-sprint for active project', () => {
    const rb = filterReadyBacklogTasks(tasks, pid)
    expect(rb.map((t) => t.id)).toEqual(['ready-1'])
  })

  it('Active sprint list includes only tasks with that sprintId', () => {
    const st = filterSprintTasksForActiveSprint(tasks, sprint1)
    expect(st.map((t) => t.id)).toEqual(['sprint-1'])
  })

  it('Sprint board scope matches project + sprint', () => {
    const sb = filterSprintBoardScopedTasks(tasks, pid, sprint1)
    expect(sb.map((t) => t.id)).toEqual(['sprint-1'])
  })

  it('excludes deleted from ready backlog', () => {
    const rb = filterReadyBacklogTasks(tasks, pid)
    expect(rb.some((t) => t.id === 'deleted-1')).toBe(false)
  })
})
