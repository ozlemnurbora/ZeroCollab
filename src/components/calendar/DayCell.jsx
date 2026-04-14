import { isToday, toISODate } from './calendarDateUtils.js'
import { taskBadgeClasses } from './taskIndicators.js'
import { useLanguage } from '../../utils/LanguageContext.jsx'

/** Tasks per day are sorted newest-first in CalendarPage; first entry is shown. */
const TITLE_DISPLAY_MAX = 15

function shortTitle(title) {
  const s = (title ?? '').trim()
  if (s.length <= TITLE_DISPLAY_MAX) return s
  return `${s.slice(0, TITLE_DISPLAY_MAX - 1)}…`
}

export function DayCell({
  date,
  inCurrentMonth,
  tasks = [],
  selected,
  onSelect,
}) {
  const { t } = useLanguage()
  const iso = toISODate(date)
  const today = isToday(date)
  const primary = tasks[0]
  const moreCount = Math.max(0, tasks.length - 1)

  return (
    <button
      type="button"
      onClick={() => onSelect?.(iso)}
      className={[
        'group relative flex h-[84px] max-h-[84px] w-full flex-col overflow-hidden rounded-lg border p-1.5 text-left transition',
        'border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)] hover:bg-[rgb(var(--zc-bg)/0.5)]',
        selected ? 'ring-2 ring-indigo-500/50' : '',
      ].join(' ')}
    >
      <div className="flex shrink-0 items-start">
        <span
          className={[
            'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold leading-none',
            today
              ? 'bg-indigo-500 text-white'
              : inCurrentMonth
                ? 'text-[rgb(var(--zc-text))]'
                : 'text-[rgb(var(--zc-subtle))]',
          ].join(' ')}
        >
          {date.getDate()}
        </span>
      </div>

      <div className="mt-0.5 flex min-h-0 flex-1 flex-col justify-end gap-0.5 overflow-hidden">
        {primary ? (
          <span
            className={[
              'block w-full overflow-hidden text-ellipsis whitespace-nowrap rounded px-1 py-px text-left text-[9px] font-medium leading-none',
              primary.isMeeting
                ? 'bg-violet-500/20 text-violet-200 ring-1 ring-violet-500/40'
                : taskBadgeClasses(primary.status),
            ].join(' ')}
            title={primary.title}
          >
            {primary.isMeeting ? `📅 ${shortTitle(primary.title)}` : shortTitle(primary.title)}
          </span>
        ) : null}
        {moreCount > 0 ? (
          <span className="truncate text-[9px] leading-none text-[rgb(var(--zc-subtle))]">
            {t('cal_more_tasks', { count: moreCount })}
          </span>
        ) : null}
      </div>
    </button>
  )
}

