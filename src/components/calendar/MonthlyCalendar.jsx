import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { DayCell } from './DayCell.jsx'
import {
  addDaysCalendar,
  getMonthGrid,
  isoDateMatchesLocalDate,
  parseISODateLocal,
  startOfDay,
  startOfWeekMonday,
  toISODate,
} from './calendarDateUtils.js'
import { statusColorClasses } from './taskIndicators.js'
import { Button } from '../ui/Button.jsx'
import { useLanguage } from '../../utils/LanguageContext.jsx'

function CalendarTaskRow({ task, statusLabel, onJoin }) {
  if (task.isMeeting) {
    return (
      <li className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1.5">
        <p className="truncate text-xs font-medium text-violet-300">📅 {task.title}</p>
        <p className="mt-1 text-[10px] text-[rgb(var(--zc-muted2))]">
          {task.time} • {task.duration} min
        </p>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onJoin?.()
          }}
          className="mt-1.5 w-full rounded-md bg-violet-500 px-2 py-1 text-[10px] font-medium text-white hover:bg-violet-400"
        >
          Join
        </button>
      </li>
    )
  }

  return (
    <li className="flex items-center justify-between gap-2 py-1.5 text-left">
      <span className="min-w-0 truncate text-xs font-medium text-[rgb(var(--zc-text))]">
        {task.title}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <span
          className={['h-1.5 w-1.5 shrink-0 rounded-full', statusColorClasses(task.status)].join(
            ' ',
          )}
          aria-hidden="true"
        />
        <span className="text-[10px] text-[rgb(var(--zc-muted))]">{statusLabel(task.status)}</span>
      </span>
    </li>
  )
}

