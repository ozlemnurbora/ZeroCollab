import { describe, expect, it } from 'vitest'

import {
  isTaskDeleted,
  mergeTaskVersionsPreferringTombstone,
  normalizeStoryPointsValue,
  normalizeTaskForStorage,
} from '../taskStorage.js'

describe('normalizeTaskForStorage', () => {
  const owner = 'user-1'

  it('defaults missing itemType to task', () => {
    const t = normalizeTaskForStorage({ id: '1', title: 'A' }, owner)
    expect(t.itemType).toBe('task')
  })

  it('defaults missing backlogState to new', () => {
    const t = normalizeTaskForStorage({ id: '1', title: 'A' }, owner)
    expect(t.backlogState).toBe('new')
  })

  it('defaults missing sprintId to null', () => {
    const t = normalizeTaskForStorage({ id: '1', title: 'A' }, owner)
    expect(t.sprintId).toBeNull()
  })

  it('defaults missing calendarType to general for project task', () => {
    const t = normalizeTaskForStorage(
      { id: '1', title: 'A', projectId: 'p1' },
      owner,
    )
    expect(t.calendarType).toBe('general')
  })

  it('defaults missing calendarType to personal without project', () => {
    const t = normalizeTaskForStorage({ id: '1', title: 'A' }, owner)
    expect(t.calendarType).toBe('personal')
  })
})

describe('isTaskDeleted', () => {
  it('detects deleted=true', () => {
    expect(isTaskDeleted({ deleted: true })).toBe(true)
  })

  it('detects deletedAt present', () => {
    expect(isTaskDeleted({ deletedAt: Date.now() })).toBe(true)
    expect(isTaskDeleted({ deleted_at: '2024-01-01' })).toBe(true)
  })

  it('detects active task as not deleted', () => {
    expect(isTaskDeleted({ id: '1', title: 'x' })).toBe(false)
  })
})

describe('mergeTaskVersionsPreferringTombstone', () => {
  it('prefers deleted copy over stale active', () => {
    const active = { id: 't1', title: 'Old', updatedAt: 100, deleted: false }
    const tomb = { id: 't1', title: 'Old', updatedAt: 50, deleted: true, deletedAt: 999 }
    expect(mergeTaskVersionsPreferringTombstone(active, tomb)).toEqual(tomb)
    expect(mergeTaskVersionsPreferringTombstone(tomb, active)).toEqual(tomb)
  })
})

describe('normalizeStoryPointsValue', () => {
  it('rejects negative and invalid values', () => {
    expect(normalizeStoryPointsValue(-3)).toBe(0)
    expect(normalizeStoryPointsValue(NaN)).toBe(0)
    expect(normalizeStoryPointsValue('x')).toBe(0)
  })

  it('rounds valid numbers', () => {
    expect(normalizeStoryPointsValue(3.6)).toBe(4)
    expect(normalizeStoryPointsValue('5')).toBe(5)
  })
})
