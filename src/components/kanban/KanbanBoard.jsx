import { useEffect, useMemo, useState } from 'react'
import { AddTaskModal } from './AddTaskModal.jsx'
import { KANBAN_COLUMNS } from './kanbanConstants.js'
import { loadTasks, saveTasks } from './taskStorage.js'
import { Button } from '../ui/Button.jsx'
import { KanbanColumn } from './KanbanColumn.jsx'

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID)
    return crypto.randomUUID()
  return `task_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function KanbanBoard() {
  const [tasks, setTasks] = useState(() => {
    const existing = loadTasks()
    return existing.length ? existing : []
  })
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [draggingTaskId, setDraggingTaskId] = useState(null)
  const [dropTargetColumnId, setDropTargetColumnId] = useState(null)

  useEffect(() => {
    saveTasks(tasks)
  }, [tasks])

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
      prev.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t)),
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

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-[rgb(var(--zc-muted))]">
            Drag tasks across columns. Stored in{' '}
            <span className="text-[rgb(var(--zc-text))]">localStorage</span>.
          </p>
          <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
            {total} total tasks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setIsAddOpen(true)}>Add Task</Button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {KANBAN_COLUMNS.map((column) => (
          <KanbanColumn
            key={column.id}
            column={column}
            tasks={tasksByColumn.get(column.id) ?? []}
            onDropTask={moveTask}
            draggingTaskId={draggingTaskId}
            setDraggingTaskId={setDraggingTaskId}
            isDropTarget={dropTargetColumnId === column.id}
            setDropTargetColumnId={setDropTargetColumnId}
          />
        ))}
      </div>

      <AddTaskModal
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onCreate={createTask}
      />
    </div>
  )
}

