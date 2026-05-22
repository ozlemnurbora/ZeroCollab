import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  IDBFactory,
} from 'fake-indexeddb'
import {
  addLogEntry,
  clearLogs,
  formatLogTime,
  getLogs,
} from '../logService.js'

beforeEach(() => {
  // Reset to a fresh in-memory database between tests so previous runs
  // can't leak into one another.
  globalThis.indexedDB = new IDBFactory()
})

afterEach(async () => {
  await clearLogs()
})

describe('logService — IndexedDB smoke test', () => {
  it('addLogEntry → getLogs → clearLogs round-trip', async () => {
    const created = await addLogEntry({
      action: 'task.created',
      userName: 'tester',
      entityName: 'Test task',
    })

    expect(created).not.toBeNull()
    expect(created.action).toBe('task.created')

    const after = await getLogs()
    expect(Array.isArray(after)).toBe(true)
    expect(after.some((log) => log.action === 'task.created')).toBe(true)

    await clearLogs()
    const cleared = await getLogs()
    expect(cleared).toEqual([])
  })

  it('addLogEntry ignores entries without a valid action', async () => {
    const created = await addLogEntry({ userName: 'tester' })
    expect(created).toBeNull()
  })
})

describe('formatLogTime', () => {
  it('returns empty strings for falsy timestamps', () => {
    expect(formatLogTime(null)).toEqual({ relative: '', absolute: '' })
    expect(formatLogTime(0)).toEqual({ relative: '', absolute: '' })
  })

  it('returns "just now" for less than 1 minute ago', () => {
    const out = formatLogTime(Date.now() - 5000)
    expect(out.relative).toBe('just now')
    expect(out.absolute).not.toBe('')
  })

  it('returns minutes ago for less than 1 hour', () => {
    const out = formatLogTime(Date.now() - 5 * 60 * 1000)
    expect(out.relative).toBe('5m ago')
  })

  it('returns hours ago for less than 1 day', () => {
    const out = formatLogTime(Date.now() - 3 * 60 * 60 * 1000)
    expect(out.relative).toBe('3h ago')
  })

  it('returns days ago for less than 7 days', () => {
    const out = formatLogTime(Date.now() - 2 * 24 * 60 * 60 * 1000)
    expect(out.relative).toBe('2d ago')
  })

  it('returns absolute string for older timestamps', () => {
    const out = formatLogTime(Date.now() - 30 * 24 * 60 * 60 * 1000)
    expect(out.relative).not.toBe('')
    expect(out.relative).not.toContain('ago')
    expect(out.absolute).not.toBe('')
  })
})
