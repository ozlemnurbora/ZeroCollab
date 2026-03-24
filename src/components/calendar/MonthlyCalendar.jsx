import { DayCell } from './DayCell.jsx'
import { getMonthGrid, isSameDay, toISODate } from './calendarDateUtils.js'
import { Button } from '../ui/Button.jsx'
import { useLanguage } from '../../utils/LanguageContext.jsx'

export function MonthlyCalendar({
  viewDate,
  onChangeViewDate,
  selectedISODate,
  onSelectISODate,
  tasksByISODate,
}) {
  const { t, locale } = useLanguage()
  const grid = getMonthGrid(viewDate)
  const title = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
  }).format(viewDate)
  const today = new Date()

  const dayKeys = [
    'cal_day_mon',
    'cal_day_tue',
    'cal_day_wed',
    'cal_day_thu',
    'cal_day_fri',
    'cal_day_sat',
    'cal_day_sun',
  ]

  const goToday = () =>
    onChangeViewDate?.(new Date(today.getFullYear(), today.getMonth(), 1))
  const prevMonth = () =>
    onChangeViewDate?.(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))
  const nextMonth = () =>
    onChangeViewDate?.(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))

  return (
    <section className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)]">
      <header className="flex flex-col gap-3 border-b border-[rgb(var(--zc-border))] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-[rgb(var(--zc-text))]">{title}</h2>
          <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">{t('cal_click_day')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={prevMonth}>
            {t('cal_prev')}
          </Button>
          <Button variant="secondary" size="sm" onClick={goToday}>
            {t('cal_today')}
          </Button>
          <Button variant="secondary" size="sm" onClick={nextMonth}>
            {t('cal_next')}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-7 gap-2 px-4 py-3">
        {dayKeys.map((key) => (
          <div
            key={key}
            className="px-1 pb-1 text-xs font-medium text-[rgb(var(--zc-muted2))]"
          >
            {t(key)}
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
