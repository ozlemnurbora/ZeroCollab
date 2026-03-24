export const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * Calendar "date only" as YYYY-MM-DD using the user's local calendar day.
 * Do not use toISOString() here — it uses UTC and shifts the day in many timezones.
 */
export function toISODate(date) {
  if (!date || Number.isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Compare a YYYY-MM-DD string to a Date's local calendar day (no timezone conversion). */
export function isoDateMatchesLocalDate(iso, date) {
  if (!iso || !date) return false
  return toISODate(date) === iso
}

export function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function isSameDay(a, b) {
  if (!a || !b) return false
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function isToday(date) {
  return isSameDay(date, new Date())
}

export function startOfMonth(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1)
  return startOfDay(d)
}

export function addMonths(date, delta) {
  const d = new Date(date.getFullYear(), date.getMonth() + delta, 1)
  return startOfDay(d)
}

export function monthTitle(date) {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(
    date,
  )
}

// Returns a 6-week grid (42 days), Monday-starting.
export function getMonthGrid(viewDate) {
  const first = startOfMonth(viewDate)

  // JS: 0=Sun..6=Sat, but we want Monday=0..Sunday=6
  const jsDay = first.getDay()
  const mondayIndex = (jsDay + 6) % 7

  const gridStart = new Date(first)
  gridStart.setDate(first.getDate() - mondayIndex)
  gridStart.setHours(0, 0, 0, 0)

  const days = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    days.push(d)
  }
  return days
}

