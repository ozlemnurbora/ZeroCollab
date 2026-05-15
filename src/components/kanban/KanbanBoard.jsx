import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AddTaskModal } from './AddTaskModal.jsx'
import { KANBAN_COLUMNS } from './kanbanConstants.js'
import {
  loadTasks,
  saveTasks,
  normalizeTaskForStorage,
  normalizeStoryPointsValue,
  compareKanbanTasksInColumn,
  dedupeAndNormalizePositions,
  nextPositionForGroup,
  PRIORITY_RANK,
  mergeTaskListsByIdPreferNewer,
  isTaskDeleted,
  markTaskSoftDeleted,
} from './taskStorage.js'
import {
  taskMeetsDefinitionOfReady,
  validateReadyBacklogState,
} from './definitionOfReady.js'
import { Button } from '../ui/Button.jsx'
import { KanbanColumn } from './KanbanColumn.jsx'
import { TaskDetailModal } from './TaskDetailModal.jsx'
import { useLanguage } from '../../utils/LanguageContext.jsx'
import { useWorkspace } from '../../utils/WorkspaceContext.jsx'
import { useAuth } from '../../utils/AuthContext.jsx'
import { loadMeetings } from '../../utils/meetingStorage.js'
import {
  broadcastMeetingUpdate,
  broadcastTaskDelete,
  broadcastTaskSync,
} from '../../utils/hubManager.js'
import { on, sendToAllPeers, P2P_EVENTS } from '../../utils/p2pManager.js'
import {
  applyAuthorizedGeneralTaskSoftDelete,
  filterTasksForVisibility,
  mergeTasksFromSync,
  shouldBroadcastGeneralTaskDelete,
  taskVisibleInActiveProject,
  tasksForP2PBroadcast,
} from '../../utils/taskP2PSync.js'
import {
  filterBacklogTasks,
  filterReadyBacklogTasks,
  filterRefinementSessionTasks,
  filterSprintBoardScopedTasks,
  filterSprintTasksForActiveSprint,
} from '../../utils/kanbanBoardFilters.js'
import { checkTaskReminders, startReminderChecker } from '../../utils/taskReminder.js'
import { useScopedCustomCalendars } from '../../utils/useScopedCustomCalendars.js'
import {
  getSprintRemainingDays,
} from '../../utils/sprintDateUtils.js'
import { getNormalizedTaskStatus } from '../../utils/sprintTaskUtils.js'
import { recoverLegacyTasksForCurrentUser } from '../../utils/taskRecovery'
import {
  fetchRemoteProjectTasks,
  upsertRemoteTasks,
  isSharedProjectTask,
} from '../../utils/taskRemoteStorage.js'
import { normalizeCapacityPoints } from '../../utils/workspaceDB.js'
import { resolveDoneAtForStatusChange } from '../../utils/taskDoneAt.js'
import { Link } from 'react-router-dom'
import { BurndownChart } from '../sprint/BurndownChart.jsx'
import { addNotification } from '../../utils/notificationService.js'

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID)
    return crypto.randomUUID()
  return `task_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function isAgileHierarchyTaskItem(item) {
  // Agile hierarchy refactor: the Tasks page (and all task boards) intentionally render only Task items.
  // Epics/Features/User Stories are stored but must not appear here.
  if (!item) return false
  if ('type' in item) return item.type === 'Task'
  // Back-compat: legacy tasks may not have a `type` yet; treat canonical task markers as Task.
  const it = String(item.itemType ?? '').toLowerCase()
  return it === 'task'
}

export function KanbanBoard({
  headerActions = null,
  variant = 'default',
  createOnlyTask = false,
}) {
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
    void saveTasks(tasks, ownerUserId, { reason: 'KanbanBoard state change' })
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
      // One-time recovery: stamps legacy tasks that have no owner/sprint fields.
      // IMPORTANT: never writes [] during startup.
      let recovered = null
      try {
        recovered = await recoverLegacyTasksForCurrentUser(ownerUserId)
      } catch {
        recovered = null
      }

      const existing = recovered ?? (await loadTasks(ownerUserId))
      if (cancelled) return
      const list = Array.isArray(existing) ? existing : []
      const normalized = list.map((t) => normalizeTaskForStorage(t, ownerUserId)).filter(Boolean)
      setTasks(dedupeAndNormalizePositions(normalized))
      console.log('[KanbanBoard] loaded task count:', normalized.length)
      setHasLoadedTasks(true)
      setIsLoadingTasks(false)
    })()
    return () => {
      cancelled = true
    }
  }, [ownerUserId])

  // When active project changes, reload safely without wiping current state while loading.
  useEffect(() => {
    if (!ownerUserId || !hasLoadedTasks) return
    let cancelled = false
    ;(async () => {
      setIsLoadingTasks(true)
      const existing = await loadTasks(ownerUserId)
      if (cancelled) return
      const list = Array.isArray(existing) ? existing : []
      const normalized = list.map((t) => normalizeTaskForStorage(t, ownerUserId)).filter(Boolean)
      setTasks((prev) =>
        Array.isArray(prev) && prev.length > 0 ? prev : dedupeAndNormalizePositions(normalized),
      )
      setIsLoadingTasks(false)
    })()
    return () => {
      cancelled = true
    }
  }, [activeProject?.id, ownerUserId, hasLoadedTasks])

  // Durable recovery: merge Supabase project tasks into local cache (never wipes local).
  useEffect(() => {
    const projectId = activeProject?.id ?? null
    if (!projectId || !ownerUserId || !hasLoadedTasks) return
    let cancelled = false
    ;(async () => {
      const remoteTasks = await fetchRemoteProjectTasks(projectId)
      if (cancelled) return

      const localAll = Array.isArray(tasksRef.current) ? tasksRef.current : []
      const mergedAll = dedupeAndNormalizePositions(
        mergeTaskListsByIdPreferNewer(localAll, remoteTasks)
          .map((t) => normalizeTaskForStorage(t, ownerUserId))
          .filter(Boolean),
      )

      // Never let empty remote wipe local. Only write if we actually have tasks.
      if (mergedAll.length > 0) {
        setTasks(mergedAll)
        await saveTasks(mergedAll, ownerUserId, { reason: 'remote merge' })
      }

      // Backfill: if local has shared project tasks missing in Supabase, upsert them.
      const remoteIds = new Set((Array.isArray(remoteTasks) ? remoteTasks : []).map((t) => t?.id).filter(Boolean))
      const localSharedProject = localAll.filter(
        (t) => isSharedProjectTask(t) && t.projectId === projectId,
      )
      const toBackfill = localSharedProject.filter((t) => t?.id && !remoteIds.has(t.id))
      if (toBackfill.length > 0) {
        await upsertRemoteTasks(toBackfill, ownerUserId)
        console.log('[TaskRemoteStorage] backfilled local tasks to Supabase:', toBackfill.length)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeProject?.id, ownerUserId, hasLoadedTasks])

  useEffect(() => {
    let hideTimer
    let peerBroadcastTimer
    const unsubMsg = on(P2P_EVENTS.MESSAGE, ({ data }) => {
      if (data?.type === 'NOTIFICATION' && data.notification) {
        addNotification(data.notification)
        return
      }
      if (data?.type === 'TASK_DELETE') {
        const { taskId, projectId } = data
        setTasks((prev) => {
          const uid = ownerUserIdRef.current
          const { next, changed } = applyAuthorizedGeneralTaskSoftDelete(
            prev,
            taskId,
            projectId,
            memberProjectIds,
            uid,
          )
          if (!changed) return prev
          if (uid) void saveTasks(next, uid, { allowEmpty: true, reason: 'incoming TASK_DELETE' })
          const tomb = next.find(
            (t) =>
              t?.id === taskId &&
              String(t?.projectId ?? '') === String(projectId) &&
              isSharedProjectTask(t),
          )
          if (tomb && uid) void upsertRemoteTasks([tomb], uid)
          return next
        })
        return
      }
      if (data?.type !== 'TASK_SYNC') return
      console.log('[KanbanBoard] incoming TASK_SYNC', {
        payloadCount: Array.isArray(data.tasks) ? data.tasks.length : 0,
        projectId: data.projectId ?? null,
      })
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
        const next = dedupeAndNormalizePositions(
          nextBase.map((t) => (uid ? { ...t, ownerUserId: uid } : t)),
        )
        if (uid) void saveTasks(next, uid)
        if (uid) void upsertRemoteTasks(incomingGeneralTasks, uid)
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
      const { action, tasks: incomingTasks, projectId, taskId } = payload
      if (action === 'task-delete') {
        if (activeProject?.id && projectId && projectId !== activeProject.id) return
        setTasks((prev) => {
          const uid = ownerUserIdRef.current
          const { next, changed } = applyAuthorizedGeneralTaskSoftDelete(
            prev,
            taskId,
            projectId,
            memberProjectIds,
            uid,
          )
          if (!changed) return prev
          if (uid) void saveTasks(next, uid, { allowEmpty: true, reason: 'hub task-delete' })
          const tomb = next.find(
            (t) =>
              t?.id === taskId &&
              String(t?.projectId ?? '') === String(projectId) &&
              isSharedProjectTask(t),
          )
          if (tomb && uid) void upsertRemoteTasks([tomb], uid)
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
          const next = dedupeAndNormalizePositions(
            nextBase.map((t) => (uid ? { ...t, ownerUserId: uid } : t)),
          )
          if (uid) void saveTasks(next, uid)
          if (uid) void upsertRemoteTasks(incomingTasks, uid)
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
    // Agile hierarchy refactor: only render Task items in task boards.
    const taskOnly = withPriority.filter(isAgileHierarchyTaskItem)
    if (!activeProject) return taskOnly
    const scoped = taskOnly.filter((task) =>
      taskVisibleInActiveProject(task, activeProject.id, ownerUserId),
    )
    // Keep legacy tasks without projectId visible even when an active project is selected,
    // so users can recover/edit them from All Tasks.
    const legacyNoProject = taskOnly.filter((t) => t && !t.projectId)
    const merged = [...scoped]
    const seen = new Set(scoped.map((t) => t?.id).filter(Boolean))
    for (const t of legacyNoProject) {
      if (t?.id && !seen.has(t.id)) merged.push(t)
    }

    console.log('[KanbanBoard] visibility debug', {
      totalTasks: Array.isArray(tasks) ? tasks.length : 0,
      visibleAfterMembership: Array.isArray(withPriority) ? withPriority.length : 0,
      visibleAfterTaskTypeFilter: Array.isArray(taskOnly) ? taskOnly.length : 0,
      visibleProjectTasks: Array.isArray(merged) ? merged.length : 0,
      activeProjectId: activeProject?.id ?? null,
      memberProjectIds: Array.isArray(memberProjectIds) ? memberProjectIds : [],
    })

    return merged
  }, [tasks, activeProject, visibilityOptions, ownerUserId])

  useEffect(() => {
    if (!hasLoadedTasks) return
    console.log('[KanbanBoard] recovery counts', {
      loadedTasksInState: Array.isArray(tasks) ? tasks.length : 0,
      afterVisibilityFilter: Array.isArray(visibleProjectTasks) ? visibleProjectTasks.length : 0,
      activeProjectId: activeProject?.id ?? null,
      memberProjectIdsCount: Array.isArray(memberProjectIds) ? memberProjectIds.length : 0,
    })
  }, [hasLoadedTasks, tasks, visibleProjectTasks, activeProject?.id, memberProjectIds])

  /** Tasks committed to the workspace active sprint (matches Tasks → Active Sprint). */
  const sprintTasks = useMemo(
    () => filterSprintTasksForActiveSprint(visibleProjectTasks, activeSprint?.id),
    [visibleProjectTasks, activeSprint?.id],
  )

  /** Not sprint-committed; New or Refined only (Ready stays in All Tasks + Sprint Planning). */
  const backlogTasks = useMemo(
    () => filterBacklogTasks(visibleProjectTasks),
    [visibleProjectTasks],
  )

  /** Not sprint-committed; Refined only. */
  const refinementSessionTasks = useMemo(
    () => filterRefinementSessionTasks(visibleProjectTasks),
    [visibleProjectTasks],
  )

  /**
   * Ready, not sprint-committed, active project only (Tasks → Ready Backlog).
   * visibleProjectTasks already excludes deleted tasks.
   */
  const readyBacklogTasks = useMemo(
    () => filterReadyBacklogTasks(visibleProjectTasks, activeProject?.id),
    [visibleProjectTasks, activeProject?.id],
  )

  const refinementSessionMetrics = useMemo(() => {
    const list = refinementSessionTasks
    const readyCandidates = list.filter((t) => taskMeetsDefinitionOfReady(t)).length
    return { refinedCount: list.length, readyCandidates }
  }, [refinementSessionTasks])

  const isSprintBoard = variant === 'sprint_board'
  const isRefinementSessionView = !isSprintBoard && boardView === 'refinement_session'
  const isReadyBacklogView = !isSprintBoard && boardView === 'ready_backlog'

  const boardScopedTasks = useMemo(() => {
    if (isSprintBoard) {
      return filterSprintBoardScopedTasks(
        visibleProjectTasks,
        activeProject?.id,
        activeSprint?.id,
      )
    }
    if (boardView === 'active_sprint') return hasActiveSprint ? sprintTasks : []
    if (boardView === 'backlog') return backlogTasks
    if (boardView === 'refinement_session') return refinementSessionTasks
    if (boardView === 'ready_backlog') return readyBacklogTasks
    return visibleProjectTasks
  }, [
    isSprintBoard,
    activeProject?.id,
    activeSprint?.id,
    visibleProjectTasks,
    boardView,
    hasActiveSprint,
    sprintTasks,
    backlogTasks,
    refinementSessionTasks,
    readyBacklogTasks,
  ])

  const sprintBoardHeaderMetrics = useMemo(() => {
    if (!isSprintBoard || !activeSprint?.id) return null
    const list = boardScopedTasks
    const selectedSP = list.reduce((sum, task) => {
      const sp = Number(task.storyPoints || task.story_points || 0)
      return sum + (Number.isFinite(sp) ? sp : 0)
    }, 0)
    const cap = normalizeCapacityPoints(
      activeSprint.capacityPoints ?? activeSprint.capacity_points ?? 0,
    )
    const totalSprintTasks = list.length
    const doneSprintTasks = list.filter(
      (t) => getNormalizedTaskStatus(t) === 'done',
    ).length
    const completionPercentage =
      totalSprintTasks === 0
        ? 0
        : Math.round((doneSprintTasks / totalSprintTasks) * 100)
    const remainingSP = cap - selectedSP
    const planningCompleted =
      activeSprint.planningStatus === 'completed' ||
      activeSprint.planning_status === 'completed'
    return {
      selectedSP,
      cap,
      totalSprintTasks,
      doneSprintTasks,
      completionPercentage,
      remainingSP,
      planningCompleted,
    }
  }, [isSprintBoard, activeSprint, boardScopedTasks])

  const filteredTasks = useMemo(() => {
    if (priorityFilter === 'all') return boardScopedTasks
    return boardScopedTasks.filter((task) => task.priority === priorityFilter)
  }, [boardScopedTasks, priorityFilter])

  const tasksByColumn = useMemo(() => {
    const map = new Map(KANBAN_COLUMNS.map((c) => [c.id, []]))
    for (const task of filteredTasks) {
      const col = map.get(task.status) ?? map.get('todo')
      col.push(task)
    }
    for (const [, colTasks] of map.entries()) {
      colTasks.sort(compareKanbanTasksInColumn)
    }
    return map
  }, [filteredTasks])

  const handleKanbanDrop = (taskId, columnId, insertBeforeTaskId) => {
    setTasks((prev) => {
      const task = prev.find((t) => t.id === taskId)
      if (!task) return prev

      const now = Date.now()
      const srcStatus = task.status || 'todo'
      const srcPri = task.priority || 'must'
      const crossColumn = srcStatus !== columnId

      const oldGroupOrder = prev
        .filter(
          (t) =>
            (t.status || 'todo') === srcStatus && (t.priority || 'must') === srcPri,
        )
        .sort(compareKanbanTasksInColumn)
        .map((t) => t.id)
      const oldIndexInGroup = oldGroupOrder.indexOf(taskId)

      let working = prev.map((t) => ({ ...t }))
      const ti = working.findIndex((t) => t.id === taskId)
      if (ti < 0) return prev

      let moved = working[ti]
      if (crossColumn) {
        const doneAt = resolveDoneAtForStatusChange(moved, columnId, now)
        moved = { ...moved, status: columnId, updatedAt: now, doneAt }
        working[ti] = moved
      }

      const finalPri = moved.priority || 'must'
      const positionUpdates = new Map()

      if (crossColumn) {
        const sourcePeers = working.filter(
          (t) =>
            t.id !== taskId &&
            (t.status || 'todo') === srcStatus &&
            (t.priority || 'must') === srcPri,
        )
        const sourceOrder = [...sourcePeers].sort(compareKanbanTasksInColumn).map((t) => t.id)
        sourceOrder.forEach((id, i) => positionUpdates.set(id, i))
      }

      const targetPeers = working.filter(
        (t) =>
          t.id !== taskId &&
          (t.status || 'todo') === columnId &&
          (t.priority || 'must') === finalPri,
      )
      const sortedTargetPeers = [...targetPeers].sort(compareKanbanTasksInColumn)
      const orderedTargetIds = sortedTargetPeers.map((t) => t.id)

      let insertAt = orderedTargetIds.length
      if (insertBeforeTaskId === taskId) {
        insertAt = oldIndexInGroup >= 0 ? oldIndexInGroup : 0
      } else if (insertBeforeTaskId) {
        const marker = working.find((t) => t.id === insertBeforeTaskId)
        if (marker && (marker.status || 'todo') === columnId) {
          const mkPri = marker.priority || 'must'
          if (mkPri === finalPri) {
            const idx = orderedTargetIds.indexOf(insertBeforeTaskId)
            if (idx >= 0) insertAt = idx
          } else {
            const br = PRIORITY_RANK[mkPri] ?? 99
            const dr = PRIORITY_RANK[finalPri] ?? 99
            insertAt = br < dr ? 0 : orderedTargetIds.length
          }
        }
      }

      const newTargetOrder = [
        ...orderedTargetIds.slice(0, insertAt),
        taskId,
        ...orderedTargetIds.slice(insertAt),
      ]

      if (!crossColumn && oldGroupOrder.join(',') === newTargetOrder.join(',')) return prev

      newTargetOrder.forEach((id, i) => positionUpdates.set(id, i))

      const prevSnap = new Map(prev.map((t) => [t.id, t]))
      working = working.map((t) => {
        let nt = { ...t }
        if (t.id === taskId) nt = { ...moved }
        if (positionUpdates.has(nt.id)) {
          nt = { ...nt, position: positionUpdates.get(nt.id) }
        }
        return nt
      })

      const newIndexInGroup = newTargetOrder.indexOf(taskId)

      const changedTasks = working.filter((t) => {
        const o = prevSnap.get(t.id)
        if (!o) return false
        if (positionUpdates.has(t.id) && o.position !== t.position) return true
        if (crossColumn && t.id === taskId) {
          return (
            o.status !== t.status ||
            o.doneAt !== t.doneAt ||
            o.updatedAt !== t.updatedAt ||
            o.position !== t.position
          )
        }
        return false
      })

      console.log('[TaskOrder] reordered', {
        taskId,
        status: columnId,
        oldIndex: oldIndexInGroup,
        newIndex: newIndexInGroup,
        changed: changedTasks.length,
      })

      broadcastTasks(working)
      const uid = ownerUserIdRef.current
      if (uid) {
        const shared = changedTasks.filter((t) => isSharedProjectTask(t))
        if (shared.length) void upsertRemoteTasks(shared, uid)
      }

      // Trigger notification for cross-column moves (with dedup guard)
      if (crossColumn && !window.__zcLastNotifTaskId || window.__zcLastNotifTaskId !== taskId + columnId) {
        window.__zcLastNotifTaskId = taskId + columnId
        setTimeout(() => { window.__zcLastNotifTaskId = null }, 1000)
        const movedTask = working.find((t) => t.id === taskId)
        if (movedTask) {
          const userEmail = user?.email || ''
          const userName = user?.user_metadata?.display_name || user?.user_metadata?.name || (userEmail.includes('@') ? userEmail.split('@')[0] : '') || 'Someone'
          const assignee = movedTask.assignee || 'Unassigned'
          const movedBy = userName
          addNotification({
            type: 'task_moved',
            title: 'Task Moved',
            message: `${movedBy} moved "${movedTask.title || 'Untitled'}" (assigned to ${assignee}) from ${srcStatus} → ${columnId}`,
            taskId: movedTask.id,
            taskTitle: movedTask.title || '',
            fromUser: movedBy,
            fromStatus: srcStatus,
            toStatus: columnId,
          })
          // Broadcast notification to all peers via P2P
          sendToAllPeers({
            type: 'NOTIFICATION',
            notification: {
              type: 'task_moved',
              title: 'Task Moved',
              message: `${movedBy} moved "${movedTask.title || 'Untitled'}" (assigned to ${assignee}) from ${srcStatus} → ${columnId}`,
              taskId: movedTask.id,
              taskTitle: movedTask.title || '',
              fromUser: movedBy,
              fromStatus: srcStatus,
              toStatus: columnId,
            },
          })
        }
      }

      return working
    })
  }

  const reorderTaskInColumnByKeyboard = (taskId, delta) => {
    setTasks((prev) => {
      const task = prev.find((t) => t.id === taskId)
      if (!task) return prev
      const columnId = task.status || 'todo'
      const pri = task.priority || 'must'
      const group = prev.filter(
        (t) => (t.status || 'todo') === columnId && (t.priority || 'must') === pri,
      )
      const sorted = [...group].sort(compareKanbanTasksInColumn)
      const idx = sorted.findIndex((t) => t.id === taskId)
      const j = idx + delta
      if (idx < 0 || j < 0 || j >= sorted.length) return prev
      const newOrder = [...sorted]
      const [item] = newOrder.splice(idx, 1)
      newOrder.splice(j, 0, item)
      const orderedIds = newOrder.map((t) => t.id)
      const positionUpdates = new Map(orderedIds.map((id, i) => [id, i]))
      const prevSnap = new Map(prev.map((t) => [t.id, t]))
      const next = prev.map((t) => {
        const p = positionUpdates.get(t.id)
        if (p === undefined) return t
        return { ...t, position: p }
      })
      const changedTasks = next.filter((t) => {
        const o = prevSnap.get(t.id)
        return o && positionUpdates.has(t.id) && o.position !== t.position
      })
      console.log('[TaskOrder] reordered', {
        taskId,
        status: columnId,
        oldIndex: idx,
        newIndex: j,
        changed: changedTasks.length,
      })
      broadcastTasks(next)
      const uid = ownerUserIdRef.current
      if (uid) {
        const shared = changedTasks.filter((t) => isSharedProjectTask(t))
        if (shared.length) void upsertRemoteTasks(shared, uid)
      }
      requestAnimationFrame(() => {
        document.getElementById(`task-card-${taskId}`)?.focus()
      })
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
    // Agile hierarchy separation: Tasks page is an execution board and must only create Task items.
    const normalizedPayload = createOnlyTask
      ? { ...payload, itemType: 'task', type: 'Task' }
      : payload
    setTasks((prev) => {
      const projectId = activeProject?.id ? activeProject.id : null
      const id =
        typeof normalizedPayload?.id === 'string' && normalizedPayload.id.trim()
          ? normalizedPayload.id.trim()
          : createId()
      const newPriority = normalizedPayload?.priority || 'must'
      const position = nextPositionForGroup(prev, 'todo', newPriority)
      const created = {
        id,
        status: 'todo',
        createdAt: now,
        updatedAt: now,
        ...normalizedPayload,
        type: normalizedPayload?.type ?? undefined,
        itemType: normalizedPayload?.itemType ?? normalizedPayload?.type ?? 'task',
        backlogState: normalizedPayload?.backlogState ?? 'new',
        sprintId: normalizedPayload?.sprintId ?? null,
        storyPoints: normalizeStoryPointsValue(
          normalizedPayload?.storyPoints ??
            normalizedPayload?.story_points ??
            normalizedPayload?.points ??
            0,
        ),
        calendarType,
        projectId,
        position,
        teamId:
          calendarType === 'general'
            ? activeTeam?.id || normalizedPayload.teamId || null
            : null,
        ownerUserId: user?.id || null,
      }
      const next = dedupeAndNormalizePositions([
        created,
        ...(Array.isArray(prev) ? prev.filter((t) => t?.id !== id) : []),
      ])
      broadcastTasks(next)
      const uid = ownerUserIdRef.current
      if (uid && isSharedProjectTask(created)) {
        void upsertRemoteTasks([created], uid)
      }
      return next
    })
  }

  const updateTask = (taskId, updates) => {
    setTasks((prev) => {
      const now = Date.now()
      const prevById = new Map(prev.map((t) => [t.id, t]))
      const beforeTask = prev.find((t) => t.id === taskId)
      if (beforeTask && isTaskDeleted(beforeTask)) return prev
      let effectiveUpdates = { ...updates }
      if (beforeTask) {
        const sid = beforeTask.sprintId
        const sprintLocked = sid != null && String(sid).trim() !== ''
        if (sprintLocked && effectiveUpdates.backlogState !== undefined) {
          const orig = String(beforeTask.backlogState || 'new').toLowerCase()
          const nextBs = String(effectiveUpdates.backlogState || 'new').toLowerCase()
          if (orig !== nextBs) {
            window.alert(t('backlog_state_sprint_locked_alert'))
            effectiveUpdates = { ...effectiveUpdates }
            delete effectiveUpdates.backlogState
          }
        }
      }
      const nextBeforeDedupe = prev.map((t) => {
        if (t.id !== taskId) return t
        const merged = { ...effectiveUpdates }
        delete merged.doneAt
        delete merged.done_at
        if ('storyPoints' in merged || 'story_points' in merged) {
          merged.storyPoints = normalizeStoryPointsValue(
            merged.storyPoints ?? merged.story_points ?? t.storyPoints ?? 0,
          )
          delete merged.story_points
        }
        const nextStatus =
          merged.status !== undefined ? merged.status : t.status
        const doneAt = resolveDoneAtForStatusChange(t, nextStatus, now)
        return { ...t, ...merged, updatedAt: now, doneAt }
      })
      const afterTask = nextBeforeDedupe.find((t) => t.id === taskId)
      if (afterTask && (afterTask.backlogState || 'new') === 'ready') {
        const dorCheck = validateReadyBacklogState(afterTask)
        if (!dorCheck.ok) {
          window.alert(dorCheck.message)
          return prev
        }
      }
      const statusChanged =
        !!beforeTask &&
        !!afterTask &&
        (beforeTask.status || 'todo') !== (afterTask.status || 'todo')
      const priorityChanged =
        !!beforeTask &&
        !!afterTask &&
        (beforeTask.priority || 'must') !== (afterTask.priority || 'must')
      const next =
        statusChanged || priorityChanged
          ? dedupeAndNormalizePositions(nextBeforeDedupe)
          : nextBeforeDedupe
      broadcastTasks(next)
      const uid = ownerUserIdRef.current
      if (uid) {
        const toUpsert = next.filter((t) => {
          if (!isSharedProjectTask(t)) return false
          const o = prevById.get(t.id)
          if (!o) return true
          return (
            o.position !== t.position ||
            o.status !== t.status ||
            o.priority !== t.priority ||
            o.updatedAt !== t.updatedAt ||
            o.doneAt !== t.doneAt ||
            o.storyPoints !== t.storyPoints ||
            o.title !== t.title ||
            o.description !== t.description ||
            o.assignee !== t.assignee ||
            o.itemType !== t.itemType ||
            o.backlogState !== t.backlogState ||
            o.sprintId !== t.sprintId ||
            o.deleted !== t.deleted ||
            o.deletedAt !== t.deletedAt ||
            JSON.stringify(o.definitionOfReady ?? null) !==
              JSON.stringify(t.definitionOfReady ?? null)
          )
        })
        if (toUpsert.length) void upsertRemoteTasks(toUpsert, uid)
      }
      return next
    })
  }

  const deleteTask = (taskId) => {
    const removed = tasksRef.current.find((t) => t.id === taskId) ?? null
    if (!removed) return
    // Personal/no-project tasks: remove locally immediately.
    if (!removed.projectId) {
      setTasks((prev) => {
        const next = prev.filter((t) => t?.id !== taskId)
        broadcastTasks(next)
        if (ownerUserId) {
          void saveTasks(next, ownerUserId, { allowEmpty: true, reason: 'deleteTask personal' })
        }
        return next
      })
      return
    }

    // Project-scoped tasks: keep tombstone soft-delete for remote/P2P sync.
    const tombstone = normalizeTaskForStorage(
      markTaskSoftDeleted({ ...removed }, Date.now()),
      ownerUserId,
    )
    if (!tombstone) return
    setTasks((prev) => {
      const next = prev.map((t) => (t.id === taskId ? tombstone : t))
      broadcastTasks(next)
      if (ownerUserId) {
        void saveTasks(next, ownerUserId, { allowEmpty: true, reason: 'deleteTask' })
      }
      return next
    })
    if (shouldBroadcastGeneralTaskDelete(removed, memberProjectIds)) {
      sendToAllPeers({
        type: 'TASK_DELETE',
        taskId: removed.id,
        projectId: removed.projectId,
      })
      void broadcastTaskDelete(removed.id, removed.projectId)
    }
    if (isSharedProjectTask(tombstone) && tombstone.projectId && ownerUserId) {
      void upsertRemoteTasks([tombstone], ownerUserId)
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
    <div className={isSprintBoard ? 'mt-0' : 'mt-6'}>
      {isSprintBoard && activeSprint && sprintBoardHeaderMetrics ? (
        <section className="mb-6 rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-5">
          <p className="text-xs uppercase tracking-wide text-[rgb(var(--zc-subtle))]">
            Active sprint
          </p>
          <h2 className="mt-1 text-xl font-semibold text-[rgb(var(--zc-text))]">
            Sprint #{activeSprint.sprint_number}
          </h2>
          <p className="mt-2 text-sm text-[rgb(var(--zc-text))]">
            <span className="text-[rgb(var(--zc-muted))]">Goal: </span>
            {activeSprint.sprint_goal || activeSprint.sprintGoal || '—'}
          </p>
          <p className="mt-1 text-xs text-[rgb(var(--zc-muted2))]">
            {activeSprint.start_date} → {activeSprint.end_date}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2 text-sm">
              <p className="text-xs text-[rgb(var(--zc-subtle))]">Capacity</p>
              <p className="text-[rgb(var(--zc-text))]">
                {sprintBoardHeaderMetrics.cap} SP
              </p>
            </div>
            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2 text-sm">
              <p className="text-xs text-[rgb(var(--zc-subtle))]">Selected</p>
              <p className="text-[rgb(var(--zc-text))]">
                {sprintBoardHeaderMetrics.selectedSP} SP
              </p>
            </div>
            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2 text-sm">
              <p className="text-xs text-[rgb(var(--zc-subtle))]">Remaining</p>
              <p className="text-[rgb(var(--zc-text))]">
                {sprintBoardHeaderMetrics.remainingSP} SP
              </p>
            </div>
            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2 text-sm sm:col-span-2 lg:col-span-3">
              <p className="text-xs text-[rgb(var(--zc-subtle))]">Planning</p>
              <p className="text-[rgb(var(--zc-text))]">
                {sprintBoardHeaderMetrics.planningCompleted
                  ? 'Completed'
                  : 'Draft'}
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.25)] px-3 py-3">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-[rgb(var(--zc-muted))]">Sprint progress</span>
              <span className="font-medium text-[rgb(var(--zc-text))]">
                {sprintBoardHeaderMetrics.completionPercentage}%
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[rgb(var(--zc-border)/0.6)]">
              <div
                className="h-full rounded-full bg-emerald-500/80 transition-[width]"
                style={{
                  width: `${sprintBoardHeaderMetrics.completionPercentage}%`,
                }}
              />
            </div>
            <p className="mt-2 text-xs text-[rgb(var(--zc-subtle))]">
              {sprintBoardHeaderMetrics.doneSprintTasks} of{' '}
              {sprintBoardHeaderMetrics.totalSprintTasks} tasks done
            </p>
          </div>
        </section>
      ) : null}
      {isSprintBoard && activeSprint ? (
        <BurndownChart
          activeSprint={activeSprint}
          sprintTasks={boardScopedTasks}
          isLoading={isLoadingTasks}
        />
      ) : null}
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
          {isSprintBoard ? (
            <p className="text-sm text-[rgb(var(--zc-muted2))]">
              Only tasks committed to the active sprint. Drag cards to update workflow status.
            </p>
          ) : (
            <>
              <p className="text-sm text-[rgb(var(--zc-muted))]">
                {t('kanban_hint')}{' '}
                <span className="text-[rgb(var(--zc-text))]">{t('kanban_indexeddb')}</span>.
              </p>
              <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                {t('kanban_total_tasks', { n: total })}
              </p>
            </>
          )}
          {isSprintBoard ? (
            <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
              Sprint tasks: {total}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {headerActions}
          {!isSprintBoard ? (
            <select
              className="h-9 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              value={boardView}
              onChange={(e) => setBoardView(e.target.value)}
              aria-label="Board view"
            >
              <option value="all">All Tasks</option>
              <option value="active_sprint">Active Sprint</option>
              <option value="backlog">Backlog</option>
              <option value="refinement_session">Refinement Session</option>
              <option value="ready_backlog">{t('kanban_view_ready_backlog')}</option>
            </select>
          ) : null}
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
          {!isSprintBoard ? (
            <Button onClick={() => setIsAddOpen(true)}>{t('kanban_add_task')}</Button>
          ) : null}
        </div>
      </div>

      {!isSprintBoard && boardView === 'active_sprint' && hasActiveSprint ? (
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

      {isRefinementSessionView ? (
        <section className="mt-4 rounded-xl border border-amber-500/25 border-violet-500/20 bg-[rgb(var(--zc-bg)/0.4)] px-4 py-3 ring-1 ring-inset ring-amber-400/15">
          <h2 className="text-sm font-semibold text-[rgb(var(--zc-text))]">
            Refinement Session
          </h2>
          <p className="mt-1 text-xs text-[rgb(var(--zc-muted2))]">
            Items currently under backlog refinement and Definition of Ready review.
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            <span className="rounded-md bg-[rgb(var(--zc-panel)/0.5)] px-2.5 py-1 text-[rgb(var(--zc-text))] ring-1 ring-[rgb(var(--zc-border))]">
              Refined items:{' '}
              <span className="font-medium tabular-nums">{refinementSessionMetrics.refinedCount}</span>
            </span>
            <span className="rounded-md bg-[rgb(var(--zc-panel)/0.5)] px-2.5 py-1 text-[rgb(var(--zc-text))] ring-1 ring-[rgb(var(--zc-border))]">
              Ready candidates:{' '}
              <span className="font-medium tabular-nums text-emerald-300/90">
                {refinementSessionMetrics.readyCandidates}
              </span>
            </span>
          </div>
        </section>
      ) : null}

      {isReadyBacklogView ? (
        <section className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 ring-1 ring-inset ring-emerald-400/20">
          <h2 className="text-sm font-semibold text-[rgb(var(--zc-text))]">
            {t('kanban_ready_backlog_title')}
          </h2>
          <p className="mt-1 text-xs text-[rgb(var(--zc-muted2))]">{t('kanban_ready_backlog_hint')}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            <span className="rounded-md bg-[rgb(var(--zc-panel)/0.5)] px-2.5 py-1 text-[rgb(var(--zc-text))] ring-1 ring-[rgb(var(--zc-border))]">
              {t('kanban_ready_backlog_count', { n: readyBacklogTasks.length })}
            </span>
          </div>
        </section>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-4">
        {isLoadingTasks ? (
          <div className="lg:col-span-4 rounded-xl border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-6 text-sm text-[rgb(var(--zc-muted2))]">
            {t('loading_tasks')}
          </div>
        ) : !isSprintBoard && boardView === 'active_sprint' && !hasActiveSprint ? (
          <div className="lg:col-span-4 rounded-xl border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-6 text-sm text-[rgb(var(--zc-muted2))]">
            No active sprint. Create one from Project Overview.
          </div>
        ) : !isSprintBoard && boardView === 'ready_backlog' && !activeProject?.id ? (
          <div className="lg:col-span-4 rounded-xl border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-6 text-sm text-[rgb(var(--zc-muted2))]">
            {t('kanban_ready_backlog_no_project')}
          </div>
        ) : !isSprintBoard &&
          boardView === 'ready_backlog' &&
          activeProject?.id &&
          !isLoadingTasks &&
          readyBacklogTasks.length === 0 ? (
          <div className="lg:col-span-4 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-10 text-center">
            <p className="max-w-md text-sm text-[rgb(var(--zc-text))]">
              {t('kanban_ready_backlog_empty')}
            </p>
          </div>
        ) : !isSprintBoard &&
          boardView === 'refinement_session' &&
          !isLoadingTasks &&
          refinementSessionTasks.length === 0 ? (
          <div className="lg:col-span-4 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-10 text-center">
            <p className="text-sm text-[rgb(var(--zc-text))]">
              No backlog items are currently in refinement.
            </p>
            <p className="max-w-md text-xs text-[rgb(var(--zc-muted2))]">
              Move backlog items to &quot;Refined&quot; state to begin refinement review.
            </p>
          </div>
        ) : isSprintBoard &&
          hasActiveSprint &&
          !isLoadingTasks &&
          boardScopedTasks.length === 0 ? (
          <div className="lg:col-span-4 flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-10 text-center text-sm text-[rgb(var(--zc-muted2))]">
            <p>No tasks committed to this sprint yet.</p>
            <Link
              to="/sprint-planning"
              className="rounded-md bg-indigo-500/25 px-4 py-2 text-sm font-medium text-indigo-200 hover:bg-indigo-500/35"
            >
              Open Sprint Planning
            </Link>
          </div>
        ) : (
          columnsWithTitles.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              tasks={tasksByColumn.get(column.id) ?? []}
              sprintTaskBadge={isSprintBoard}
              onDropTask={handleKanbanDrop}
              onReorderTaskByKeyboard={reorderTaskInColumnByKeyboard}
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
              refinementSessionMode={isRefinementSessionView}
            />
          ))
        )}
      </div>

      {!isSprintBoard ? (
        <AddTaskModal
          key={`add-task-${isAddOpen ? 'open' : 'closed'}-${activeProject?.id ?? 'none'}-${activeTeam?.id ?? 'none'}`}
          open={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          onCreate={createTask}
          forceItemType={createOnlyTask ? 'task' : null}
          customCalendars={customCalendars}
          activeProject={activeProject}
          activeTeam={activeTeam}
        />
      ) : null}

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
