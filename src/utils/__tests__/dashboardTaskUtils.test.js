import { describe, expect, it } from 'vitest'
import { normalizeAssigneeKey, getTaskAssignee, getMemberDisplayName, getMemberKey, calculateDashboardMetrics } from '../dashboard/dashboardTaskUtils.js'

describe('normalizeAssigneeKey', () => {
  it('returns empty string for null', () => {
    expect(normalizeAssigneeKey(null)).toBe('')
  })
  it('returns empty string for undefined', () => {
    expect(normalizeAssigneeKey(undefined)).toBe('')
  })
  it('returns empty string for empty string', () => {
    expect(normalizeAssigneeKey('')).toBe('')
  })
  it('lowercases the value', () => {
    expect(normalizeAssigneeKey('John')).toBe('john')
  })
  it('extracts prefix before @ for emails', () => {
    expect(normalizeAssigneeKey('john@example.com')).toBe('john')
  })
  it('collapses spaces', () => {
    expect(normalizeAssigneeKey('john doe')).toBe('johndoe')
  })
  it('trims whitespace', () => {
    expect(normalizeAssigneeKey('  alice  ')).toBe('alice')
  })
})

describe('getTaskAssignee', () => {
  it('returns assignee field', () => {
    expect(getTaskAssignee({ assignee: 'alice' })).toBe('alice')
  })
  it('falls back to assigneeName', () => {
    expect(getTaskAssignee({ assigneeName: 'bob' })).toBe('bob')
  })
  it('falls back to assigneeEmail', () => {
    expect(getTaskAssignee({ assigneeEmail: 'c@d.com' })).toBe('c@d.com')
  })
  it('returns empty string for empty task', () => {
    expect(getTaskAssignee({})).toBe('')
  })
  it('returns empty string for null', () => {
    expect(getTaskAssignee(null)).toBe('')
  })
})

describe('getMemberDisplayName', () => {
  it('returns username if available', () => {
    expect(getMemberDisplayName({ username: 'alice123' })).toBe('alice123')
  })
  it('returns name if no username', () => {
    expect(getMemberDisplayName({ name: 'Alice' })).toBe('Alice')
  })
  it('returns email prefix if no name', () => {
    expect(getMemberDisplayName({ email: 'alice@test.com' })).toBe('alice')
  })
  it('returns empty for null', () => {
    expect(getMemberDisplayName(null)).toBe('')
  })
  it('handles string input', () => {
    expect(getMemberDisplayName('bob@test.com')).toBe('bob')
  })
})

describe('calculateDashboardMetrics', () => {
  const tasks = [
    { id: '1', status: 'todo', assignee: 'alice', createdAt: Date.now() - 86400000 },
    { id: '2', status: 'in_progress', assignee: 'bob', createdAt: Date.now() - 86400000 },
    { id: '3', status: 'done', assignee: 'alice', createdAt: Date.now() - 172800000, doneAt: Date.now() - 3600000 },
    { id: '4', status: 'done', assignee: 'bob', createdAt: Date.now() - 259200000, doneAt: Date.now() - 7200000 },
    { id: '5', status: 'in_review', assignee: 'charlie', createdAt: Date.now() },
  ]

  it('counts total tasks correctly', () => {
    const m = calculateDashboardMetrics({ visibleTasks: tasks })
    expect(m.totalTasks).toBe(5)
  })
  it('counts completed tasks', () => {
    const m = calculateDashboardMetrics({ visibleTasks: tasks })
    expect(m.completedTasks).toBe(2)
  })
  it('counts in progress tasks', () => {
    const m = calculateDashboardMetrics({ visibleTasks: tasks })
    expect(m.inProgressTasks).toBe(1)
  })
  it('counts in review tasks', () => {
    const m = calculateDashboardMetrics({ visibleTasks: tasks })
    expect(m.inReviewTasks).toBe(1)
  })
  it('calculates completion percent', () => {
    const m = calculateDashboardMetrics({ visibleTasks: tasks })
    expect(m.completionPercent).toBe(40)
  })
  it('returns workload by member sorted by count desc', () => {
    const m = calculateDashboardMetrics({ visibleTasks: tasks })
    expect(m.workloadByMember[0].key).toBe('alice')
    expect(m.workloadByMember[0].count).toBe(2)
  })
  it('returns weekly activity array with 7 days', () => {
    const m = calculateDashboardMetrics({ visibleTasks: tasks })
    expect(m.weeklyActivity).toHaveLength(7)
  })
  it('handles empty tasks array', () => {
    const m = calculateDashboardMetrics({ visibleTasks: [] })
    expect(m.totalTasks).toBe(0)
    expect(m.completionPercent).toBe(0)
  })
  it('returns recent tasks limited by recentLimit', () => {
    const m = calculateDashboardMetrics({ visibleTasks: tasks, recentLimit: 3 })
    expect(m.recentTasks).toHaveLength(3)
  })
})
