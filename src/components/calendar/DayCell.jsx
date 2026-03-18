import { isToday, toISODate } from './calendarDateUtils.js'
import { statusColorClasses } from './taskIndicators.js'

export function DayCell({
  date,
  inCurrentMonth,
  tasks = [],
  selected,
  onSelect,
}) {
  const iso = toISODate(date)
  const today = isToday(date)

  return (
    <button
      type="button"
      onClick={() => onSelect?.(iso)}
      className={[
        'group relative flex h-24 w-full flex-col rounded-lg border p-2 text-left transition',
        'border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)] hover:bg-[rgb(var(--zc-bg)/0.5)]',
        selected ? 'ring-2 ring-indigo-500/50' : '',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={[
            'inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold',
            today
              ? 'bg-indigo-500 text-white'
              : inCurrentMonth
                ? 'text-[rgb(var(--zc-text))]'
                : 'text-[rgb(var(--zc-subtle))]',
          ].join(' ')}
        >
          {date.getDate()}
        </span>

        {tasks.length ? (
          <span className="text-[11px] text-[rgb(var(--zc-subtle))]">
            {tasks.length}
          </span>
        ) : null}
      </div>

      <div className="mt-auto flex flex-wrap gap-1 pt-2">
        {tasks.slice(0, 6).map((t) => (
          <span
            key={t.id}
            className={[
              'h-1.5 w-1.5 rounded-full',
              statusColorClasses(t.status),
            ].join(' ')}
            aria-hidden="true"
            title={t.title}
          />
        ))}
        {tasks.length > 6 ? (
          <span className="text-[11px] text-[rgb(var(--zc-subtle))]">
            +{tasks.length - 6}
          </span>
        ) : null}
      </div>
    </button>
  )
}

