import { describe, expect, it } from 'vitest'
import {
  tasksForP2PBroadcast,
  mergeTasksFromSync,
  taskVisibleInActiveProject,
  filterTasksForVisibility,
  shouldBroadcastGeneralTaskDelete,
  canApplyIncomingTaskDelete,
} from '../taskP2PSync.js'
import { markTaskSoftDeleted } from '../../components/kanban/taskStorage.js'

// Small inline fixtures. `general` = calendarType 'general' (or legacy: projectId + no calendarType).
const generalTask = (id, projectId, extra = {}) => ({
  id,
  projectId,
  calendarType: 'general',
  status: 'todo',
  ...extra,
})
const legacyGeneralTask = (id, projectId, extra = {}) => ({
  id,
  projectId,
  status: 'todo',
  ...extra,
}) // no calendarType but has projectId
const personalTask = (id, ownerUserId, extra = {}) => ({
  id,
  calendarType: 'personal',
  ownerUserId,
  status: 'todo',
  ...extra,
})

describe('tasksForP2PBroadcast', () => {
  it('returns [] when activeProjectId is null/undefined', () => {
    const tasks = [generalTask('t1', 'p1')]
    expect(tasksForP2PBroadcast(tasks, { activeProjectId: null, allowedProjectIds: ['p1'] })).toEqual([])
    expect(tasksForP2PBroadcast(tasks, { allowedProjectIds: ['p1'] })).toEqual([])
  })

  it('returns [] when activeProjectId is not in allowedProjectIds', () => {
    const tasks = [generalTask('t1', 'p1')]
    expect(
      tasksForP2PBroadcast(tasks, { activeProjectId: 'p1', allowedProjectIds: ['p2'] }),
    ).toEqual([])
  })

  it('returns only general tasks for the active project (incl. legacy shape)', () => {
    const tasks = [
      generalTask('t1', 'p1'),
      legacyGeneralTask('t2', 'p1'),
      generalTask('t3', 'p2'), // different project
      personalTask('t4', 'u1'), // personal
    ]
    const out = tasksForP2PBroadcast(tasks, {
      activeProjectId: 'p1',
      allowedProjectIds: ['p1', 'p2'],
    })
    expect(out.map((t) => t.id).sort()).toEqual(['t1', 't2'])
  })

  it('excludes personal tasks and general tasks of other projects', () => {
    const tasks = [
      personalTask('t1', 'u1'),
      generalTask('t2', 'p2'),
    ]
    expect(
      tasksForP2PBroadcast(tasks, { activeProjectId: 'p1', allowedProjectIds: ['p1'] }),
    ).toEqual([])
  })
})

