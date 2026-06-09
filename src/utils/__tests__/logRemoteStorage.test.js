import { describe, it, expect, vi } from 'vitest'

// Avoid initializing a real Supabase client when the module is imported.
vi.mock('../supabase.js', () => ({ supabase: {} }))

import { mapLogToRemote, mapRemoteToLog } from '../logRemoteStorage.js'

const localLog = (overrides = {}) => ({
  id: 'log_1',
  projectId: 'p1',
  userId: 'u1',
  userName: 'alice',
  action: 'task.created',
  category: 'task',
  severity: 'success',
  message: 'Created task "X"',
  entityType: 'task',
  entityId: 't1',
  entityName: 'X',
  metadata: { assignee: 'alice@x.com' },
  ...overrides,
})

describe('mapLogToRemote', () => {
  it('maps local fields to DB column names', () => {
    const row = mapLogToRemote(localLog())
    expect(row).toMatchObject({
      id: 'log_1',
      project_id: 'p1',
      user_id: 'u1',
      user_name: 'alice',
      action: 'task.created',
      category: 'task',
      severity: 'success',
      message: 'Created task "X"',
      entity_type: 'task',
      entity_id: 't1',
      entity_name: 'X',
    })
  })

  it('preserves metadata as an object', () => {
    const row = mapLogToRemote(localLog({ metadata: { a: 1, b: 'two' } }))
    expect(row.metadata).toEqual({ a: 1, b: 'two' })
  })

  it('returns null when there is no projectId (not project-scoped)', () => {
    expect(mapLogToRemote(localLog({ projectId: null }))).toBeNull()
    expect(mapLogToRemote(null)).toBeNull()
  })

  it('defaults optional fields without throwing', () => {
    const row = mapLogToRemote({ id: 'l2', projectId: 'p1', action: 'sprint.created' })
    expect(row.category).toBe('system')
    expect(row.severity).toBe('info')
    expect(row.user_id).toBeNull()
    expect(row.metadata).toBeNull()
  })
})

describe('mapRemoteToLog', () => {
  it('maps DB columns to local camelCase fields', () => {
    const log = mapRemoteToLog({
      id: 'log_1',
      project_id: 'p1',
      user_id: 'u1',
      user_name: 'alice',
      action: 'task.created',
      category: 'task',
      severity: 'success',
      message: 'Created task "X"',
      entity_type: 'task',
      entity_id: 't1',
      entity_name: 'X',
      metadata: { assignee: 'alice@x.com' },
      created_at: '2026-01-01T00:00:00.000Z',
    })
    expect(log).toMatchObject({
      id: 'log_1',
      projectId: 'p1',
      userId: 'u1',
      userName: 'alice',
      action: 'task.created',
      category: 'task',
      severity: 'success',
      message: 'Created task "X"',
      entityType: 'task',
      entityId: 't1',
      entityName: 'X',
      metadata: { assignee: 'alice@x.com' },
    })
    expect(log.timestamp).toBe(new Date('2026-01-01T00:00:00.000Z').getTime())
  })

  it('returns null for a null row', () => {
    expect(mapRemoteToLog(null)).toBeNull()
  })

  it('handles missing optional fields without throwing', () => {
    const log = mapRemoteToLog({ id: 'l2', action: 'sprint.created' })
    expect(log.projectId).toBeNull()
    expect(log.userName).toBe('')
    expect(log.metadata).toBeNull()
    expect(typeof log.timestamp).toBe('number')
  })
})

describe('round-trip mapRemoteToLog(mapLogToRemote(x))', () => {
  it('preserves the meaningful fields', () => {
    const original = localLog()
    const back = mapRemoteToLog(mapLogToRemote(original))
    expect(back).toMatchObject({
      id: original.id,
      action: original.action,
      category: original.category,
      message: original.message,
      projectId: original.projectId,
      userId: original.userId,
      userName: original.userName,
      entityType: original.entityType,
      entityId: original.entityId,
      entityName: original.entityName,
      metadata: original.metadata,
    })
  })
})
