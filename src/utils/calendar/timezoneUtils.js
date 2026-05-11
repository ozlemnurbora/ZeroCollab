/**
 * Pure timezone-aware scheduling utilities.
 * Browser Intl API only — no external imports.
 */

export const TIMEZONE_OPTIONS = [
  // Americas
  { value: 'America/New_York', label: 'New York', region: 'Americas', offsetLabel: 'UTC-05:00 / -04:00' },
  { value: 'America/Chicago', label: 'Chicago', region: 'Americas', offsetLabel: 'UTC-06:00 / -05:00' },
  { value: 'America/Denver', label: 'Denver', region: 'Americas', offsetLabel: 'UTC-07:00 / -06:00' },
  { value: 'America/Los_Angeles', label: 'Los Angeles', region: 'Americas', offsetLabel: 'UTC-08:00 / -07:00' },
  { value: 'America/Sao_Paulo', label: 'São Paulo', region: 'Americas', offsetLabel: 'UTC-03:00' },

  // Europe
  { value: 'Europe/London', label: 'London', region: 'Europe', offsetLabel: 'UTC+00:00 / +01:00' },
  { value: 'Europe/Berlin', label: 'Berlin', region: 'Europe', offsetLabel: 'UTC+01:00 / +02:00' },
  { value: 'Europe/Paris', label: 'Paris', region: 'Europe', offsetLabel: 'UTC+01:00 / +02:00' },
  { value: 'Europe/Istanbul', label: 'Istanbul', region: 'Europe', offsetLabel: 'UTC+03:00' },
  { value: 'Europe/Moscow', label: 'Moscow', region: 'Europe', offsetLabel: 'UTC+03:00' },

  // Asia
  { value: 'Asia/Dubai', label: 'Dubai', region: 'Asia', offsetLabel: 'UTC+04:00' },
  { value: 'Asia/Kolkata', label: 'Mumbai', region: 'Asia', offsetLabel: 'UTC+05:30' },
  { value: 'Asia/Shanghai', label: 'Shanghai', region: 'Asia', offsetLabel: 'UTC+08:00' },
  { value: 'Asia/Tokyo', label: 'Tokyo', region: 'Asia', offsetLabel: 'UTC+09:00' },
  { value: 'Asia/Seoul', label: 'Seoul', region: 'Asia', offsetLabel: 'UTC+09:00' },

  // Oceania
  { value: 'Australia/Sydney', label: 'Sydney', region: 'Oceania', offsetLabel: 'UTC+10:00 / +11:00' },
]

const FALLBACK_TZ = 'Europe/Istanbul'
const WORK_START_MIN = 9 * 60
const WORK_END_MIN = 18 * 60

/**
 * @returns {string} IANA timezone string (e.g. "Europe/Istanbul")
 */
export function detectLocalTimezone() {
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (tz && typeof tz === 'string') return tz
    }
  } catch {
    // ignore — fall through to fallback
  }
  return FALLBACK_TZ
}

/**
 * Short locale abbreviation for a timezone at a given date (e.g. "EST", "TRT", "GMT+3").
 * @param {string} timezone
 * @param {Date} [date]
 * @returns {string}
 */
export function getTimezoneAbbreviation(timezone, date = new Date()) {
  const tz = timezone || FALLBACK_TZ
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
      hour: '2-digit',
    }).formatToParts(date)
    const tzPart = parts.find((p) => p.type === 'timeZoneName')
    if (tzPart && tzPart.value) return tzPart.value
  } catch {
    // ignore
  }
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
      hour: 'numeric',
    }).format(date)
    const match = /\s([A-Z]{2,5}|GMT[+-]?\d{0,2}(:\d{2})?)$/.exec(formatted)
    if (match) return match[1]
  } catch {
    // ignore
  }
  return ''
}

/**
 * UTC offset in minutes for a timezone at a given date.
 * Positive east of UTC, negative west (e.g. New York → -300 in winter, -240 in summer; Istanbul → +180).
 *
 * Implementation: compare the wall-clock representation of `date` in UTC and in the
 * target timezone — when both strings are re-parsed by the JS engine in local time,
 * their time-value delta equals the target zone's offset relative to UTC.
 *
 * @param {string} timezone
 * @param {Date} [date]
 * @returns {number} minutes
 */
