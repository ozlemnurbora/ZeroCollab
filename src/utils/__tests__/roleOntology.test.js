import { describe, expect, it } from 'vitest'
import { getRoleLabel, isAdminRole, isManagerRole, normalizeProjectRole, normalizeTeamRole, getRoleBadgeClass } from '../roleOntology.js'

describe('getRoleLabel', () => {
  it('returns English label for project_admin', () => {
    expect(getRoleLabel('project_admin', 'en')).toBe('Project Admin')
  })
  it('returns Turkish label for project_admin', () => {
    expect(getRoleLabel('project_admin', 'tr')).toContain('Proje')
  })
  it('returns English label by default', () => {
    expect(getRoleLabel('member')).toBe('Member')
  })
  it('returns empty string for unknown role', () => {
    expect(getRoleLabel('unknown_role')).toBe('unknown_role')
  })
  it('returns empty string for null', () => {
    expect(getRoleLabel(null)).toBe('')
  })
})

describe('isAdminRole', () => {
  it('returns true for project_admin', () => {
    expect(isAdminRole('project_admin')).toBe(true)
  })
  it('returns true for team_admin', () => {
    expect(isAdminRole('team_admin')).toBe(true)
  })
  it('returns false for member', () => {
    expect(isAdminRole('member')).toBe(false)
  })
  it('returns false for manager', () => {
    expect(isAdminRole('manager')).toBe(false)
  })
})

describe('isManagerRole', () => {
  it('returns true for project_manager', () => {
    expect(isManagerRole('project_manager')).toBe(true)
  })
  it('returns true for team_manager', () => {
    expect(isManagerRole('team_manager')).toBe(true)
  })
  it('returns true for manager', () => {
    expect(isManagerRole('manager')).toBe(true)
  })
  it('returns false for member', () => {
    expect(isManagerRole('member')).toBe(false)
  })
  it('returns false for project_admin', () => {
    expect(isManagerRole('project_admin')).toBe(false)
  })
})

describe('normalizeProjectRole', () => {
  it('returns project_admin for owner role', () => {
    expect(normalizeProjectRole('owner')).toBe('project_admin')
  })
  it('returns project_manager for project_manager role', () => {
    expect(normalizeProjectRole('project_manager')).toBe('project_manager')
  })
  it('returns project_manager when customRole is project_manager', () => {
    expect(normalizeProjectRole('member', 'direct', 'project_manager')).toBe('project_manager')
  })
  it('returns team_member for team source', () => {
    expect(normalizeProjectRole('member', 'team')).toBe('team_member')
  })
  it('returns direct_member for direct source', () => {
    expect(normalizeProjectRole('member', 'direct')).toBe('direct_member')
  })
  it('defaults to direct_member', () => {
    expect(normalizeProjectRole('member')).toBe('direct_member')
  })
})

describe('normalizeTeamRole', () => {
  it('returns team_admin when isOwner', () => {
    expect(normalizeTeamRole('member', true)).toBe('team_admin')
  })
  it('returns team_manager when customRole is team_manager', () => {
    expect(normalizeTeamRole('member', false, 'team_manager')).toBe('team_manager')
  })
  it('returns team_manager for team_manager role', () => {
    expect(normalizeTeamRole('team_manager')).toBe('team_manager')
  })
  it('defaults to team_member', () => {
    expect(normalizeTeamRole('member')).toBe('team_member')
  })
})

describe('getRoleBadgeClass', () => {
  it('returns purple classes for admin roles', () => {
    expect(getRoleBadgeClass('project_admin')).toContain('purple')
    expect(getRoleBadgeClass('team_admin')).toContain('purple')
  })
  it('returns amber classes for manager roles', () => {
    expect(getRoleBadgeClass('project_manager')).toContain('amber')
    expect(getRoleBadgeClass('team_manager')).toContain('amber')
  })
  it('returns blue classes for direct_member', () => {
    expect(getRoleBadgeClass('direct_member')).toContain('blue')
  })
  it('returns slate classes for default', () => {
    expect(getRoleBadgeClass('team_member')).toContain('slate')
  })
})
