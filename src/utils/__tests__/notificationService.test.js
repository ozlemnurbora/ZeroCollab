import { describe, expect, it, vi, beforeEach } from 'vitest'
import { formatNotificationTime } from '../notificationService.js'

// Only test the pure functions since IndexedDB is hard to mock in jsdom

describe('formatNotificationTime', () => {
  it('returns empty string for falsy timestamp', () => {
    expect(formatNotificationTime(null)).toBe('')
    expect(formatNotificationTime(undefined)).toBe('')
    expect(formatNotificationTime(0)).toBe('')
  })

  it('returns "just now" for less than 1 minute ago', () => {
    const now = Date.now()
    expect(formatNotificationTime(now - 10000)).toBe('just now')
  })

  it('returns minutes ago for less than 1 hour', () => {
    const now = Date.now()
    const fiveMinAgo = now - 5 * 60 * 1000
    expect(formatNotificationTime(fiveMinAgo)).toBe('5m ago')
  })

  it('returns hours ago for less than 1 day', () => {
    const now = Date.now()
    const threeHoursAgo = now - 3 * 60 * 60 * 1000
    expect(formatNotificationTime(threeHoursAgo)).toBe('3h ago')
  })

  it('returns days ago for less than 7 days', () => {
    const now = Date.now()
    const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000
    expect(formatNotificationTime(twoDaysAgo)).toBe('2d ago')
  })

  it('returns date string for more than 7 days', () => {
    const now = Date.now()
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000
    const result = formatNotificationTime(tenDaysAgo)
    // Should be a date string like "5/6/2026" or similar locale format
    expect(result).not.toBe('')
    expect(result).not.toContain('ago')
  })

  it('returns "1m ago" for exactly 1 minute ago', () => {
    const now = Date.now()
    expect(formatNotificationTime(now - 60000)).toBe('1m ago')
  })

  it('returns "1h ago" for exactly 1 hour ago', () => {
    const now = Date.now()
    expect(formatNotificationTime(now - 3600000)).toBe('1h ago')
  })

  it('returns "1d ago" for exactly 1 day ago', () => {
    const now = Date.now()
    expect(formatNotificationTime(now - 86400000)).toBe('1d ago')
  })

  it('returns "59m ago" for 59 minutes ago', () => {
    const now = Date.now()
    expect(formatNotificationTime(now - 59 * 60 * 1000)).toBe('59m ago')
  })

  it('returns "23h ago" for 23 hours ago', () => {
    const now = Date.now()
    expect(formatNotificationTime(now - 23 * 60 * 60 * 1000)).toBe('23h ago')
  })

  it('returns "6d ago" for 6 days ago', () => {
    const now = Date.now()
    expect(formatNotificationTime(now - 6 * 24 * 60 * 60 * 1000)).toBe('6d ago')
  })
})
