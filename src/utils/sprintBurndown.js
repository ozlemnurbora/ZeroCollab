import { normalizeStoryPointsValue } from '../components/kanban/taskStorage.js'

function parseDateOnlyToLocalNoon(value) {
  if (value == null || value === '') return null
  const s = String(value).trim()
  if (!s) return null
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00` : s
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return t
}

function localYmd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function endOfLocalDayMs(dayDate) {
  const d = new Date(dayDate)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

export function sprintDayRangeMs(startRaw, endRaw) {
  const startMs = parseDateOnlyToLocalNoon(startRaw)
  const endMs = parseDateOnlyToLocalNoon(endRaw)
  if (startMs == null || endMs == null) return null
  const start = new Date(startMs)
  start.setHours(0, 0, 0, 0)
  const end = new Date(endMs)
  end.setHours(0, 0, 0, 0)
  if (end < start) return null
  const days = []
  const cur = new Date(start)
  while (cur <= end) {
    days.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  const lastDayEnd = endOfLocalDayMs(days[days.length - 1])
  return { days, startMs: start.getTime(), endMs: lastDayEnd }
}

export function totalCommittedStoryPoints(sprintTasks) {
  const list = Array.isArray(sprintTasks) ? sprintTasks : []
  return list.reduce((sum, t) => {
    const sp = normalizeStoryPointsValue(
      t?.storyPoints ?? t?.story_points ?? t?.points ?? 0,
    )
    return sum + sp
  }, 0)
}

function completionTimestampForDoneTask(task) {
  if (!task || String(task.status || '').toLowerCase() !== 'done') return null
  const candidates = [
    task.doneAt,
    task.done_at,
    task.updatedAt,
    task.updated_at,
    task.createdAt,
    task.created_at,
  ]
  for (const raw of candidates) {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw
    if (typeof raw === 'string' && raw.trim()) {
      const n = Number(raw)
      if (Number.isFinite(n)) return n
      const t = Date.parse(raw)
      if (Number.isFinite(t)) return t
    }
  }
  return null
}

function cumulativeDoneSpByEndOfDay(sprintTasks, dayEndMs) {
  const list = Array.isArray(sprintTasks) ? sprintTasks : []
  let sum = 0
  for (const t of list) {
    if (String(t?.status || '').toLowerCase() !== 'done') continue
    const ts = completionTimestampForDoneTask(t)
    if (ts == null || ts > dayEndMs) continue
    sum += normalizeStoryPointsValue(
      t?.storyPoints ?? t?.story_points ?? t?.points ?? 0,
    )
  }
  return sum
}

/**
 * @returns {{ chartData: Array<{ key: string, label: string, ideal: number, actual: number }>, meta: object } | null }
 */
export function buildSprintBurndownSeries(activeSprint, sprintTasks) {
  if (!activeSprint) return null
  const startRaw =
    activeSprint.start_date ?? activeSprint.startDate ?? activeSprint.start
  const endRaw = activeSprint.end_date ?? activeSprint.endDate ?? activeSprint.end
  const range = sprintDayRangeMs(startRaw, endRaw)
  if (!range || range.days.length === 0) return null

  const total = totalCommittedStoryPoints(sprintTasks)
  const n = range.days.length
  const seg = Math.max(1, n - 1)

  const chartData = range.days.map((day, i) => {
    const dayEnd = endOfLocalDayMs(day)
    const ideal =
      total <= 0 ? 0 : Math.max(0, total * (1 - i / seg))
    const doneByDay = cumulativeDoneSpByEndOfDay(sprintTasks, dayEnd)
    const actual = Math.max(0, total - doneByDay)
    const label = day.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
    const key = localYmd(day)
    return { key, label, ideal, actual, dayEnd }
  })

  let todayKey = null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const firstDay = range.days[0]
  const lastDay = range.days[range.days.length - 1]
  if (firstDay && lastDay && today >= firstDay && today <= lastDay) {
    todayKey = localYmd(today)
  }

  const doneNow = (Array.isArray(sprintTasks) ? sprintTasks : []).filter(
    (t) => String(t?.status || '').toLowerCase() === 'done',
  )
  const completedSp = doneNow.reduce(
    (s, t) =>
      s +
      normalizeStoryPointsValue(
        t?.storyPoints ?? t?.story_points ?? t?.points ?? 0,
      ),
    0,
  )
  const lastActual =
    chartData.length > 0 ? chartData[chartData.length - 1].actual : 0

  return {
    chartData,
    meta: {
      totalCommitted: total,
      remainingActual: lastActual,
      completedSp,
      todayKey,
    },
  }
}
