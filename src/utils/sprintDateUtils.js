const MS_PER_DAY = 24 * 60 * 60 * 1000

function parseYmdToLocalMidnight(dateStr) {
  const s = String(dateStr || '').trim()
  if (!s) return null
  const [yRaw, mRaw, dRaw] = s.split('-')
  const y = Number(yRaw)
  const m = Number(mRaw)
  const d = Number(dRaw)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  const dt = new Date(y, m - 1, d)
  if (Number.isNaN(dt.getTime())) return null
  dt.setHours(0, 0, 0, 0)
  return dt
}

export function getLocalMidnightMsFromYmd(dateStr) {
  const dt = parseYmdToLocalMidnight(dateStr)
  return dt ? dt.getTime() : null
}

export function getTodayLocalMidnightMs() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today.getTime()
}

/**
 * Date-based remaining days until sprint end date.
 * Normalizes both today and end date to LOCAL midnight before calculating.
 */
export function getSprintRemainingDays(endDateYmd) {
  const end = parseYmdToLocalMidnight(endDateYmd)
  if (!end) return null
  const todayMs = getTodayLocalMidnightMs()
  const remaining = Math.ceil((end.getTime() - todayMs) / MS_PER_DAY)
  return Math.max(0, remaining)
}

