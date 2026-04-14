import { Button } from '../ui/Button.jsx'
import { statusColorClasses } from './taskIndicators.js'
import { useLanguage } from '../../utils/LanguageContext.jsx'
import { useNavigate } from 'react-router-dom'

export function DayTasksModal({
  open,
  onClose,
  isoDate,
  tasks,
  meetings,
  onAdd,
  onTaskClick,
}) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const title = isoDate
    ? t('day_modal_title', { date: isoDate })
    : t('modal_add_task')
  const dayTasks = tasks ?? []
  const dayMeetings = meetings ?? []

  const statusLabel = (status) => {
    if (status === 'done') return t('status_done')
    if (status === 'in_progress') return t('status_in_progress')
    return t('status_todo')
  }

  return (
    <div
      role="complementary"
      aria-hidden={!open}
      className={[
        'fixed right-0 top-0 z-40 flex h-screen w-80 flex-col border-l border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.97)] shadow-2xl transition-transform duration-200 ease-out',
        open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
      ].join(' ')}
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[rgb(var(--zc-border))] px-4 py-3">
        <h2 className="text-sm font-semibold leading-snug text-[rgb(var(--zc-text))] sm:text-base">
          {title}
        </h2>
        <button
          type="button"
          className="rounded-md p-1 text-[rgb(var(--zc-muted2))] hover:bg-[rgb(var(--zc-border))] hover:text-[rgb(var(--zc-text))]"
          onClick={onClose}
          aria-label={t('btn_close')}
        >
          <span className="sr-only">{t('btn_close')}</span>✕
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {dayMeetings.length || dayTasks.length ? (
          <div className="space-y-4">
            {dayTasks.length ? (
              <ul className="divide-y divide-[rgb(var(--zc-border))]">
                {dayTasks.map((task) => (
                  <li key={task.id} className="py-1.5">
                    <button
                      type="button"
                      onClick={() => onTaskClick?.(task)}
                      className="flex w-full items-center justify-between gap-4 rounded-lg px-2 py-2 text-left transition hover:bg-[rgb(var(--zc-border)/0.35)]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[rgb(var(--zc-text))]">
                          {task.title}
                        </p>
                        <p className="mt-1 text-xs text-[rgb(var(--zc-muted2))]">
                          {task.assignee
                            ? `${t('task_assignee')}: ${task.assignee}`
                            : t('dash_unassigned')}
                        </p>
                      </div>
                      <span className="flex shrink-0 items-center gap-2">
                        <span
                          className={[
                            'h-2 w-2 rounded-full',
                            statusColorClasses(task.status),
                          ].join(' ')}
                          aria-hidden="true"
                        />
                        <span className="text-xs text-[rgb(var(--zc-muted))]">
                          {statusLabel(task.status)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {dayMeetings && dayMeetings.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--zc-muted2))]">
                  Meetings
                </p>
                {dayMeetings.map((meeting) => (
                  <div
                    key={meeting.id}
                    className="rounded-lg border border-violet-500/30 bg-violet-500/10 p-3"
                  >
                    <p className="text-sm font-semibold text-violet-300">
                      📅 {meeting.title}
                    </p>
                    <p className="mt-1 text-xs text-[rgb(var(--zc-muted))]">
                      {meeting.time} • {meeting.duration} min
                      {meeting.recurring !== 'none' && ` • Repeats ${meeting.recurring}`}
                    </p>
                    {meeting.description && (
                      <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                        {meeting.description}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => navigate('/chat')}
                      className="mt-2 w-full rounded-md bg-violet-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-400"
                    >
                      Join Meeting
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] p-4 text-sm text-[rgb(var(--zc-muted2))]">
            {t('day_modal_empty')}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-[rgb(var(--zc-border))] p-4">
        <Button type="button" className="w-full" onClick={onAdd}>
          {t('btn_add_task')}
        </Button>
      </div>
    </div>
  )
}
