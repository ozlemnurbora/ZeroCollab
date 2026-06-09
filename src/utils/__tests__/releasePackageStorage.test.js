import { describe, it, expect, vi } from 'vitest'

// Avoid initializing a real Supabase client when the module is imported.
vi.mock('../supabase.js', () => ({ supabase: {} }))

import { mapToRemote, mapFromRemote } from '../releasePackageStorage.js'

const localPkg = (overrides = {}) => ({
  id: 'pkg_1',
  projectId: 'p1',
  name: 'Release 1.0',
  deployDate: '2026-02-01',
  epicIds: ['e1', 'e2'],
  ...overrides,
})

describe('mapToRemote', () => {
  it('maps local package fields to DB column names', () => {
    const row = mapToRemote(localPkg())
    expect(row).toEqual({
      id: 'pkg_1',
      project_id: 'p1',
      name: 'Release 1.0',
      deploy_date: '2026-02-01',
      epic_ids: ['e1', 'e2'],
    })
  })

  it('defaults epicIds to [] and deployDate to null when missing', () => {
    const row = mapToRemote({ id: 'pkg_2', projectId: 'p1', name: 'R2' })
    expect(row.epic_ids).toEqual([])
    expect(row.deploy_date).toBeNull()
  })
})

describe('mapFromRemote', () => {
  it('maps DB columns to local fields and keeps epic_ids array', () => {
    const pkg = mapFromRemote({
      id: 'pkg_1',
      project_id: 'p1',
      name: 'Release 1.0',
      deploy_date: '2026-02-01',
      epic_ids: ['e1', 'e2'],
      created_at: '2026-01-01T00:00:00.000Z',
    })
    expect(pkg).toMatchObject({
      id: 'pkg_1',
      projectId: 'p1',
      name: 'Release 1.0',
      deployDate: '2026-02-01',
      epicIds: ['e1', 'e2'],
    })
    expect(pkg.createdAt).toBe(new Date('2026-01-01T00:00:00.000Z').getTime())
  })

  it('falls back to [] when epic_ids is not an array, and null deploy_date', () => {
    const pkg = mapFromRemote({
      id: 'pkg_3',
      project_id: 'p1',
      name: 'R3',
      deploy_date: null,
      epic_ids: null,
    })
    expect(pkg.epicIds).toEqual([])
    expect(pkg.deployDate).toBeNull()
  })

  it('produces a numeric createdAt when created_at is absent', () => {
    const pkg = mapFromRemote({ id: 'pkg_4', project_id: 'p1', name: 'R4' })
    expect(typeof pkg.createdAt).toBe('number')
    expect(Number.isFinite(pkg.createdAt)).toBe(true)
  })
})

describe('round-trip mapFromRemote(mapToRemote(x))', () => {
  it('preserves the meaningful fields', () => {
    const original = localPkg()
    const back = mapFromRemote(mapToRemote(original))
    expect(back).toMatchObject({
      id: original.id,
      name: original.name,
      projectId: original.projectId,
      deployDate: original.deployDate,
      epicIds: original.epicIds,
    })
  })

  it('round-trips an empty-epic, null-date package', () => {
    const original = localPkg({ epicIds: [], deployDate: null })
    const back = mapFromRemote(mapToRemote(original))
    expect(back.epicIds).toEqual([])
    expect(back.deployDate).toBeNull()
  })
})
