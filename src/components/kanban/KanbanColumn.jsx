import { TaskCard } from './TaskCard.jsx'

export function KanbanColumn({
  column,
  tasks,
  onDropTask,
  onDeleteTask,
  onClickTask,
  onEditTask,
  draggingTaskId,
  setDraggingTaskId,
  isDropTarget,
  setDropTargetColumnId,
  emptyLabel,
}) {
  const columnColors = {
    todo: {
      bar: 'bg-indigo-500',
      text: 'text-indigo-400',
      count: 'bg-indigo-500/15 text-indigo-300 ring-indigo-500/20',
    },
    in_progress: {
      bar: 'bg-amber-500',
      text: 'text-amber-400',
      count: 'bg-amber-500/15 text-amber-300 ring-amber-500/20',
    },
    done: {
      bar: 'bg-emerald-500',
      text: 'text-emerald-400',
      count: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/20',
    },
  }
  const colors = columnColors[column.id] || {
    bar: 'bg-indigo-500',
    text: 'text-[rgb(var(--zc-text))]',
    count: 'bg-[rgb(var(--zc-panel))] text-[rgb(var(--zc-muted))] ring-[rgb(var(--zc-border))]',
  }

  return (
    <section className="flex min-w-[280px] flex-col rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)] overflow-hidden">
      <div className={`h-0.5 w-full ${colors.bar}`} />
      <header className="flex items-center justify-between gap-3 border-b border-[rgb(var(--zc-border))] px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className={`text-sm font-semibold ${colors.text}`}>
            {column.title}
          </h2>
          <span className={`rounded-md px-2 py-0.5 text-xs ring-1 ring-inset ${colors.count}`}>
            {tasks.length}
          </span>
        </div>
      </header>

      <div
        className={[
          'flex-1 space-y-3 p-3 transition-colors',
          isDropTarget ? 'bg-indigo-500/5' : '',
        ].join(' ')}
        onDragOver={(e) => {
          e.preventDefault()
          setDropTargetColumnId?.(column.id)
        }}
        onDragLeave={() => setDropTargetColumnId?.(null)}
        onDrop={(e) => {
          e.preventDefault()
          const taskId = e.dataTransfer.getData('text/task-id')
          if (taskId) onDropTask?.(taskId, column.id)
          setDropTargetColumnId?.(null)
        }}
      >
        {tasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] p-4 text-center text-xs text-[rgb(var(--zc-muted2))]">
            {emptyLabel}
          </div>
        ) : null}

        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onDelete={onDeleteTask}
            onClick={onClickTask}
            onEdit={onEditTask}
            isDragging={draggingTaskId === task.id}
            onDragStart={(e, id) => {
              setDraggingTaskId?.(id)
              e.dataTransfer.setData('text/task-id', id)
              e.dataTransfer.effectAllowed = 'move'
            }}
          />
        ))}
      </div>
    </section>
  )
}
