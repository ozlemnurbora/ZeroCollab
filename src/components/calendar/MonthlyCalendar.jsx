import { DayCell } from './DayCell.jsx'
import { DAY_HEADERS, getMonthGrid, isSameDay, monthTitle, toISODate } from './calendarDateUtils.js'
import { Button } from '../ui/Button.jsx'

export function MonthlyCalendar({
  viewDate,
  onChangeViewDate,
  selectedISODate,
  onSelectISODate,
  tasksByISODate,
}) {
  const grid = getMonthGrid(viewDate)
  const title = monthTitle(viewDate)
  const today = new Date()

  const goToday = () => onChangeViewDate?.(new Date(today.getFullYear(), today.getMonth(), 1))
  const prevMonth = () =>
    onChangeViewDate?.(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))
  const nextMonth = () =>
    onChangeViewDate?.(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))

  return (
    <section className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)]">
      <header className="flex flex-col gap-3 border-b border-[rgb(var(--zc-border))] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-[rgb(var(--zc-text))]">
            {title}
          </h2>
          <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
            Click a day to view tasks and add new ones.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={prevMonth}>
            Prev
          </Button>
          <Button variant="secondary" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button variant="secondary" size="sm" onClick={nextMonth}>
            Next
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-7 gap-2 px-4 py-3">
        {DAY_HEADERS.map((h) => (
          <div
            key={h}
            className="px-1 pb-1 text-xs font-medium text-[rgb(var(--zc-muted2))]"
          >
            {h}
          </div>
        ))}

        {grid.map((date) => {
          const inCurrentMonth = date.getMonth() === viewDate.getMonth()
          const iso = toISODate(date)
          const tasks = tasksByISODate?.get(iso) ?? []
          const selected = selectedISODate
            ? isSameDay(new Date(`${selectedISODate}T00:00:00`), date)
            : false

          return (
            <DayCell
              key={iso}
              date={date}
              inCurrentMonth={inCurrentMonth}
              tasks={tasks}
              selected={selected}
              onSelect={(nextISO) => {
                onSelectISODate?.(nextISO)
                // If user clicks a day in adjacent month, move view to that month
                if (!inCurrentMonth) {
                  onChangeViewDate?.(
                    new Date(date.getFullYear(), date.getMonth(), 1),
                  )
                }
              }}
            />
          )
        })}
      </div>
    </section>
  )
}

