import { describe, expect, it } from 'vitest'
import { resolveDoneAtForStatusChange } from '../taskDoneAt.js'

describe('resolveDoneAtForStatusChange', () => {
  const now = 1700000000000

  it('stamps doneAt when moving to done from todo', () => {
    const task = { status: 'todo' }
    const result = resolveDoneAtForStatusChange(task, 'done', now)
    expect(result).toBe(now)
  })

  it('stamps doneAt when moving to done from in_progress', () => {
    const task = { status: 'in_progress' }
    const result = resolveDoneAtForStatusChange(task, 'done', now)
    expect(result).toBe(now)
  })

  it('clears doneAt when moving from done to todo', () => {
    const task = { status: 'done', doneAt: 1699999999999 }
    const result = resolveDoneAtForStatusChange(task, 'todo', now)
    expect(result).toBeNull()
  })

  it('clears doneAt when moving from done to in_progress', () => {
    const task = { status: 'done', doneAt: 1699999999999 }
    const result = resolveDoneAtForStatusChange(task, 'in_progress', now)
    expect(result).toBeNull()
  })

  it('preserves existing doneAt when staying in done', () => {
    const originalDoneAt = 1699999999999
    const task = { status: 'done', doneAt: originalDoneAt }
    const result = resolveDoneAtForStatusChange(task, 'done', now)
    expect(result).toBe(originalDoneAt)
  })

  it('backfills doneAt when staying in done but no existing timestamp', () => {
    const task = { status: 'done' }
    const result = resolveDoneAtForStatusChange(task, 'done', now)
    expect(result).toBe(now)
  })

  it('reads done_at if doneAt is missing', () => {
    const task = { status: 'done', done_at: 1699999999999 }
    const result = resolveDoneAtForStatusChange(task, 'done', now)
    expect(result).toBe(1699999999999)
  })

  it('handles null task gracefully', () => {
    const result = resolveDoneAtForStatusChange(null, 'done', now)
    expect(result).toBe(now)
  })

  it('handles undefined status gracefully', () => {
    const task = {}
    const result = resolveDoneAtForStatusChange(task, 'done', now)
    expect(result).toBe(now)
  })

  it('is case insensitive for status', () => {
    const task = { status: 'DONE', doneAt: 1699999999999 }
    const result = resolveDoneAtForStatusChange(task, 'Done', now)
    expect(result).toBe(1699999999999)
  })

  it('clears when next status is not done regardless of case', () => {
    const task = { status: 'done', doneAt: 1699999999999 }
    const result = resolveDoneAtForStatusChange(task, 'In_Progress', now)
    expect(result).toBeNull()
  })
})
