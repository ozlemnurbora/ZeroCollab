import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AddTaskModal } from './AddTaskModal.jsx'
import { KANBAN_COLUMNS } from './kanbanConstants.js'
import { loadTasks, saveTasks } from './taskStorage.js'
import { Button } from '../ui/Button.jsx'
import { KanbanColumn } from './KanbanColumn.jsx'
import { TaskDetailModal } from './TaskDetailModal.jsx'
import { useLanguage } from '../../utils/LanguageContext.jsx'
import { on, sendToAllPeers, P2P_EVENTS } from '../../utils/p2pManager.js'
import { mergeTasksFromSync, tasksForP2PBroadcast } from '../../utils/taskP2PSync.js'

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
  const [selectedTask, setSelectedTask] = useState(null)
  const [detailInitialEdit, setDetailInitialEdit] = useState(false)
  const [draggingTaskId, setDraggingTaskId] = useState(null)
  const [dropTargetColumnId, setDropTargetColumnId] = useState(null)
  const [syncNotice, setSyncNotice] = useState(false)
  const [customCalendars] = useState(() => {
    try {
      if (typeof localStorage === 'undefined') return []
      const parsed = JSON.parse(
        localStorage.getItem('zc-custom-calendars') || '[]',
      )
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })
  const tasksRef = useRef(tasks)

  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])

  useEffect(() => {
    if (!selectedTask) return
    const latest = tasks.find((t) => t.id === selectedTask.id)
    if (latest) setSelectedTask(latest)
  }, [tasks, selectedTask])

  const broadcastTasks = useCallback((updatedTasks) => {
    const generalTasks = tasksForP2PBroadcast(updatedTasks)
    if (generalTasks.length === 0) return
    sendToAllPeers({
      type: 'TASK_SYNC',
      tasks: generalTasks,
    })
  }, [])

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
    let hideTimer
    let peerBroadcastTimer
    const unsubMsg = on(P2P_EVENTS.MESSAGE, ({ data }) => {
      // eslint-disable-next-line no-console
      console.log('[KanbanBoard] message received', data)
      if (data?.type !== 'TASK_SYNC') return
      const incomingGeneralTasks = (data.tasks ?? []).filter(
        (t) => t && t.calendarType === 'general',
      )
      if (incomingGeneralTasks.length === 0) return
      setSyncNotice(true)
      window.clearTimeout(hideTimer)
      hideTimer = window.setTimeout(() => setSyncNotice(false), 3200)
      setTasks((prev) => mergeTasksFromSync(prev, data.tasks))
    })
    const unsubPeer = on(P2P_EVENTS.PEER_CONNECTED, () => {
      // eslint-disable-next-line no-console
      console.log('[KanbanBoard] peer connected, broadcasting tasks')
      window.clearTimeout(peerBroadcastTimer)
      peerBroadcastTimer = window.setTimeout(() => {
        broadcastTasks(tasksRef.current)
      }, 500)
    })
    return () => {
      window.clearTimeout(hideTimer)
      window.clearTimeout(peerBroadcastTimer)
      unsubMsg()
      unsubPeer()
    }
  }, [broadcastTasks])

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
    setTasks((prev) => {
      const next = prev.map((task) =>
        task.id === taskId ? { ...task, status: nextStatus } : task,
      )
      broadcastTasks(next)
      return next
    })
  }

  const createTask = (payload) => {
    const now = Date.now()
    const calendarType = payload?.calendarType === 'general' ? 'general' : 'personal'
    setTasks((prev) => {
      const next = [
        {
          id: createId(),
          status: 'todo',
          createdAt: now,
          ...payload,
          calendarType,
        },
        ...prev,
      ]
      broadcastTasks(next)
      return next
    })
  }

  const updateTask = (taskId, updates) => {
    setTasks((prev) => {
      const next = prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t))
      broadcastTasks(next)
      return next
    })
  }

  const deleteTask = (taskId) => {
    setTasks((prev) => {
      const next = prev.filter((t) => t.id !== taskId)
      broadcastTasks(next)
      return next
    })
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
      {syncNotice ? (
        <p
          className="mb-3 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
          role="status"
        >
          {t('sync_received')}
        </p>
      ) : null}
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
              onDeleteTask={(id) => {
                deleteTask(id)
                if (selectedTask?.id === id) setSelectedTask(null)
              }}
              onClickTask={(task) => {
                setSelectedTask(task)
                setDetailInitialEdit(false)
              }}
              onEditTask={(task) => {
                setSelectedTask(task)
                setDetailInitialEdit(true)
              }}
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
        customCalendars={customCalendars}
      />

      <TaskDetailModal
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        task={selectedTask}
        onUpdate={updateTask}
        onDelete={(id) => {
          deleteTask(id)
          setSelectedTask(null)
        }}
        customCalendars={customCalendars}
        initialEdit={detailInitialEdit}
      />
    </div>
  )
}
