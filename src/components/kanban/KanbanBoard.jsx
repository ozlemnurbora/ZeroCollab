import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AddTaskModal } from './AddTaskModal.jsx'
import { KANBAN_COLUMNS } from './kanbanConstants.js'
import { loadTasks, saveTasks } from './taskStorage.js'
import { Button } from '../ui/Button.jsx'
import { KanbanColumn } from './KanbanColumn.jsx'
import { TaskDetailModal } from './TaskDetailModal.jsx'
import { useLanguage } from '../../utils/LanguageContext.jsx'
import { useWorkspace } from '../../utils/WorkspaceContext.jsx'
import { useAuth } from '../../utils/AuthContext.jsx'
import { loadMeetings } from '../../utils/meetingStorage.js'
import { broadcastMeetingUpdate, broadcastTaskSync } from '../../utils/hubManager.js'
import { on, sendToAllPeers, P2P_EVENTS } from '../../utils/p2pManager.js'
import {
  filterTasksForVisibility,
  mergeTasksFromSync,
  tasksForP2PBroadcast,
} from '../../utils/taskP2PSync.js'
import { checkTaskReminders, startReminderChecker } from '../../utils/taskReminder.js'

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID)
    return crypto.randomUUID()
  return `task_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function KanbanBoard({ headerActions = null }) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const { activeProject, activeTeam, memberProjectIds = [] } = useWorkspace()
  const [tasks, setTasks] = useState([])
  const [isLoadingTasks, setIsLoadingTasks] = useState(true)
  const [hasLoadedTasks, setHasLoadedTasks] = useState(false)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState(null)
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

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  )
  const syncOptions = useMemo(
    () => ({
      activeProjectId: activeProject?.id ?? null,
      allowedProjectIds: memberProjectIds,
      currentUserId: user?.id ?? null,
    }),
    [activeProject?.id, memberProjectIds, user?.id],
  )
  const visibilityOptions = useMemo(
    () => ({
      allowedProjectIds: memberProjectIds,
      currentUserId: user?.id ?? null,
    }),
    [memberProjectIds, user?.id],
  )

  const broadcastTasks = useCallback(
    (updatedTasks) => {
      const generalTasks = tasksForP2PBroadcast(updatedTasks, syncOptions)
      if (generalTasks.length === 0) return
      sendToAllPeers({
        type: 'TASK_SYNC',
        tasks: generalTasks,
        projectId: syncOptions.activeProjectId,
      })
    },
    [syncOptions],
  )

  useEffect(() => {
    if (!hasLoadedTasks) return
    void saveTasks(tasks)
  }, [tasks, hasLoadedTasks])

  useEffect(() => {
    if (!hasLoadedTasks) return
    checkTaskReminders(tasks)
    const stop = startReminderChecker(() => tasksRef.current)
    return () => stop()
  }, [hasLoadedTasks, tasks])

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
      console.log('[KanbanBoard] message received', data)
      if (data?.type !== 'TASK_SYNC') return
      const incomingGeneralTasks = (Array.isArray(data.tasks) ? data.tasks : []).filter(
        (task) =>
          task &&
          (task.calendarType === 'general' || !task.calendarType) &&
          !!task.projectId &&
          memberProjectIds.includes(task.projectId),
      )
      if (incomingGeneralTasks.length === 0) return
      setSyncNotice(true)
      window.clearTimeout(hideTimer)
      hideTimer = window.setTimeout(() => setSyncNotice(false), 3200)
      setTasks((prev) => {
        const next = mergeTasksFromSync(prev, data.tasks, visibilityOptions)
        void saveTasks(next)
        return next
      })
    })
    const unsubPeer = on(P2P_EVENTS.PEER_CONNECTED, () => {
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
  }, [broadcastTasks, activeProject?.id, memberProjectIds, visibilityOptions])

  useEffect(() => {
    const onDragEnd = () => {
      setDraggingTaskId(null)
      setDropTargetColumnId(null)
    }
    window.addEventListener('dragend', onDragEnd)
    return () => window.removeEventListener('dragend', onDragEnd)
  }, [])

  useEffect(() => {
    const handlePeerJoined = async () => {
      if (!hasLoadedTasks) return
      console.log('[KanbanBoard] peer joined, broadcasting tasks and meetings')
      setTimeout(async () => {
        broadcastTasks(tasksRef.current)
        const outgoing = tasksForP2PBroadcast(tasksRef.current, syncOptions)
        if (outgoing.length > 0) {
          await broadcastTaskSync(outgoing, activeProject?.id)
        }

        try {
          const allMeetings = await loadMeetings()
          const projectMeetings = allMeetings.filter(
            (meeting) =>
              !!meeting?.projectId &&
              memberProjectIds.includes(meeting.projectId) &&
              (!activeProject?.id || meeting.projectId === activeProject.id),
          )
          console.log(
            '[KanbanBoard] broadcasting meetings to new peer:',
            projectMeetings.length,
          )
          projectMeetings.forEach((meeting) => {
            void broadcastMeetingUpdate(meeting, 'upsert', activeProject?.id)
          })
        } catch (err) {
          console.error('[KanbanBoard] meeting broadcast error:', err)
        }
      }, 1000)
    }
    window.addEventListener('hub:peer-joined', handlePeerJoined)
    return () => window.removeEventListener('hub:peer-joined', handlePeerJoined)
  }, [hasLoadedTasks, activeProject?.id, broadcastTasks, memberProjectIds, syncOptions])

  useEffect(() => {
    const handleHubMessage = (e) => {
      const { action, tasks: incomingTasks, projectId } = e.detail || {}
      if (action !== 'task-sync') return
      if (projectId && !memberProjectIds.includes(projectId)) return
      if (activeProject?.id && projectId && projectId !== activeProject.id) return
      if (Array.isArray(incomingTasks)) {
        setTasks((prev) => {
          const next = mergeTasksFromSync(prev, incomingTasks, visibilityOptions)
          void saveTasks(next)
          return next
        })
      }
    }
    window.addEventListener('hub:message', handleHubMessage)
    return () => window.removeEventListener('hub:message', handleHubMessage)
  }, [activeProject?.id, memberProjectIds, visibilityOptions])

  useEffect(() => {
    const visible = filterTasksForVisibility(tasksRef.current, visibilityOptions)
    if (visible.length !== tasksRef.current.length) {
      setTasks(visible)
      void saveTasks(visible)
    }
  }, [visibilityOptions])

  const filteredTasks = useMemo(() => {
    const visible = filterTasksForVisibility(tasks, visibilityOptions)
    if (!activeProject) return visible
    return visible.filter(
      (task) =>
        task.projectId === activeProject.id || (!task.projectId && task.calendarType !== 'general'),
    )
  }, [tasks, activeProject, visibilityOptions])

  const tasksByColumn = useMemo(() => {
    const map = new Map(KANBAN_COLUMNS.map((c) => [c.id, []]))
    for (const task of filteredTasks) {
      const col = map.get(task.status) ?? map.get('todo')
      col.push(task)
    }
    for (const [, colTasks] of map.entries()) {
      colTasks.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    }
    return map
  }, [filteredTasks])

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
    const canCreateSharedTask =
      !!activeProject?.id && memberProjectIds.includes(activeProject.id)
    const calendarType =
      payload?.calendarType === 'general' && canCreateSharedTask
        ? 'general'
        : 'personal'
    setTasks((prev) => {
      const next = [
        {
          id: createId(),
          status: 'todo',
          createdAt: now,
          ...payload,
          calendarType,
          projectId: activeProject?.id || payload.projectId || null,
          teamId: activeTeam?.id || payload.teamId || null,
          ownerUserId: user?.id || null,
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
      void saveTasks(next)
      return next
    })
  }

  const total = filteredTasks.length

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
          {headerActions}
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
                if (selectedTaskId === id) setSelectedTaskId(null)
              }}
              onClickTask={(task) => {
                setSelectedTaskId(task.id)
                setDetailInitialEdit(false)
              }}
              onEditTask={(task) => {
                setSelectedTaskId(task.id)
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
        key={`add-task-${isAddOpen ? 'open' : 'closed'}-${activeProject?.id ?? 'none'}-${activeTeam?.id ?? 'none'}`}
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onCreate={createTask}
        customCalendars={customCalendars}
        activeProject={activeProject}
        activeTeam={activeTeam}
      />

      <TaskDetailModal
        key={`task-detail-${selectedTaskId ?? 'none'}-${detailInitialEdit ? 'edit' : 'view'}`}
        open={!!selectedTask}
        onClose={() => setSelectedTaskId(null)}
        task={selectedTask}
        onUpdate={updateTask}
        onDelete={(id) => {
          deleteTask(id)
          setSelectedTaskId(null)
        }}
        customCalendars={customCalendars}
        initialEdit={detailInitialEdit}
      />
    </div>
  )
}
