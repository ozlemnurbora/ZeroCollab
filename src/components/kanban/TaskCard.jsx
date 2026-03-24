import { formatDueDate, isOverdue } from './dateUtils.js'
import { useLanguage } from '../../utils/LanguageContext.jsx'

export function TaskCard({ task, onDragStart, isDragging }) {
  const { t, locale } = useLanguage()
  const overdue = isOverdue(task.dueDate)
  const dueLabel = formatDueDate(task.dueDate, locale)

  return (
    <div
      className={[
        'group rounded-lg border bg-[rgb(var(--zc-panel)/0.6)] p-3 shadow-sm transition',
        'border-[rgb(var(--zc-border))] hover:border-[rgb(var(--zc-border)/0.85)] hover:bg-[rgb(var(--zc-panel)/0.8)]',
        'active:scale-[0.99]',
        isDragging ? 'opacity-60 ring-2 ring-indigo-500/40' : '',
      ].join(' ')}
      draggable
      onDragStart={(e) => onDragStart?.(e, task.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[rgb(var(--zc-text))]">
            {task.title}
          </p>
          <p className="mt-1 text-xs text-[rgb(var(--zc-muted))]">
            <span className="text-[rgb(var(--zc-muted2))]">{t('task_assignee')}:</span>{' '}
            {task.assignee}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span
          className={[
            'inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium ring-1 ring-inset',
            overdue
              ? 'text-rose-200 ring-rose-500/30 bg-rose-500/10'
              : 'text-[rgb(var(--zc-muted))] ring-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)]',
          ].join(' ')}
        >
          {t('task_due')} {dueLabel}
        </span>

        <span className="text-[11px] text-[rgb(var(--zc-subtle))] opacity-0 transition-opacity group-hover:opacity-100">
          {t('task_drag')}
        </span>
      </div>
    </div>
  )
}
