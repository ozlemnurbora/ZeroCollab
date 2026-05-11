import { describe, expect, it } from 'vitest'
import {
  TIMEZONE_OPTIONS,
  convertTime,
  detectLocalTimezone,
  findBestMeetingTime,
  formatUTCOffset,
  getMultiTimezoneDisplay,
} from '../calendar/timezoneUtils.js'

describe('TIMEZONE_OPTIONS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(TIMEZONE_OPTIONS)).toBe(true)
    expect(TIMEZONE_OPTIONS.length).toBeGreaterThan(0)
  })

  it('each option has value, label, region, offsetLabel properties', () => {
    for (const tz of TIMEZONE_OPTIONS) {
      expect(typeof tz.value).toBe('string')
      expect(tz.value.length).toBeGreaterThan(0)
      expect(typeof tz.label).toBe('string')
      expect(tz.label.length).toBeGreaterThan(0)
      expect(typeof tz.region).toBe('string')
      expect(tz.region.length).toBeGreaterThan(0)
      expect(typeof tz.offsetLabel).toBe('string')
      expect(tz.offsetLabel.length).toBeGreaterThan(0)
    }
  })

  it('contains Europe/Istanbul', () => {
    expect(TIMEZONE_OPTIONS.some((tz) => tz.value === 'Europe/Istanbul')).toBe(true)
  })

  it('contains America/New_York', () => {
    expect(TIMEZONE_OPTIONS.some((tz) => tz.value === 'America/New_York')).toBe(true)
  })

  it('contains Asia/Tokyo', () => {
    expect(TIMEZONE_OPTIONS.some((tz) => tz.value === 'Asia/Tokyo')).toBe(true)
  })
})

describe('detectLocalTimezone', () => {
  it('returns a non-empty string', () => {
    const tz = detectLocalTimezone()
    expect(typeof tz).toBe('string')
    expect(tz.length).toBeGreaterThan(0)
  })

  it('returns a valid IANA timezone string (contains "/")', () => {
    expect(detectLocalTimezone()).toContain('/')
  })
})

describe('formatUTCOffset', () => {
  it("formatUTCOffset(180) returns 'UTC+03:00' (Istanbul)", () => {
    expect(formatUTCOffset(180)).toBe('UTC+03:00')
  })

  it("formatUTCOffset(-300) returns 'UTC-05:00' (New York EST)", () => {
    expect(formatUTCOffset(-300)).toBe('UTC-05:00')
  })

  it("formatUTCOffset(0) returns 'UTC+00:00'", () => {
    expect(formatUTCOffset(0)).toBe('UTC+00:00')
  })

  it("formatUTCOffset(330) returns 'UTC+05:30' (Mumbai)", () => {
    expect(formatUTCOffset(330)).toBe('UTC+05:30')
  })

  it("formatUTCOffset(-60) returns 'UTC-01:00'", () => {
    expect(formatUTCOffset(-60)).toBe('UTC-01:00')
  })
})