export function getTimezoneOffsetMinutes(timezone, date = new Date()) {
  const tz = timezone || FALLBACK_TZ
  try {
    const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' })
    const tzStr = date.toLocaleString('en-US', { timeZone: tz })
    const utcTime = new Date(utcStr).getTime()
    const tzTime = new Date(tzStr).getTime()
    if (Number.isNaN(utcTime) || Number.isNaN(tzTime)) return 0
    return Math.round((tzTime - utcTime) / 60000)
  } catch {
    return 0
  }
}

/**
 * "UTC+03:00" / "UTC-05:30" / "UTC+00:00"
 * @param {number} offsetMinutes
 * @returns {string}
 */
export function formatUTCOffset(offsetMinutes) {
  const n = Number(offsetMinutes)
  if (!Number.isFinite(n)) return 'UTC+00:00'
  const sign = n >= 0 ? '+' : '-'
  const abs = Math.abs(n)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `UTC${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function parseHHMM(time) {
  if (time == null) return NaN
  const s = String(time).trim()
  const m = /^(\d{1,2}):(\d{2})$/.exec(s)
  if (!m) return NaN
  const h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (h < 0 || h > 23 || min < 0 || min > 59) return NaN
  return h * 60 + min
}

function formatHHMM(minutes) {
  const n = ((minutes % 1440) + 1440) % 1440
  const h = Math.floor(n / 60)
  const m = n % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function parseISODate(iso) {
  if (!iso || typeof iso !== 'string') return new Date(NaN)
  const parts = iso.trim().split('-').map((p) => parseInt(p, 10))
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return new Date(NaN)
  return new Date(parts[0], parts[1] - 1, parts[2])
}

function isoFromDate(d) {
  if (!d || Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function shiftISODate(iso, dayShift) {
  if (!iso) return iso
  const base = parseISODate(iso)
  if (Number.isNaN(base.getTime())) return iso
  base.setDate(base.getDate() + dayShift)
  return isoFromDate(base)
}

/**
 * Convert a wall-clock time from one timezone to another.
 *
 * @param {string} time - 'HH:MM' (in fromTimezone)
 * @param {string} date - 'YYYY-MM-DD' (in fromTimezone)
 * @param {string} fromTimezone
 * @param {string} toTimezone
 * @returns {{ time: string, date: string, dayShift: -1 | 0 | 1 }}
 */
export function convertTime(time, date, fromTimezone, toTimezone) {
  const safeTime = typeof time === 'string' ? time : ''
  const safeDate = typeof date === 'string' ? date : ''

  if (fromTimezone === toTimezone) {
    return { time: safeTime, date: safeDate, dayShift: 0 }
  }

  const sourceMinutes = parseHHMM(safeTime)
  if (Number.isNaN(sourceMinutes)) {
    return { time: safeTime, date: safeDate, dayShift: 0 }
  }

  const baseDate = parseISODate(safeDate)
  const refDate = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate

  const fromOffset = getTimezoneOffsetMinutes(fromTimezone, refDate)
  const toOffset = getTimezoneOffsetMinutes(toTimezone, refDate)

  const converted = sourceMinutes - fromOffset + toOffset

  let dayShift = 0
  let finalMinutes = converted
  if (converted < 0) {
    dayShift = -1
    finalMinutes = converted + 1440
  } else if (converted >= 1440) {
    dayShift = 1
    finalMinutes = converted - 1440
  }

  const outDate = safeDate ? shiftISODate(safeDate, dayShift) : ''

  return {
    time: formatHHMM(finalMinutes),
    date: outDate,
    dayShift,
  }
}

/**
 * "14:00 TRT (UTC+03:00)"
 * @param {string} time - 'HH:MM'
 * @param {string} timezone
 * @param {Date} [referenceDate]
 * @returns {string}
 */
export function formatTimeWithTimezone(time, timezone, referenceDate = new Date()) {
  const abbr = getTimezoneAbbreviation(timezone, referenceDate)
  const offset = formatUTCOffset(getTimezoneOffsetMinutes(timezone, referenceDate))
  const timeLabel = typeof time === 'string' && time ? time : ''
  const abbrPart = abbr ? ` ${abbr}` : ''
  return `${timeLabel}${abbrPart} (${offset})`.trim()
}

/**
 * Convert a single meeting time into every distinct participant timezone.
 *
 * @param {string} time - 'HH:MM' in meetingTimezone
 * @param {string} date - 'YYYY-MM-DD' in meetingTimezone
 * @param {string} meetingTimezone
 * @param {string[]} participantTimezones
 * @returns {Array<{ timezone: string, time: string, date: string, dayShift: -1|0|1, label: string, offset: string, abbreviation: string }>}
 */
export function getMultiTimezoneDisplay(
  time,
  date,
  meetingTimezone,
  participantTimezones = [],
) {
  const unique = []
  const seen = new Set()
  const baseList = [meetingTimezone, ...(Array.isArray(participantTimezones) ? participantTimezones : [])]
  for (const tz of baseList) {
    if (!tz || typeof tz !== 'string') continue
    if (seen.has(tz)) continue
    seen.add(tz)
    unique.push(tz)
  }

  const refDate = parseISODate(date)
  const ref = Number.isNaN(refDate.getTime()) ? new Date() : refDate

  return unique.map((tz) => {
    const converted = convertTime(time, date, meetingTimezone, tz)
    const offset = formatUTCOffset(getTimezoneOffsetMinutes(tz, ref))
    const abbreviation = getTimezoneAbbreviation(tz, ref)
    const abbrPart = abbreviation ? ` ${abbreviation}` : ''
    return {
      timezone: tz,
      time: converted.time,
      date: converted.date,
      dayShift: converted.dayShift,
      offset,
      abbreviation,
      label: `${converted.time}${abbrPart} (${offset})`,
    }
  })
}

/**
 * Search every starting hour (UTC) and score how many participants land inside
 * 09:00–18:00 local working hours for the full meeting duration. Best score wins;
 * ties go to the earlier hour.
 *
 * @param {string[]} timezones
 * @param {number} durationMinutes
 * @returns {{
 *   bestHour: number,
 *   coverage: number,
 *   details: Array<{
 *     hour: number,
 *     inWork: number,
 *     total: number,
 *     perTimezone: Array<{ timezone: string, localTime: string, inWork: boolean }>,
 *   }>,
 * }}
 */
export function findBestMeetingTime(timezones, durationMinutes) {
  const tzList = (Array.isArray(timezones) ? timezones : []).filter(
    (tz) => typeof tz === 'string' && tz.length > 0,
  )
  const duration = Number.isFinite(Number(durationMinutes)) && Number(durationMinutes) > 0
    ? Number(durationMinutes)
    : 60

  if (tzList.length === 0) {
    return { bestHour: 9, coverage: 0, details: [] }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const referenceISO = isoFromDate(today)

  const tzOffsetCache = new Map()
  for (const tz of tzList) {
    tzOffsetCache.set(tz, getTimezoneOffsetMinutes(tz, today))
  }

  const details = []
  let bestHour = 0
  let bestCoverage = -1

  for (let hour = 0; hour < 24; hour += 1) {
    const utcStartMinutes = hour * 60
    let inWork = 0
    const perTimezone = []

    for (const tz of tzList) {
      const offset = tzOffsetCache.get(tz) ?? 0
      const local = utcStartMinutes + offset
      const localStart = ((local % 1440) + 1440) % 1440
      const localEnd = localStart + duration
      const fits = localStart >= WORK_START_MIN && localEnd <= WORK_END_MIN
      if (fits) inWork += 1
      perTimezone.push({
        timezone: tz,
        localTime: formatHHMM(localStart),
        inWork: fits,
      })
    }

    details.push({
      hour,
      inWork,
      total: tzList.length,
      perTimezone,
    })

    if (inWork > bestCoverage) {
      bestCoverage = inWork
      bestHour = hour
    }
  }

  const coverage = tzList.length > 0 ? bestCoverage / tzList.length : 0

  return {
    bestHour,
    coverage,
    details,
  }
}

export { FALLBACK_TZ }
