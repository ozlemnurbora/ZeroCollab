import { TaskCard } from './TaskCard.jsx'

export function KanbanColumn({
  column,
  tasks,
  onDropTask,
  onDeleteTask,
  draggingTaskId,
  setDraggingTaskId,
  isDropTarget,
  setDropTargetColumnId,
  emptyLabel,
}) {
  return (
    <section className="flex min-w-[280px] flex-col rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)]">
      <header className="flex items-center justify-between gap-3 border-b border-[rgb(var(--zc-border))] px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-[rgb(var(--zc-text))]">
            {column.title}
          </h2>
          <span className="rounded-md bg-[rgb(var(--zc-panel))] px-2 py-0.5 text-xs text-[rgb(var(--zc-muted))] ring-1 ring-inset ring-[rgb(var(--zc-border))]">
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