describe('convertTime', () => {
  it('same timezone returns same time and date with dayShift 0', () => {
    const result = convertTime('14:00', '2026-06-01', 'Europe/Istanbul', 'Europe/Istanbul')
    expect(result.time).toBe('14:00')
    expect(result.date).toBe('2026-06-01')
    expect(result.dayShift).toBe(0)
  })

  it('returns input values when fromTimezone or toTimezone is missing', () => {
    const result = convertTime('14:00', '2026-06-01', '', 'Europe/Istanbul')
    expect(result.time).toBe('14:00')
    expect(result.dayShift).toBe(0)
  })

  it('converts Istanbul to London with HH:MM time and valid dayShift', () => {
    const result = convertTime('14:00', '2026-06-01', 'Europe/Istanbul', 'Europe/London')
    expect(result.time).toMatch(/^\d{2}:\d{2}$/)
    expect([-1, 0, 1]).toContain(result.dayShift)
  })

  it('handles midnight crossing going west (Istanbul 01:00 → New York)', () => {
    const result = convertTime('01:00', '2026-06-01', 'Europe/Istanbul', 'America/New_York')
    expect(result.dayShift).toBe(-1)
  })

  it('result time is always in HH:MM format', () => {
    const cases = [
      ['09:30', '2026-06-01', 'Europe/Istanbul', 'America/Los_Angeles'],
      ['23:45', '2026-06-01', 'Europe/Istanbul', 'Asia/Tokyo'],
      ['00:15', '2026-06-01', 'Europe/Istanbul', 'America/New_York'],
      ['12:00', '2026-12-15', 'Europe/London', 'Australia/Sydney'],
    ]
    for (const [time, date, from, to] of cases) {
      const result = convertTime(time, date, from, to)
      expect(result.time).toMatch(/^\d{2}:\d{2}$/)
    }
  })

  it('result date is always in YYYY-MM-DD format when dayShift occurs', () => {
    const forward = convertTime('22:00', '2026-06-01', 'Europe/Istanbul', 'Asia/Tokyo')
    if (forward.dayShift !== 0) {
      expect(forward.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
    const backward = convertTime('01:00', '2026-06-01', 'Europe/Istanbul', 'America/Los_Angeles')
    expect(backward.dayShift).toBe(-1)
    expect(backward.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('getMultiTimezoneDisplay', () => {
  it('returns array with one entry when meeting timezone equals the only participant timezone', () => {
    const result = getMultiTimezoneDisplay(
      '14:00',
      '2026-06-01',
      'Europe/Istanbul',
      ['Europe/Istanbul'],
    )
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(1)
    expect(result[0].timezone).toBe('Europe/Istanbul')
  })

  it('returns array with multiple entries for different participant timezones', () => {
    const result = getMultiTimezoneDisplay(
      '14:00',
      '2026-06-01',
      'Europe/Istanbul',
      ['America/New_York', 'Asia/Tokyo'],
    )
    expect(result.length).toBeGreaterThanOrEqual(3)
    const zones = result.map((entry) => entry.timezone)
    expect(zones).toContain('Europe/Istanbul')
    expect(zones).toContain('America/New_York')
    expect(zones).toContain('Asia/Tokyo')
  })

  it('first entry is the meeting (source) timezone', () => {
    const result = getMultiTimezoneDisplay(
      '14:00',
      '2026-06-01',
      'Europe/Istanbul',
      ['America/New_York', 'Asia/Tokyo'],
    )
    expect(result[0].timezone).toBe('Europe/Istanbul')
  })

  it('each entry has timezone, time, date, abbreviation, dayShift properties', () => {
    const result = getMultiTimezoneDisplay(
      '14:00',
      '2026-06-01',
      'Europe/Istanbul',
      ['America/New_York'],
    )
    for (const entry of result) {
      expect(entry).toHaveProperty('timezone')
      expect(entry).toHaveProperty('time')
      expect(entry).toHaveProperty('date')
      expect(entry).toHaveProperty('abbreviation')
      expect(entry).toHaveProperty('dayShift')
    }
  })
})

describe('findBestMeetingTime', () => {
  it('returns an object with bestHour, coverage, details', () => {
    const result = findBestMeetingTime(['Europe/Istanbul', 'America/New_York'], 60)
    expect(result).toHaveProperty('bestHour')
    expect(result).toHaveProperty('coverage')
    expect(result).toHaveProperty('details')
    expect(Array.isArray(result.details)).toBe(true)
  })

  it('for a single timezone, coverage equals 1 for work-hour slots', () => {
    const result = findBestMeetingTime(['Europe/Istanbul'], 60)
    expect(result.coverage).toBe(1)
  })

  it('returns bestHour between 0 and 23', () => {
    const result = findBestMeetingTime(['Europe/Istanbul', 'Asia/Tokyo'], 60)
    expect(result.bestHour).toBeGreaterThanOrEqual(0)
    expect(result.bestHour).toBeLessThanOrEqual(23)
  })

  it('handles empty timezone array gracefully (returns defaults)', () => {
    const result = findBestMeetingTime([], 60)
    expect(result).toHaveProperty('bestHour')
    expect(result).toHaveProperty('coverage')
    expect(result).toHaveProperty('details')
    expect(result.coverage).toBe(0)
    expect(result.details).toEqual([])
  })
})