export function MonthlyCalendar({
  viewMode = 'month',
  viewDate,
  onChangeViewDate,
  selectedISODate,
  onSelectISODate,
  tasksByISODate,
  meetingsByISODate,
  onNavigatePrev,
  onNavigateNext,
  onGoToday,
}) {
  const { t, locale } = useLanguage()
  const navigate = useNavigate()
  const grid = getMonthGrid(viewDate)
  const today = new Date()

  const safeFocus = useMemo(() => {
    const d = parseISODateLocal(selectedISODate)
    return Number.isNaN(d.getTime()) ? startOfDay(new Date()) : startOfDay(d)
  }, [selectedISODate])

  const dayKeys = [
    'cal_day_mon',
    'cal_day_tue',
    'cal_day_wed',
    'cal_day_thu',
    'cal_day_fri',
    'cal_day_sat',
    'cal_day_sun',
  ]

  const statusLabel = (status) => {
    if (status === 'done') return t('status_done')
    if (status === 'in_progress') return t('status_in_progress')
    return t('status_todo')
  }

  const monthTitle = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
  }).format(viewDate)

  const weekStart = startOfWeekMonday(safeFocus)
  const weekFmtShort = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }),
    [locale],
  )
  const weekFmtYear = useMemo(() => new Intl.DateTimeFormat(locale, { year: 'numeric' }), [locale])
  const weekLast = addDaysCalendar(weekStart, 6)
  const weekTitle = `${weekFmtShort.format(weekStart)} – ${weekFmtShort.format(weekLast)}, ${weekFmtYear.format(weekLast)}`

  const dayLongTitle = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(safeFocus)

  const headerTitle =
    viewMode === 'month' ? monthTitle : viewMode === 'week' ? weekTitle : dayLongTitle

  const weekDays = useMemo(() => {
    const days = []
    for (let i = 0; i < 7; i++) days.push(addDaysCalendar(weekStart, i))
    return days
  }, [weekStart])

  const dayTasks = tasksByISODate?.get(toISODate(safeFocus)) ?? []
  const dayMeetings = meetingsByISODate?.get(toISODate(safeFocus)) ?? []
  const dayItems = [...dayMeetings, ...dayTasks]

  return (
    <section className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)]">
      <header className="flex flex-col gap-2 border-b border-[rgb(var(--zc-border))] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[rgb(var(--zc-text))] sm:text-base">
            {headerTitle}
          </h2>
          <p className="mt-0.5 text-[11px] text-[rgb(var(--zc-subtle))] sm:mt-1 sm:text-xs">
            {t('cal_click_day')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onNavigatePrev}>
            {t('cal_prev')}
          </Button>
          <Button variant="secondary" size="sm" onClick={onGoToday}>
            {t('cal_today')}
          </Button>
          <Button variant="secondary" size="sm" onClick={onNavigateNext}>
            {t('cal_next')}
          </Button>
        </div>
      </header>

      {viewMode === 'month' ? (
        <div className="grid grid-cols-7 gap-1 px-3 py-2">
          {dayKeys.map((key) => (
            <div
              key={key}
              className="px-0.5 pb-0.5 text-[10px] font-medium leading-none text-[rgb(var(--zc-muted2))]"
            >
              {t(key)}
            </div>
          ))}

          {grid.map((date) => {
            const inCurrentMonth = date.getMonth() === viewDate.getMonth()
            const iso = toISODate(date)
            const tasks = tasksByISODate?.get(iso) ?? []
            const meetings = meetingsByISODate?.get(iso) ?? []
            const items = [...meetings, ...tasks]
            const selected = selectedISODate
              ? isoDateMatchesLocalDate(selectedISODate, date)
              : false

            return (
              <DayCell
                key={iso}
                date={date}
                inCurrentMonth={inCurrentMonth}
                tasks={items}
                selected={selected}
                onSelect={(nextISO) => {
                  onSelectISODate?.(nextISO)
                  if (!inCurrentMonth) {
                    onChangeViewDate?.(new Date(date.getFullYear(), date.getMonth(), 1))
                  }
                }}
              />
            )
          })}
        </div>
      ) : null}

      {viewMode === 'week' ? (
        <div className="grid grid-cols-7 gap-2 border-t border-[rgb(var(--zc-border)/0.5)] px-2 py-3 sm:px-3">
          {weekDays.map((date, i) => {
            const iso = toISODate(date)
            const tasks = tasksByISODate?.get(iso) ?? []
            const meetings = meetingsByISODate?.get(iso) ?? []
            const items = [...meetings, ...tasks]
            const selected = iso === selectedISODate
            const wday = t(dayKeys[i])

            return (
              <div key={iso} className="min-w-0">
                <button
                  type="button"
                  onClick={() => onSelectISODate?.(iso)}
                  className={[
                    'flex w-full flex-col rounded-lg border px-1.5 py-2 text-left transition',
                    'border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.25)] hover:bg-[rgb(var(--zc-bg)/0.45)]',
                    selected ? 'ring-2 ring-indigo-500/50' : '',
                  ].join(' ')}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--zc-muted2))]">
                    {wday}
                  </span>
                  <span
                    className={[
                      'mt-0.5 text-sm font-semibold',
                      toISODate(today) === iso
                        ? 'text-indigo-400'
                        : 'text-[rgb(var(--zc-text))]',
                    ].join(' ')}
                  >
                    {date.getDate()}
                  </span>
                  <ul className="mt-2 max-h-64 space-y-0 overflow-y-auto">
                    {items.map((task) => (
                      <CalendarTaskRow
                        key={`${task.id}_${task.occurrenceDate || iso || ''}`}
                        task={task}
                        statusLabel={statusLabel}
                        onJoin={() => navigate('/chat')}
                      />
                    ))}
                  </ul>
                </button>
              </div>
            )
          })}
        </div>
      ) : null}

      {viewMode === 'day' ? (
        <div className="border-t border-[rgb(var(--zc-border)/0.5)] px-4 py-6 sm:px-8">
          <div className="mx-auto max-w-lg">
            <p className="text-center text-xs font-medium uppercase tracking-wide text-[rgb(var(--zc-muted2))]">
              {new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(safeFocus)}
            </p>
            <p className="mt-1 text-center text-3xl font-semibold tabular-nums text-[rgb(var(--zc-text))]">
              {safeFocus.getDate()}
            </p>
            <p className="mt-1 text-center text-sm text-[rgb(var(--zc-muted))]">
              {new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(safeFocus)}
            </p>
            <ul className="mt-8 divide-y divide-[rgb(var(--zc-border))] rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.2)] px-3">
              {dayItems.length ? (
                dayItems.map((task) => (
                  <CalendarTaskRow
                    key={`${task.id}_${task.occurrenceDate || toISODate(safeFocus) || ''}`}
                    task={task}
                    statusLabel={statusLabel}
                    onJoin={() => navigate('/chat')}
                  />
                ))
              ) : (
                <li className="py-8 text-center text-sm text-[rgb(var(--zc-muted2))]">
                  {t('day_modal_empty')}
                </li>
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  )
}
