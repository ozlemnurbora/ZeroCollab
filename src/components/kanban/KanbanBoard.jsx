import { useEffect, useMemo, useState } from 'react'
import { AddTaskModal } from './AddTaskModal.jsx'
import { KANBAN_COLUMNS } from './kanbanConstants.js'
import { loadTasks, saveTasks } from './taskStorage.js'
import { Button } from '../ui/Button.jsx'
import { KanbanColumn } from './KanbanColumn.jsx'
import { useLanguage } from '../../utils/LanguageContext.jsx'

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID)
    return crypto.randomUUID()
  return `task_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function KanbanBoard() {
  const { t } = useLanguage()
  const [tasks, setTasks] = useState([])
  const [isLoadingTasks, setIsLoadingTasks] = useState(true)
  const [hasLoadedTasks, setHasLoadedTasks] = useState(false)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [draggingTaskId, setDraggingTaskId] = useState(null)
  const [dropTargetColumnId, setDropTargetColumnId] = useState(null)

  useEffect(() => {
    if (!hasLoadedTasks) return
    void saveTasks(tasks)
  }, [tasks, hasLoadedTasks])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setIsLoadingTasks(true)
      const existing = await loadTasks()
      if (cancelled) return
      const list = Array.isArray(existing) ? existing : []
      setTasks(list.length ? list : [])
      setHasLoadedTasks(true)
      setIsLoadingTasks(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onDragEnd = () => {
      setDraggingTaskId(null)
      setDropTargetColumnId(null)
    }
    window.addEventListener('dragend', onDragEnd)
    return () => window.removeEventListener('dragend', onDragEnd)
  }, [])

  const tasksByColumn = useMemo(() => {
    const map = new Map(KANBAN_COLUMNS.map((c) => [c.id, []]))
    for (const task of tasks) {
      const col = map.get(task.status) ?? map.get('todo')
      col.push(task)
    }
    for (const [, colTasks] of map.entries()) {
      colTasks.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    }
    return map
  }, [tasks])

  const moveTask = (taskId, nextStatus) => {
    setTasks((prev) =>
      prev.map((task) => (task.id === taskId ? { ...task, status: nextStatus } : task)),
    )
  }

  const createTask = (payload) => {
    const now = Date.now()
    setTasks((prev) => [
      {
        id: createId(),
        status: 'todo',
        createdAt: now,
        ...payload,
      },
      ...prev,
    ])
  }

  const total = tasks.length

  const columnsWithTitles = useMemo(
    () =>
      KANBAN_COLUMNS.map((column) => ({
        ...column,
        title: t(`kanban_col_${column.id}`),
      })),
    [t],
  )

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-[rgb(var(--zc-muted))]">
            {t('kanban_hint')}{' '}
            <span className="text-[rgb(var(--zc-text))]">{t('kanban_indexeddb')}</span>.
          </p>
          <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
            {t('kanban_total_tasks', { n: total })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setIsAddOpen(true)}>{t('kanban_add_task')}</Button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {isLoadingTasks ? (
          <div className="lg:col-span-3 rounded-xl border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-6 text-sm text-[rgb(var(--zc-muted2))]">
            {t('loading_tasks')}
          </div>
        ) : (
          columnsWithTitles.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              tasks={tasksByColumn.get(column.id) ?? []}
              onDropTask={moveTask}
              draggingTaskId={draggingTaskId}
              setDraggingTaskId={setDraggingTaskId}
              isDropTarget={dropTargetColumnId === column.id}
              setDropTargetColumnId={setDropTargetColumnId}
              emptyLabel={t('kanban_drop_here')}
            />
          ))
        )}
      </div>

      <AddTaskModal
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onCreate={createTask}
      />
    </div>
  )
}
