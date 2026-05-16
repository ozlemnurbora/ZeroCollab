import { describe, expect, it } from 'vitest'
import { toISODate, isoDateMatchesLocalDate, startOfDay, isSameDay, parseISODateLocal, startOfWeekMonday, addDaysCalendar, startOfMonth, addMonths, getMonthGrid, DAY_HEADERS } from '../calendarDateUtils.js'

describe('DAY_HEADERS', () => {
  it('has 7 days', () => {
    expect(DAY_HEADERS).toHaveLength(7)
  })
  it('starts with Mon', () => {
    expect(DAY_HEADERS[0]).toBe('Mon')
  })
  it('ends with Sun', () => {
    expect(DAY_HEADERS[6]).toBe('Sun')
  })
})

describe('toISODate', () => {
  it('formats date as YYYY-MM-DD', () => {
    const d = new Date(2026, 4, 15) // May 15, 2026
    expect(toISODate(d)).toBe('2026-05-15')
  })
  it('pads single digit month and day', () => {
    const d = new Date(2026, 0, 5) // Jan 5
    expect(toISODate(d)).toBe('2026-01-05')
  })
  it('returns empty for invalid date', () => {
    expect(toISODate(new Date(NaN))).toBe('')
  })
  it('returns empty for null', () => {
    expect(toISODate(null)).toBe('')
  })
})

describe('isoDateMatchesLocalDate', () => {
  it('returns true for matching date', () => {
    expect(isoDateMatchesLocalDate('2026-05-15', new Date(2026, 4, 15))).toBe(true)
  })
  it('returns false for non-matching date', () => {
    expect(isoDateMatchesLocalDate('2026-05-15', new Date(2026, 4, 16))).toBe(false)
  })
  it('returns false for null iso', () => {
    expect(isoDateMatchesLocalDate(null, new Date())).toBe(false)
  })
})

describe('startOfDay', () => {
  it('sets time to midnight', () => {
    const d = startOfDay(new Date(2026, 4, 15, 14, 30))
    expect(d.getHours()).toBe(0)
    expect(d.getMinutes()).toBe(0)
    expect(d.getSeconds()).toBe(0)
  })
})

describe('isSameDay', () => {
  it('returns true for same day', () => {
    expect(isSameDay(new Date(2026, 4, 15, 10), new Date(2026, 4, 15, 20))).toBe(true)
  })
  it('returns false for different days', () => {
    expect(isSameDay(new Date(2026, 4, 15), new Date(2026, 4, 16))).toBe(false)
  })
  it('returns false for null', () => {
    expect(isSameDay(null, new Date())).toBe(false)
  })
})

describe('parseISODateLocal', () => {
  it('parses YYYY-MM-DD correctly', () => {
    const d = parseISODateLocal('2026-05-15')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(4)
    expect(d.getDate()).toBe(15)
  })
  it('returns invalid date for bad input', () => {
    expect(parseISODateLocal('not-a-date').getTime()).toBeNaN()
  })
  it('returns invalid date for null', () => {
    expect(parseISODateLocal(null).getTime()).toBeNaN()
  })
})

describe('startOfWeekMonday', () => {
  it('returns Monday for a Wednesday', () => {
    const wed = new Date(2026, 4, 13) // Wednesday May 13, 2026
    const mon = startOfWeekMonday(wed)
    expect(mon.getDay()).toBe(1) // Monday
    expect(mon.getDate()).toBe(11)
  })
  it('returns same day for Monday', () => {
    const mon = new Date(2026, 4, 11)
    const result = startOfWeekMonday(mon)
    expect(result.getDate()).toBe(11)
  })
})

describe('addDaysCalendar', () => {
  it('adds positive days', () => {
    const d = addDaysCalendar(new Date(2026, 4, 15), 3)
    expect(d.getDate()).toBe(18)
  })
  it('subtracts negative days', () => {
    const d = addDaysCalendar(new Date(2026, 4, 15), -5)
    expect(d.getDate()).toBe(10)
  })
})

describe('startOfMonth', () => {
  it('returns first day of month', () => {
    const d = startOfMonth(new Date(2026, 4, 15))
    expect(d.getDate()).toBe(1)
    expect(d.getMonth()).toBe(4)
  })
})

describe('addMonths', () => {
  it('adds months', () => {
    const d = addMonths(new Date(2026, 4, 15), 2)
    expect(d.getMonth()).toBe(6) // July
  })
  it('subtracts months', () => {
    const d = addMonths(new Date(2026, 4, 15), -1)
    expect(d.getMonth()).toBe(3) // April
  })
})

describe('getMonthGrid', () => {
  it('returns 42 days (6 weeks)', () => {
    const grid = getMonthGrid(new Date(2026, 4, 1))
    expect(grid).toHaveLength(42)
  })
  it('first day is a Monday', () => {
    const grid = getMonthGrid(new Date(2026, 4, 1))
    expect(grid[0].getDay()).toBe(1)
  })
  it('all entries are Date objects', () => {
    const grid = getMonthGrid(new Date(2026, 4, 1))
    grid.forEach((d) => expect(d).toBeInstanceOf(Date))
  })
})
