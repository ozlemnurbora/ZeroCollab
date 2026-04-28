import { formatDueDate, isOverdue } from './dateUtils.js'
import { useLanguage } from '../../utils/LanguageContext.jsx'

function truncate(text, n) {
  const s = String(text || '')
  if (!s) return ''
  return s.length > n ? `${s.slice(0, n)}…` : s
}

export function TaskCard({
  task,
  onDragStart,
  isDragging,
  onDelete,
  onClick,
  onEdit,
}) {
  const { t, locale } = useLanguage()
  const overdue = isOverdue(task.dueDate)
  const dueLabel = formatDueDate(task.dueDate, locale)
  const priority = task.priority || 'must'
  const itemType = task.itemType || 'task'
  const backlogState = task.backlogState || 'new'
  const backlogStateLabelMap = {
    new: 'New',
    refined: 'Refined',
    ready: 'Ready',
  }
  const backlogStateLabel = backlogStateLabelMap[backlogState] || 'New'
  const itemTypeLabelMap = {
    epic: 'Epic',
    feature: 'Feature',
    user_story: 'User Story',
    task: 'Task',
  }
  const itemTypeLabel = itemTypeLabelMap[itemType] || 'Task'
  const priorityMeta =
    priority === 'must'
      ? { label: 'Must-have', classes: 'bg-red-500/20 text-red-400' }
      : priority === 'should'
        ? { label: 'Should-have', classes: 'bg-yellow-500/20 text-yellow-400' }
        : priority === 'could'
          ? { label: 'Could-have', classes: 'bg-green-500/20 text-green-400' }
          : { label: 'Won’t-have', classes: 'bg-gray-500/20 text-gray-400' }

  return (
    <div
      className={[
        'group rounded-lg border-y border-r bg-[rgb(var(--zc-panel)/0.6)] p-3 shadow-sm transition cursor-pointer',
        'border-[rgb(var(--zc-border))] hover:border-[rgb(var(--zc-border)/0.85)] hover:bg-[rgb(var(--zc-panel)/0.8)]',
        'active:scale-[0.99]',
        isDragging ? 'opacity-60 ring-2 ring-indigo-500/40' : '',
        task.status === 'done'
          ? 'border-l-2 border-l-emerald-500/70'
          : task.status === 'in_progress'
            ? 'border-l-2 border-l-amber-500/70'
            : 'border-l-2 border-l-indigo-500/70',
      ].join(' ')}
      draggable
      onDragStart={(e) => onDragStart?.(e, task.id)}
      onClick={() => onClick?.(task)}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (!onClick) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.(task)
        }
      }}
    >
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-semibold text-[rgb(var(--zc-text))]">
            {task.title}
          </p>
          <span className="ml-2 flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onEdit?.(task)
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="rounded p-1 text-[rgb(var(--zc-muted2))] hover:bg-[rgb(var(--zc-border)/0.5)] hover:text-[rgb(var(--zc-text))]"
              aria-label={t('task_edit')}
              title={t('task_edit')}
            >
              ✎
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDelete?.(task.id)
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="rounded p-1 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300"
              aria-label={t('task_delete')}
              title={t('task_delete')}
            >
              ✕
            </button>
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="shrink-0 rounded-full bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-medium text-indigo-300">
            {itemTypeLabel}
          </span>
          <span className="shrink-0 rounded-full bg-slate-500/20 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
            {backlogStateLabel}
          </span>
          <span
            className={[
              'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
              priorityMeta.classes,
            ].join(' ')}
          >
            {priorityMeta.label}
          </span>
          {overdue && (
            <span className="shrink-0 rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-400">
              Overdue
            </span>
          )}
        </div>
        {task.description ? (
          <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
            {truncate(task.description, 60)}
          </p>
        ) : null}
        <div className="mt-2 flex items-center gap-1.5">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-[9px] font-semibold text-indigo-300">
            {(task.assignee || '?').slice(0, 2).toUpperCase()}
          </div>
          <span className="text-xs text-[rgb(var(--zc-muted))] truncate">
            {task.assignee}
          </span>
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

      {task.startDate ? (
        <p className="mt-2 text-[11px] text-[rgb(var(--zc-subtle))]">
          {t('task_start_prefix')} {formatDueDate(task.startDate, locale)}
        </p>
      ) : null}
    </div>
  )
}
