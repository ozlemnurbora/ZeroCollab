import { describe, expect, it } from 'vitest'

import { mapRemoteTask, normalizeTaskForRemote } from '../taskRemoteStorage.js'

describe('normalizeTaskForRemote', () => {
  const baseTask = {
    id: 'task-1',
    projectId: 'proj-9',
    title: 'Hello',
    calendarType: 'general',
    storyPoints: 5,
    sprintId: 'sprint-a',
    sprintNumber: 2,
    sprintCommittedAt: 1700000000000,
    updatedAt: 1700000001000,
    ownerUserId: 'u1',
  }

  it('maps projectId to project_id on row', () => {
    const row = normalizeTaskForRemote(baseTask, 'u1')
    expect(row).not.toBeNull()
    expect(row.project_id).toBe('proj-9')
  })

  it('preserves sprint fields on payload and row', () => {
    const row = normalizeTaskForRemote(baseTask, 'u1')
    expect(row.sprint_id).toBe('sprint-a')
    expect(row.sprint_number).toBe(2)
    expect(row.sprint_committed_at).toBeTruthy()
    expect(row.payload.sprintId).toBe('sprint-a')
    expect(row.payload.sprintNumber).toBe(2)
    expect(row.payload.sprintCommittedAt).toBe(1700000000000)
  })

  it('preserves story points on row', () => {
    const row = normalizeTaskForRemote(baseTask, 'u1')
    expect(row.story_points).toBe(5)
    expect(row.payload.storyPoints).toBe(5)
  })

  it('preserves deleted and deletedAt', () => {
    const row = normalizeTaskForRemote(
      { ...baseTask, deleted: true, deletedAt: 123 },
      'u1',
    )
    expect(row.payload.deleted).toBe(true)
    expect(row.payload.deletedAt).toBe(123)
  })
})

describe('mapRemoteTask', () => {
  it('reconstructs frontend task from row + payload', () => {
    const task = mapRemoteTask({
      id: 'remote-1',
      project_id: 'p-z',
      title: 'Row title',
      created_at: new Date('2024-06-01').toISOString(),
      updated_at: new Date('2024-06-02').toISOString(),
      payload: {
        title: 'Payload title',
        status: 'in_progress',
        storyPoints: 8,
        sprintId: 'sp-1',
        sprintNumber: 1,
        calendarType: 'general',
      },
    })
    expect(task.id).toBe('remote-1')
    expect(task.projectId).toBe('p-z')
    expect(task.title).toBe('Payload title')
    expect(task.status).toBe('in_progress')
    expect(task.storyPoints).toBe(8)
    expect(task.sprintId).toBe('sp-1')
    expect(task.sprintNumber).toBe(1)
  })
})
