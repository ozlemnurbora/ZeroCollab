/**
 * Pure scheduling conflict utilities (no project imports).
 * Used when creating/editing meetings against existing meetings and optionally tasks.
 */

const MINUTES_PER_DAY = 24 * 60

/**
 * @param {string} iso - 'YYYY-MM-DD'
 * @returns {Date} Local midnight for that calendar day
 */
function parseLocalDate(iso) {
  if (!iso || typeof iso !== 'string') return new Date(NaN)
  const parts = iso.trim().split('-').map((p) => parseInt(p, 10))
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return new Date(NaN)
  const [y, m, d] = parts
  return new Date(y, m - 1, d)
}

/**
 * @param {string} time - 'HH:MM' or 'H:MM'
 * @returns {number} minutes from midnight, or NaN
 */
function parseTimeToMinutes(time) {
  if (time == null || time === '') return NaN
  const s = String(time).trim()
  const m = /^(\d{1,2}):(\d{2})$/.exec(s)
  if (!m) return NaN
  const h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (h < 0 || h > 23 || min < 0 || min > 59) return NaN
  return h * 60 + min
}

/**
 * Half-open range overlap: [s1, e1) and [s2, e2) overlap iff s1 < e2 && s2 < e1
 * @param {{ start: number, end: number }} a
 * @param {{ start: number, end: number }} b
 */
function rangesOverlap(a, b) {
  if (!a || !b) return false
  const s1 = a.start
  const e1 = a.end
  const s2 = b.start
  const e2 = b.end
  if ([s1, e1, s2, e2].some((n) => Number.isNaN(n))) return false
  return s1 < e2 && s2 < e1
}

/**
 * Whether a recurring (or single) meeting has an occurrence on targetDate ('YYYY-MM-DD').
 * - none / missing: only when meeting.date === targetDate
 * - daily: target is on or after meeting.date (calendar day)
 * - weekly: target >= base and whole-day offset from base is multiple of 7
 * - monthly: target >= base and same day-of-month
 *
 * @param {object} meeting
 * @param {string} targetDate - 'YYYY-MM-DD'
 * @returns {boolean}
 */
function getRecurringOccurrences(meeting, targetDate) {
  if (!meeting || !targetDate) return false
  const base = parseLocalDate(meeting.date)
  const target = parseLocalDate(targetDate)
  if (Number.isNaN(base.getTime()) || Number.isNaN(target.getTime())) return false

  const recurring = String(meeting.recurring ?? 'none').toLowerCase()
  if (recurring === 'none' || recurring === '') {
    return String(meeting.date ?? '').trim() === String(targetDate).trim()
  }

  if (target < base) return false

  if (recurring === 'daily') return true

  if (recurring === 'weekly') {
    const diffMs = target.getTime() - base.getTime()
    const diffDays = Math.round(diffMs / 86400000)
    return diffDays >= 0 && diffDays % 7 === 0
  }

  if (recurring === 'monthly') {
    return target.getDate() === base.getDate()
  }

  return false
}

/**
 * @param {object} meeting - expects date, time, duration (minutes), title, id
 * @returns {{ start: number, end: number, id: *, title: string }}
 */
function meetingToRange(meeting) {
  const id = meeting?.id ?? null
  const title = meeting?.title != null ? String(meeting.title) : ''
  const start = parseTimeToMinutes(meeting?.time)
  const duration = Number(meeting?.duration)
  const dur = Number.isFinite(duration) && duration > 0 ? duration : 60
  if (Number.isNaN(start)) {
    return { start: NaN, end: NaN, id, title }
  }
  let end = start + dur
  if (end > MINUTES_PER_DAY) end = MINUTES_PER_DAY
  if (end <= start) end = Math.min(start + 1, MINUTES_PER_DAY)
  return { start, end, id, title }
}

