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
import { saveMessage } from '../chat/chatStorage.js'
import {
  broadcastMeetingUpdate,
  broadcastTaskDelete,
  broadcastTaskSync,
} from '../../utils/hubManager.js'
import { on, sendToAllPeers, P2P_EVENTS } from '../../utils/p2pManager.js'
import {
  canApplyIncomingTaskDelete,
  filterTasksForVisibility,
  mergeTasksFromSync,
  removeAuthorizedGeneralTaskById,
  shouldBroadcastGeneralTaskDelete,
  taskVisibleInActiveProject,
  tasksForP2PBroadcast,
} from '../../utils/taskP2PSync.js'
import { checkTaskReminders, startReminderChecker } from '../../utils/taskReminder.js'
import { useScopedCustomCalendars } from '../../utils/useScopedCustomCalendars.js'
import {
  getSprintRemainingDays,
} from '../../utils/sprintDateUtils.js'
import { getNormalizedTaskStatus, isTaskInActiveSprint } from '../../utils/sprintTaskUtils.js'

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID)
    return crypto.randomUUID()
  return `task_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function isTaskChatMessage(message) {
  return (
    !!message &&
    message.kind === 'task-chat' &&
    typeof message.taskId === 'string' &&
    message.taskId.length > 0
  )
}

export function KanbanBoard({ headerActions = null }) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const ownerUserId = user?.id ?? null
  const ownerUserIdRef = useRef(ownerUserId)
  const { activeProject, activeTeam, activeSprint, memberProjectIds = [] } = useWorkspace()
  const [tasks, setTasks] = useState([])
  const [isLoadingTasks, setIsLoadingTasks] = useState(true)
  const [hasLoadedTasks, setHasLoadedTasks] = useState(false)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [boardView, setBoardView] = useState('all')
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [detailInitialEdit, setDetailInitialEdit] = useState(false)
  const [draggingTaskId, setDraggingTaskId] = useState(null)
  const [dropTargetColumnId, setDropTargetColumnId] = useState(null)
  const [syncNotice, setSyncNotice] = useState(false)
  const customCalendars = useScopedCustomCalendars(activeProject?.id ?? null, ownerUserId)
  const tasksRef = useRef(tasks)

  const hasActiveSprint = !!activeSprint?.id

  const sprintRemainingDays = useMemo(() => {
    return getSprintRemainingDays(activeSprint?.end_date)
  }, [activeSprint?.end_date])

  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])

  useEffect(() => {
    ownerUserIdRef.current = ownerUserId
  }, [ownerUserId])

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
    if (!hasLoadedTasks || !ownerUserId) return
    void saveTasks(tasks, ownerUserId)
  }, [tasks, hasLoadedTasks, ownerUserId])

  useEffect(() => {
    if (!hasLoadedTasks) return
    checkTaskReminders(tasks)
    const stop = startReminderChecker(() => tasksRef.current)
    return () => stop()
  }, [hasLoadedTasks, tasks])

  useEffect(() => {
    if (!ownerUserId) {
      setTasks([])
      setHasLoadedTasks(false)
      setIsLoadingTasks(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setIsLoadingTasks(true)
      const existing = await loadTasks(ownerUserId)
      if (cancelled) return
      const list = Array.isArray(existing) ? existing : []
      setTasks(list.length ? list : [])
      setHasLoadedTasks(true)
      setIsLoadingTasks(false)
    })()
    return () => {
      cancelled = true
    }
  }, [ownerUserId, activeProject?.id])

  useEffect(() => {
    let hideTimer
    let peerBroadcastTimer
    const unsubMsg = on(P2P_EVENTS.MESSAGE, ({ data }) => {
      if (data?.type === 'chat-message') {
        const incomingChat = data.payload
        if (!isTaskChatMessage(incomingChat)) return
        if (incomingChat.projectId && !memberProjectIds.includes(incomingChat.projectId))
          return
        if (
          activeProject?.id &&
          incomingChat.projectId &&
          incomingChat.projectId !== activeProject.id
        ) {
          return
        }
        const uid = ownerUserIdRef.current
        if (uid) void saveMessage(incomingChat, uid)
        return
      }
      if (data?.type === 'TASK_DELETE') {
        const { taskId, projectId } = data
        if (!canApplyIncomingTaskDelete({ taskId, projectId }, memberProjectIds)) return
        setTasks((prev) => {
          const uid = ownerUserIdRef.current
          const next = removeAuthorizedGeneralTaskById(
            prev,
            taskId,
            projectId,
            memberProjectIds,
          )
          if (next.length === prev.length) return prev
          if (uid) void saveTasks(next, uid)
          return next
        })
        return
      }
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
        const uid = ownerUserIdRef.current
        const nextBase = mergeTasksFromSync(prev, incomingGeneralTasks, visibilityOptions)
        if (incomingGeneralTasks.length === 0) return prev
        if (prev.length > 0 && nextBase.length === 0) return prev
        const next = nextBase.map((t) => (uid ? { ...t, ownerUserId: uid } : t))
        if (uid) void saveTasks(next, uid)
        return next
      })
    })
    const unsubPeer = on(P2P_EVENTS.PEER_CONNECTED, () => {
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
          const uid = ownerUserIdRef.current
          if (!uid) return
          const allMeetings = await loadMeetings(uid)
          const projectMeetings = allMeetings.filter(
            (meeting) =>
              meeting?.calendarType === 'general' &&
              !!meeting?.projectId &&
              memberProjectIds.includes(meeting.projectId) &&
              (!activeProject?.id || meeting.projectId === activeProject.id),
          )
          console.log(
            '[KanbanBoard] broadcasting meetings to new peer:',
            projectMeetings.length,
          )
          projectMeetings.forEach((meeting) => {
            void broadcastMeetingUpdate(meeting, 'upsert', meeting.projectId)
          })
        } catch (err) {
          console.error('[KanbanBoard] meeting broadcast error:', err)
        }
      }, 1000)
    }
    window.addEventListener('hub:peer-joined', handlePeerJoined)
    return () => window.removeEventListener('hub:peer-joined', handlePeerJoined)
  }, [hasLoadedTasks, activeProject?.id, broadcastTasks, memberProjectIds, syncOptions, ownerUserId])

  useEffect(() => {
    const handleHubMessage = (e) => {
      const payload = e.detail || {}
      if (isTaskChatMessage(payload)) {
        if (payload.projectId && !memberProjectIds.includes(payload.projectId)) return
        if (activeProject?.id && payload.projectId && payload.projectId !== activeProject.id)
          return
        const uid = ownerUserIdRef.current
        if (uid) void saveMessage(payload, uid)
        return
      }
      const { action, tasks: incomingTasks, projectId, taskId } = payload
      if (action === 'task-delete') {
        if (!canApplyIncomingTaskDelete({ taskId, projectId }, memberProjectIds)) return
        if (activeProject?.id && projectId && projectId !== activeProject.id) return
        setTasks((prev) => {
          const uid = ownerUserIdRef.current
          const next = removeAuthorizedGeneralTaskById(
            prev,
            taskId,
            projectId,
            memberProjectIds,
          )
          if (next.length === prev.length) return prev
          if (uid) void saveTasks(next, uid)
          return next
        })
        return
      }
      if (action !== 'task-sync') return
      if (projectId && !memberProjectIds.includes(projectId)) return
      if (activeProject?.id && projectId && projectId !== activeProject.id) return
      if (Array.isArray(incomingTasks)) {
        if (incomingTasks.length === 0) return
        setTasks((prev) => {
          const uid = ownerUserIdRef.current
          const nextBase = mergeTasksFromSync(prev, incomingTasks, visibilityOptions)
          if (prev.length > 0 && nextBase.length === 0) return prev
          const next = nextBase.map((t) => (uid ? { ...t, ownerUserId: uid } : t))
          if (uid) void saveTasks(next, uid)
          return next
        })
      }
    }
    window.addEventListener('hub:message', handleHubMessage)
    return () => window.removeEventListener('hub:message', handleHubMessage)
  }, [activeProject?.id, memberProjectIds, visibilityOptions])

  const visibleProjectTasks = useMemo(() => {
    const visible = filterTasksForVisibility(tasks, visibilityOptions)
    const withPriority = visible.map((task) =>
      task?.priority ? task : { ...task, priority: 'must' },
    )
    if (!activeProject) return withPriority
    const scoped = withPriority.filter((task) =>
      taskVisibleInActiveProject(task, activeProject.id, ownerUserId),
    )
    return scoped
  }, [tasks, activeProject, visibilityOptions, ownerUserId])

  const sprintTasks = useMemo(() => {
    if (!activeProject?.id || !activeSprint?.id) return []
    return visibleProjectTasks.filter((task) =>
      isTaskInActiveSprint(task, activeProject.id, activeSprint.id),
    )
  }, [visibleProjectTasks, activeProject?.id, activeSprint?.id])

  const backlogTasks = useMemo(() => {
    const allowed = new Set(['epic', 'feature', 'user_story', 'task'])
    return visibleProjectTasks.filter((task) => {
      if (!task) return false
      const sprintId = task.sprintId
      const isBacklog = sprintId == null || sprintId === ''
      if (!isBacklog) return false
      const itemType = task.itemType || 'task'
      return allowed.has(itemType)
    })
  }, [visibleProjectTasks])

  const boardScopedTasks = useMemo(() => {
    if (boardView === 'active_sprint') return hasActiveSprint ? sprintTasks : []
    if (boardView === 'backlog') return backlogTasks
    return visibleProjectTasks
  }, [boardView, hasActiveSprint, sprintTasks, backlogTasks, visibleProjectTasks])

  const filteredTasks = useMemo(() => {
    if (priorityFilter === 'all') return boardScopedTasks
    return boardScopedTasks.filter((task) => task.priority === priorityFilter)
  }, [boardScopedTasks, priorityFilter])

  const tasksByColumn = useMemo(() => {
    const priorityOrder = { must: 0, should: 1, could: 2, wont: 3 }
    const map = new Map(KANBAN_COLUMNS.map((c) => [c.id, []]))
    for (const task of filteredTasks) {
      const col = map.get(task.status) ?? map.get('todo')
      col.push(task)
    }
    for (const [, colTasks] of map.entries()) {
      colTasks.sort((a, b) => {
        const ap = priorityOrder[a.priority || 'must'] ?? 0
        const bp = priorityOrder[b.priority || 'must'] ?? 0
        if (ap !== bp) return ap - bp
        return (b.createdAt ?? 0) - (a.createdAt ?? 0)
      })
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
      const projectId = activeProject?.id ? activeProject.id : null
      const id = typeof payload?.id === 'string' && payload.id.trim() ? payload.id.trim() : createId()
      const next = [
        {
          id,
          status: 'todo',
          createdAt: now,
          ...payload,
          calendarType,
          projectId,
          teamId:
            calendarType === 'general'
              ? activeTeam?.id || payload.teamId || null
              : null,
          ownerUserId: user?.id || null,
        },
        ...(Array.isArray(prev) ? prev.filter((t) => t?.id !== id) : []),
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
    const removed = tasksRef.current.find((t) => t.id === taskId) ?? null
    setTasks((prev) => {
      const next = prev.filter((t) => t.id !== taskId)
      broadcastTasks(next)
      if (ownerUserId) void saveTasks(next, ownerUserId)
      return next
    })
    if (removed && shouldBroadcastGeneralTaskDelete(removed, memberProjectIds)) {
      sendToAllPeers({
        type: 'TASK_DELETE',
        taskId: removed.id,
        projectId: removed.projectId,
      })
      void broadcastTaskDelete(removed.id, removed.projectId)
    }
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
          <select
            className="h-9 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            value={boardView}
            onChange={(e) => setBoardView(e.target.value)}
            aria-label="Board view"
          >
            <option value="all">All Tasks</option>
            <option value="active_sprint">Active Sprint</option>
            <option value="backlog">Backlog</option>
          </select>
          <select
            className="h-9 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            aria-label="Filter"
          >
            <option value="all">all</option>
            <option value="must">must</option>
            <option value="should">should</option>
            <option value="could">could</option>
            <option value="wont">wont</option>
          </select>
          <Button onClick={() => setIsAddOpen(true)}>{t('kanban_add_task')}</Button>
        </div>
      </div>

      {boardView === 'active_sprint' && hasActiveSprint ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <section className="rounded-xl border border-indigo-500/25 bg-indigo-500/10 p-5 lg:col-span-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-indigo-200/80">
                  Active Sprint #{activeSprint.sprint_number}
                </p>
                <p className="mt-1 text-lg font-semibold text-[rgb(var(--zc-text))]">
                  {activeSprint.sprint_goal || '—'}
                </p>
              </div>
              <div className="shrink-0 inline-flex items-center gap-2 rounded-full bg-[rgb(var(--zc-bg)/0.35)] px-3 py-1 text-xs">
                <span className="text-[rgb(var(--zc-muted))]">Status</span>
                <span className="font-medium text-[rgb(var(--zc-text))]">
                  {activeSprint.status || 'active'}
                </span>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2 text-sm">
                <p className="text-xs text-[rgb(var(--zc-subtle))]">Dates</p>
                <p className="text-[rgb(var(--zc-text))]">
                  {activeSprint.start_date} → {activeSprint.end_date}
                </p>
              </div>
              <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2 text-sm">
                <p className="text-xs text-[rgb(var(--zc-subtle))]">Remaining days</p>
                <p className="text-[rgb(var(--zc-text))]">
                  {sprintRemainingDays == null ? '—' : sprintRemainingDays}
                </p>
              </div>
              <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2 text-sm">
                <p className="text-xs text-[rgb(var(--zc-subtle))]">Sprint items</p>
                <p className="text-[rgb(var(--zc-text))]">{sprintTasks.length}</p>
              </div>
              <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2 text-sm">
                <p className="text-xs text-[rgb(var(--zc-subtle))]">Project</p>
                <p className="truncate text-[rgb(var(--zc-text))]">
                  {activeProject?.name || '—'}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)] p-5">
            <h3 className="text-sm font-semibold text-[rgb(var(--zc-text))]">Burndown</h3>
            <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
              Completion based on Done items.
            </p>
            {(() => {
              const totalItems = sprintTasks.length
              const doneItems = sprintTasks.filter((t) => getNormalizedTaskStatus(t) === 'done').length
              const remainingItems = Math.max(0, totalItems - doneItems)
              const pct = totalItems === 0 ? 0 : Math.round((doneItems / totalItems) * 100)
              return (
                <div className="mt-4 space-y-4 text-sm">
                  {totalItems === 0 ? (
                    <div className="rounded-lg border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.25)] p-4 text-sm text-[rgb(var(--zc-muted2))]">
                      No sprint items yet. Add ready items from Sprint Planning.
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2">
                          <p className="text-xs text-[rgb(var(--zc-subtle))]">Total</p>
                          <p className="text-[rgb(var(--zc-text))]">{totalItems}</p>
                        </div>
                        <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2">
                          <p className="text-xs text-[rgb(var(--zc-subtle))]">Remaining</p>
                          <p className="text-[rgb(var(--zc-text))]">{remainingItems}</p>
                        </div>
                        <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2">
                          <p className="text-xs text-[rgb(var(--zc-subtle))]">Done</p>
                          <p className="text-[rgb(var(--zc-text))]">{doneItems}</p>
                        </div>
                        <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2">
                          <p className="text-xs text-[rgb(var(--zc-subtle))]">Completion</p>
                          <p className="text-[rgb(var(--zc-text))]">{pct}%</p>
                        </div>
                      </div>

                      <div className="h-2 overflow-hidden rounded-full bg-[rgb(var(--zc-border)/0.6)]">
                        <div
                          className="h-full rounded-full bg-emerald-500/80 transition-[width]"
                          style={{ width: `${pct}%` }}
                          aria-label={`Completion ${pct}%`}
                        />
                      </div>
                    </>
                  )}
                </div>
              )
            })()}
          </section>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-4">
        {isLoadingTasks ? (
          <div className="lg:col-span-4 rounded-xl border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-6 text-sm text-[rgb(var(--zc-muted2))]">
            {t('loading_tasks')}
          </div>
        ) : boardView === 'active_sprint' && !hasActiveSprint ? (
          <div className="lg:col-span-4 rounded-xl border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-6 text-sm text-[rgb(var(--zc-muted2))]">
            No active sprint. Create one from Project Overview.
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