describe('mergeTasksFromSync', () => {
  it('is non-destructive: keeps a local task absent from incoming', () => {
    const local = [generalTask('t1', 'p1')]
    const out = mergeTasksFromSync(local, [], { allowedProjectIds: ['p1'] })
    expect(out.map((t) => t.id)).toEqual(['t1'])
  })

  it('adds a new incoming general task whose projectId is allowed', () => {
    const out = mergeTasksFromSync([], [generalTask('t2', 'p1')], {
      allowedProjectIds: ['p1'],
    })
    expect(out.map((t) => t.id)).toEqual(['t2'])
  })

  it('ignores an incoming task whose projectId is NOT allowed', () => {
    const out = mergeTasksFromSync([], [generalTask('t3', 'p2')], {
      allowedProjectIds: ['p1'],
    })
    expect(out).toEqual([])
  })

  it('does NOT overwrite a local personal task with an incoming shared payload of the same id', () => {
    const local = [personalTask('shared-id', 'u1', { title: 'mine' })]
    const incoming = [generalTask('shared-id', 'p1', { title: 'theirs' })]
    const out = mergeTasksFromSync(local, incoming, { allowedProjectIds: ['p1'] })
    const kept = out.find((t) => t.id === 'shared-id')
    expect(kept).toBeTruthy()
    expect(kept.calendarType).toBe('personal')
    expect(kept.projectId).toBeNull()
    expect(kept.title).toBe('mine')
  })

  it('preserves local ordering and appends brand-new incoming tasks after', () => {
    const local = [generalTask('a', 'p1'), generalTask('b', 'p1')]
    const incoming = [generalTask('c', 'p1')]
    const out = mergeTasksFromSync(local, incoming, { allowedProjectIds: ['p1'] })
    expect(out.map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('taskVisibleInActiveProject', () => {
  it('returns true when no project is selected (falsy activeProjectId)', () => {
    expect(taskVisibleInActiveProject(generalTask('t1', 'p1'), null, 'u1')).toBe(true)
  })

  it('returns true when task.projectId matches activeProjectId', () => {
    expect(taskVisibleInActiveProject(generalTask('t1', 'p1'), 'p1', 'u1')).toBe(true)
  })

  it('returns true for a legacy task with no projectId and no ownerUserId', () => {
    expect(taskVisibleInActiveProject({ id: 't1' }, 'p1', 'u1')).toBe(true)
  })

  it('returns false when task.projectId differs from activeProjectId', () => {
    expect(taskVisibleInActiveProject(generalTask('t1', 'p2'), 'p1', 'u1')).toBe(false)
  })
})

describe('filterTasksForVisibility', () => {
  it('excludes deleted/tombstone tasks', () => {
    const deleted = markTaskSoftDeleted(personalTask('t1', 'u1'))
    const out = filterTasksForVisibility([deleted], {
      allowedProjectIds: [],
      currentUserId: 'u1',
    })
    expect(out).toEqual([])
  })

  it('with empty allowedProjectIds keeps only owned personal tasks without a projectId', () => {
    const tasks = [personalTask('t1', 'u1'), generalTask('t2', 'p1')]
    const out = filterTasksForVisibility(tasks, {
      allowedProjectIds: [],
      currentUserId: 'u1',
    })
    expect(out.map((t) => t.id)).toEqual(['t1'])
  })

  it('with allowed projects keeps authorized general + owned personal, excludes other-project general', () => {
    const tasks = [
      generalTask('t1', 'p1'), // authorized
      generalTask('t2', 'p2'), // not allowed
      personalTask('t3', 'u1'), // owned personal (no projectId)
    ]
    const out = filterTasksForVisibility(tasks, {
      allowedProjectIds: ['p1'],
      currentUserId: 'u1',
    })
    expect(out.map((t) => t.id).sort()).toEqual(['t1', 't3'])
  })
})

describe('shouldBroadcastGeneralTaskDelete', () => {
  it('true for a general task with id + allowed projectId', () => {
    expect(shouldBroadcastGeneralTaskDelete(generalTask('t1', 'p1'), ['p1'])).toBe(true)
  })

  it('false for a personal task', () => {
    expect(shouldBroadcastGeneralTaskDelete(personalTask('t1', 'u1', { projectId: 'p1' }), ['p1'])).toBe(false)
  })

  it('false when projectId is missing', () => {
    expect(shouldBroadcastGeneralTaskDelete({ id: 't1', calendarType: 'general' }, ['p1'])).toBe(false)
  })

  it('false when projectId is not in allowedProjectIds', () => {
    expect(shouldBroadcastGeneralTaskDelete(generalTask('t1', 'p2'), ['p1'])).toBe(false)
  })
})

describe('canApplyIncomingTaskDelete', () => {
  it('true when payload has taskId + projectId + allowed projectId', () => {
    expect(canApplyIncomingTaskDelete({ taskId: 't1', projectId: 'p1' }, ['p1'])).toBe(true)
  })

  it('false when projectId is not allowed', () => {
    expect(canApplyIncomingTaskDelete({ taskId: 't1', projectId: 'p2' }, ['p1'])).toBe(false)
  })

  it('false when taskId is missing', () => {
    expect(canApplyIncomingTaskDelete({ projectId: 'p1' }, ['p1'])).toBe(false)
  })

  it('false when projectId is missing', () => {
    expect(canApplyIncomingTaskDelete({ taskId: 't1' }, ['p1'])).toBe(false)
  })
})