function formatTimeLabel(minutesFromMidnight) {
  if (Number.isNaN(minutesFromMidnight)) return ''
  const h = Math.floor(minutesFromMidnight / 60)
  const m = minutesFromMidnight % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function proposedToRange(proposed) {
  const start = parseTimeToMinutes(proposed?.time)
  const duration = Number(proposed?.duration)
  const dur = Number.isFinite(duration) && duration > 0 ? duration : 60
  if (Number.isNaN(start)) {
    return { start: NaN, end: NaN }
  }
  let end = start + dur
  if (end > MINUTES_PER_DAY) end = MINUTES_PER_DAY
  if (end <= start) end = Math.min(start + 1, MINUTES_PER_DAY)
  return { start, end }
}

function taskOccursOnDate(task, isoDate) {
  const due = task?.dueDate ?? task?.date
  if (!due) return false
  const d = String(due).trim()
  if (d.length >= 10) return d.slice(0, 10) === isoDate
  return d === isoDate
}

/**
 * Task range: optional task.time or task.dueTime (HH:MM); otherwise full day [0, MINUTES_PER_DAY).
 */
function taskToRange(task) {
  const id = task?.id ?? null
  const title = task?.title != null ? String(task.title) : ''
  const t = task?.time ?? task?.dueTime
  const start = parseTimeToMinutes(t)
  if (!Number.isNaN(start)) {
    const duration = Number(task?.duration)
    const dur = Number.isFinite(duration) && duration > 0 ? duration : 60
    let end = start + dur
    if (end > MINUTES_PER_DAY) end = MINUTES_PER_DAY
    if (end <= start) end = Math.min(start + 1, MINUTES_PER_DAY)
    return { start, end, id, title }
  }
  return { start: 0, end: MINUTES_PER_DAY, id, title }
}

/**
 * @param {object} proposed - { date, time, duration, id? }
 * @param {object[]} existingMeetings
 * @param {object[]} existingTasks
 * @param {object} [options]
 * @param {string} [options.excludeId] - meeting id to skip (edit mode)
 * @param {boolean} [options.checkTasks] - default false
 * @returns {{ hasConflict: boolean, conflicts: Array<{ type: 'meeting'|'task', id, title, time }> }}
 */
export function detectConflicts(
  proposed,
  existingMeetings = [],
  existingTasks = [],
  options = {},
) {
  const conflicts = []
  const excludeId = options.excludeId

  const proposedDate = proposed?.date
  if (!proposedDate || typeof proposedDate !== 'string') {
    return { hasConflict: false, conflicts: [] }
  }

  const pRange = proposedToRange(proposed)
  if (Number.isNaN(pRange.start) || Number.isNaN(pRange.end)) {
    return { hasConflict: false, conflicts: [] }
  }

  const meetings = Array.isArray(existingMeetings) ? existingMeetings : []
  for (const m of meetings) {
    if (!m) continue
    if (excludeId != null && String(m.id) === String(excludeId)) continue

    const occurs = getRecurringOccurrences(m, proposedDate)
    if (!occurs) continue

    const mRange = meetingToRange(m)
    if (Number.isNaN(mRange.start) || Number.isNaN(mRange.end)) continue

    if (rangesOverlap(pRange, mRange)) {
      conflicts.push({
        type: 'meeting',
        id: m.id,
        title: mRange.title,
        time: formatTimeLabel(mRange.start),
      })
    }
  }

  const checkTasks = Boolean(options.checkTasks)
  if (checkTasks) {
    const tasks = Array.isArray(existingTasks) ? existingTasks : []
    for (const task of tasks) {
      if (!task) continue
      if (!taskOccursOnDate(task, proposedDate)) continue
      const tRange = taskToRange(task)
      if (rangesOverlap(pRange, tRange)) {
        const startLabel = formatTimeLabel(tRange.start)
        const timeLabel =
          tRange.start === 0 && tRange.end >= MINUTES_PER_DAY
            ? ''
            : startLabel
        conflicts.push({
          type: 'task',
          id: task.id,
          title: tRange.title,
          time: timeLabel,
        })
      }
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
  }
}

/**
 * @param {Array<{ type: 'meeting'|'task', id, title, time }>} conflicts
 * @param {'en'|'tr'} [lang]
 * @returns {string}
 */
export function formatConflictSummary(conflicts, lang = 'en') {
  const list = Array.isArray(conflicts) ? conflicts : []
  const meetingConflicts = list.filter((c) => c?.type === 'meeting')
  const taskConflicts = list.filter((c) => c?.type === 'task')
  const parts = []

  if (lang === 'tr') {
    if (meetingConflicts.length > 0) {
      const n = meetingConflicts.length
      const details = meetingConflicts
        .map((c) => {
          const title = c.title != null ? String(c.title) : ''
          const tm = c.time != null ? String(c.time) : ''
          const timePart = tm ? ` (${tm})` : ''
          return `"${title}"${timePart}`
        })
        .join(', ')
      parts.push(`${n} toplantı ile çakışıyor: ${details}`)
    }
    if (taskConflicts.length > 0) {
      const n = taskConflicts.length
      parts.push(`${n} görevin bitiş tarihi bu güne denk geliyor`)
    }
  } else {
    if (meetingConflicts.length > 0) {
      const n = meetingConflicts.length
      const label = n === 1 ? 'meeting' : 'meetings'
      const details = meetingConflicts
        .map((c) => {
          const title = c.title != null ? String(c.title) : ''
          const tm = c.time != null ? String(c.time) : ''
          const timePart = tm ? ` (${tm})` : ''
          return `"${title}"${timePart}`
        })
        .join(', ')
      parts.push(`Conflicts with ${n} ${label}: ${details}`)
    }
    if (taskConflicts.length > 0) {
      const n = taskConflicts.length
      const label = n === 1 ? 'task' : 'tasks'
      parts.push(`${n} ${label} due on this date`)
    }
  }

  return parts.join(' ')
}
