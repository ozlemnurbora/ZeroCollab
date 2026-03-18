export const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function toISODate(date) {
  return date.toISOString().slice(0, 10)
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

