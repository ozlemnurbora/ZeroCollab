import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MonthlyCalendar } from '../components/calendar/MonthlyCalendar.jsx'
import { DayTasksModal } from '../components/calendar/DayTasksModal.jsx'
import { AddTaskModal } from '../components/kanban/AddTaskModal.jsx'
import { TaskDetailModal } from '../components/kanban/TaskDetailModal.jsx'
import {
  loadTasks,
  saveTasks,
  normalizeTaskForStorage,
  markTaskSoftDeleted,
  isTaskDeleted,
} from '../components/kanban/taskStorage.js'
import { isSharedProjectTask, upsertRemoteTasks } from '../utils/taskRemoteStorage.js'
import { deleteMeeting, loadMeetings, saveMeeting } from '../utils/meetingStorage.js'
import {
  addDaysCalendar,
  parseISODateLocal,
  toISODate,
} from '../components/calendar/calendarDateUtils.js'
import { Button } from '../components/ui/Button.jsx'
import { useLanguage } from '../utils/LanguageContext.jsx'
import { useWorkspace } from '../utils/WorkspaceContext.jsx'
import { useAuth } from '../utils/AuthContext.jsx'
import { broadcastTaskDelete } from '../utils/hubManager.js'
import { on, sendToAllPeers, P2P_EVENTS } from '../utils/p2pManager.js'
import {
  applyAuthorizedGeneralTaskSoftDelete,
  filterTasksForVisibility,
  mergeTasksFromSync,
  shouldBroadcastGeneralTaskDelete,
  taskVisibleInActiveProject,
  tasksForP2PBroadcast,
} from '../utils/taskP2PSync.js'
import {
  CUSTOM_CALENDARS_STORAGE_KEY,
  CUSTOM_CALENDARS_UPDATED_EVENT,
  filterCustomCalendarsForScope,
  loadCustomCalendarsFromStorage,
} from '../utils/customCalendarStorage.js'
import { addLogEntry } from '../utils/logService.js'
import { categoryFromItemType } from '../utils/logCategories.js'
import { ActiveProjectBadge } from '../components/common/ActiveProjectBadge.jsx'

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID)
    return crypto.randomUUID()
  return `task_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

/**
 * Calendar should only show real Tasks (linked or independent) plus Meetings.
 * Epics, Features, and User Stories are hierarchy/backlog items and must NOT
 * appear on the calendar even if they happen to share storage with tasks.
 *
 * Robust detection — case-insensitive, handles itemType and legacy `type`:
 *   - "task" / "Task"
 *   - falls back to other casings via .toLowerCase()
 *   - any other type (epic / feature / user_story / user story / story / etc.)
 *     is excluded.
 */
function isCalendarTask(item) {
  if (!item) return false
  const it = String(item.itemType ?? '').toLowerCase().trim()
  if (it) return it === 'task'
  const t = String(item.type ?? '').toLowerCase().trim()
  if (t) return t === 'task'
  // Legacy items without itemType/type were always treated as tasks in the
  // existing storage; preserve that behavior so day-task counts don't regress
  // for older records that pre-date the Agile hierarchy.
  return true
}

const CALENDAR_COLORS = [
  'bg-violet-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-cyan-500',
  'bg-pink-500',
  'bg-orange-500',
]

function CalendarChip({ active, onClick, color, label, onDelete }) {
  return (
    <div className="group relative flex shrink-0 items-center">
      <button
        type="button"
        role="tab"
        aria-selected={active}
        onClick={onClick}
        className={[
          'flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition',
          active
            ? 'bg-indigo-500/20 text-[rgb(var(--zc-text))] ring-1 ring-indigo-400/50'
            : 'bg-[rgb(var(--zc-border)/0.35)] text-[rgb(var(--zc-muted))] hover:bg-[rgb(var(--zc-border)/0.6)] hover:text-[rgb(var(--zc-text))]',
          onDelete ? 'pr-7' : '',
        ].join(' ')}
      >
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${color}`}
          aria-hidden="true"
        />
        <span className="max-w-[10rem] truncate">{label}</span>
      </button>
      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Remove calendar"
          className="absolute right-1.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 items-center justify-center rounded text-[10px] text-[rgb(var(--zc-subtle))] hover:bg-rose-500/15 hover:text-rose-400 group-hover:flex"
        >
          ✕
        </button>
      ) : null}
    </div>
  )
}

export function CalendarPage() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const ownerUserId = user?.id ?? null
  const ownerUserIdRef = useRef(ownerUserId)
  const { activeProject, activeTeam, memberProjectIds = [] } = useWorkspace()
  const [tasks, setTasks] = useState([])
  const [meetings, setMeetings] = useState([])
  const [activeCalendar, setActiveCalendar] = useState('general')
  const [activeView, setActiveView] = useState('month')
  const [isLoadingTasks, setIsLoadingTasks] = useState(true)
  const [hasLoadedTasks, setHasLoadedTasks] = useState(false)
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedISODate, setSelectedISODate] = useState(() => toISODate(new Date()))
  const [isDayOpen, setIsDayOpen] = useState(false)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [detailInitialEdit, setDetailInitialEdit] = useState(false)
  const [syncNotice, setSyncNotice] = useState(false)
  const [customCalendars, setCustomCalendars] = useState(() =>
    loadCustomCalendarsFromStorage(),
  )
  const [showNewCalendarInput, setShowNewCalendarInput] = useState(false)
  const [newCalendarName, setNewCalendarName] = useState('')
  const tasksRef = useRef(tasks)
  const meetingsRef = useRef(meetings)

  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])

  useEffect(() => {
    meetingsRef.current = meetings
  }, [meetings])

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

  const visibleCustomCalendars = useMemo(
    () =>
      filterCustomCalendarsForScope(customCalendars, {
        projectId: activeProject?.id ?? null,
        ownerUserId,
      }),
    [customCalendars, activeProject?.id, ownerUserId],
  )

  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(CUSTOM_CALENDARS_STORAGE_KEY, JSON.stringify(customCalendars))
      window.dispatchEvent(new Event(CUSTOM_CALENDARS_UPDATED_EVENT))
    } catch {
      // ignore quota / privacy errors
    }
  }, [customCalendars])

  useEffect(() => {
    if (activeCalendar === 'general' || activeCalendar === 'personal') return
    if (visibleCustomCalendars.some((c) => c.id === activeCalendar)) return
    setActiveCalendar('general')
  }, [activeCalendar, visibleCustomCalendars])

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
      setTasks(Array.isArray(existing) ? existing : [])
      setHasLoadedTasks(true)
      setIsLoadingTasks(false)
    })()
    return () => {
      cancelled = true
    }
  }, [ownerUserId])

  useEffect(() => {
    if (!ownerUserId) {
      setMeetings([])
      return
    }
    loadMeetings(ownerUserId).then((data) => {
      const list = Array.isArray(data) ? data : []
      const visible = list.filter((meeting) => {
        if (!meeting?.projectId || !memberProjectIds.includes(meeting.projectId)) return false
        if (meeting.calendarType === 'general') return true
        return meeting.ownerUserId === ownerUserId
      })
      setMeetings(visible)
    })
  }, [memberProjectIds, ownerUserId])

  useEffect(() => {
    const handleMeetingUpdate = async (e) => {
      const { meeting, meetingId, meetingAction, projectId } = e.detail || {}
      if (meetingAction === 'upsert' && meeting) {
        if (meeting.calendarType === 'general') {
          if (projectId && !memberProjectIds.includes(projectId)) return
          if (activeProject?.id && projectId && projectId !== activeProject.id) return
          if (!meeting.projectId || !memberProjectIds.includes(meeting.projectId)) return
        } else {
          if (!ownerUserId || meeting.ownerUserId !== ownerUserId) return
          if (!meeting.projectId || !memberProjectIds.includes(meeting.projectId)) return
        }
        if (ownerUserId) await saveMeeting(meeting, ownerUserId)
        setMeetings((prev) => {
          const exists = prev.find((m) => m.id === meeting.id)
          if (exists) return prev.map((m) => (m.id === meeting.id ? meeting : m))
          return [...prev, meeting]
        })
      } else if (meetingAction === 'delete' && meetingId) {
        if (projectId && !memberProjectIds.includes(projectId)) return
        if (activeProject?.id && projectId && projectId !== activeProject.id) return
        if (ownerUserId) await deleteMeeting(meetingId, ownerUserId)
        setMeetings((prev) => prev.filter((m) => m.id !== meetingId))
      }
    }
    window.addEventListener('hub:meeting-update', handleMeetingUpdate)
    return () => window.removeEventListener('hub:meeting-update', handleMeetingUpdate)
  }, [activeProject?.id, activeProject?.name, memberProjectIds, ownerUserId, user?.id, user?.email])

  useEffect(() => {
    let hideTimer
    let peerBroadcastTimer
    const unsubMsg = on(P2P_EVENTS.MESSAGE, ({ data }) => {
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
      console.log('[CalendarPage] incoming TASK_SYNC', {
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
        const next = mergeTasksFromSync(prev, incomingGeneralTasks, visibilityOptions).map((t) =>
          uid ? { ...t, ownerUserId: uid } : t,
        )
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
  }, [broadcastTasks, activeProject?.id, memberProjectIds, visibilityOptions, ownerUserId])

  useEffect(() => {
    const handleHubMessage = (e) => {
      const payload = e.detail || {}
      if (payload.action !== 'task-delete') return
      const { taskId, projectId } = payload
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
    }
    window.addEventListener('hub:message', handleHubMessage)
    return () => window.removeEventListener('hub:message', handleHubMessage)
  }, [activeProject?.id, memberProjectIds])

  const filteredTasks = useMemo(() => {
    let list = filterTasksForVisibility(tasks, visibilityOptions)
    if (activeProject) {
      list = list.filter((task) =>
        taskVisibleInActiveProject(task, activeProject.id, ownerUserId),
      )
    }

    // Calendar shows ONLY Tasks + Meetings.
    // Hierarchy items (Epic / Feature / User Story) live in Backlog/Roadmap
    // and must be excluded here even if they share IndexedDB/Supabase storage.
    list = list.filter(isCalendarTask)

    // Filter by calendar selection
    if (activeCalendar === 'general') {
      return list.filter((task) => task.calendarType === 'general')
    }

    if (activeCalendar === 'personal') {
      return list.filter((task) => task.calendarType !== 'general')
    }

    // Custom calendar
    return list.filter((task) => task.calendarId === activeCalendar)
  }, [tasks, activeCalendar, activeProject, visibilityOptions, ownerUserId])

  const addCalendar = () => {
    const name = newCalendarName.trim()
    if (!name) return
    if (!ownerUserId || !activeProject?.id) return
    const scopedCount = filterCustomCalendarsForScope(customCalendars, {
      projectId: activeProject.id,
      ownerUserId,
    }).length
    const newCal = {
      id: `custom_${Date.now()}`,
      name,
      color: CALENDAR_COLORS[scopedCount % CALENDAR_COLORS.length],
      projectId: activeProject.id,
      ownerUserId,
    }
    setCustomCalendars((prev) => [...prev, newCal])
    setActiveCalendar(newCal.id)
    setNewCalendarName('')
    setShowNewCalendarInput(false)
    void addLogEntry({
      action: 'calendar.created',
      category: 'calendar',
      severity: 'success',
      message: `Created calendar "${name}"`,
      userId: user?.id,
      userName: user?.email?.split('@')[0] || '',
      projectId: activeProject?.id,
      projectName: activeProject?.name || '',
      entityType: 'calendar',
      entityId: newCal.id,
      entityName: name,
    })
  }

  const deleteCalendar = (id) => {
    if (!visibleCustomCalendars.some((c) => c.id === id)) return
    const removed = visibleCustomCalendars.find((c) => c.id === id)
    setCustomCalendars((prev) => prev.filter((c) => c.id !== id))
    if (activeCalendar === id) setActiveCalendar('general')
    if (removed) {
      void addLogEntry({
        action: 'calendar.deleted',
        category: 'calendar',
        severity: 'warning',
        message: `Deleted calendar "${removed.name}"`,
        userId: user?.id,
        userName: user?.email?.split('@')[0] || '',
        projectId: activeProject?.id,
        projectName: activeProject?.name || '',
        entityType: 'calendar',
        entityId: removed.id,
        entityName: removed.name,
      })
    }
  }

  const tasksByISODate = useMemo(() => {
    const map = new Map()
    for (const task of filteredTasks) {
      if (!task.dueDate) continue
      const startISO = task.startDate || task.dueDate
      const endISO = task.dueDate
      const start = new Date(startISO + 'T00:00:00')
      const end = new Date(endISO + 'T00:00:00')
      if (start > end) {
        const list = map.get(endISO) ?? []
        list.push(task)
        map.set(endISO, list)
        continue
      }
      const cur = new Date(start)
      while (cur <= end) {
        const y = cur.getFullYear()
        const m = String(cur.getMonth() + 1).padStart(2, '0')
        const d = String(cur.getDate()).padStart(2, '0')
        const iso = `${y}-${m}-${d}`
        const list = map.get(iso) ?? []
        if (!list.some((t) => t.id === task.id)) {
          list.push(task)
          map.set(iso, list)
        }
        cur.setDate(cur.getDate() + 1)
      }
    }
    for (const [, list] of map.entries()) {
      list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    }
    return map
  }, [filteredTasks])

  const meetingsByISODate = useMemo(() => {
    const map = new Map()

    const filteredMeetings = meetings.filter((meeting) => {
      if (meeting.calendarType === 'general') {
        if (!meeting?.projectId || !memberProjectIds.includes(meeting.projectId)) return false
        if (activeProject?.id && meeting.projectId !== activeProject.id) return false
      } else {
        if (meeting.ownerUserId !== ownerUserId) return false
        if (activeProject?.id && meeting.projectId !== activeProject.id) return false
      }
      if (activeCalendar === 'general') return meeting.calendarType === 'general'
      if (activeCalendar === 'personal') {
        return meeting.calendarType === 'personal' || meeting.calendarType !== 'general'
      }
      return meeting.calendarId === activeCalendar || meeting.calendarType === activeCalendar
    })

    for (const meeting of filteredMeetings) {
      if (!meeting.date) continue

      const addMeeting = (iso) => {
        const list = map.get(iso) ?? []
        list.push({ ...meeting, isMeeting: true })
        map.set(iso, list)
      }

      addMeeting(meeting.date)

      if (meeting.recurring !== 'none') {
        const futureLimit = new Date()
        futureLimit.setMonth(futureLimit.getMonth() + 6)
        let cur = new Date(meeting.date + 'T00:00:00')

        for (let i = 0; i < 52; i++) {
          if (meeting.recurring === 'daily') cur.setDate(cur.getDate() + 1)
          else if (meeting.recurring === 'weekly') cur.setDate(cur.getDate() + 7)
          else if (meeting.recurring === 'monthly') cur.setMonth(cur.getMonth() + 1)
          if (cur > futureLimit) break
          const y = cur.getFullYear()
          const m = String(cur.getMonth() + 1).padStart(2, '0')
          const d = String(cur.getDate()).padStart(2, '0')
          addMeeting(`${y}-${m}-${d}`)
        }
      }
    }
    return map
  }, [meetings, activeCalendar, activeProject, memberProjectIds, ownerUserId])

  const selectedTasks = tasksByISODate.get(selectedISODate) ?? []

  const handleSelectISODate = useCallback((iso) => {
    setSelectedISODate(iso)
    setIsDayOpen(true)
  }, [])

  const onGoToday = useCallback(() => {
    const now = new Date()
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1))
    setSelectedISODate(toISODate(now))
    setIsDayOpen(true)
  }, [])

  const onNavigatePrev = useCallback(() => {
    if (activeView === 'month') {
      setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
      return
    }
    const d = parseISODateLocal(selectedISODate)
    const base = Number.isNaN(d.getTime()) ? new Date() : d
    const delta = activeView === 'week' ? -7 : -1
    const next = addDaysCalendar(base, delta)
    setSelectedISODate(toISODate(next))
    setViewDate(new Date(next.getFullYear(), next.getMonth(), 1))
  }, [activeView, selectedISODate])

  const onNavigateNext = useCallback(() => {
    if (activeView === 'month') {
      setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
      return
    }
    const d = parseISODateLocal(selectedISODate)
    const base = Number.isNaN(d.getTime()) ? new Date() : d
    const delta = activeView === 'week' ? 7 : 1
    const next = addDaysCalendar(base, delta)
    setSelectedISODate(toISODate(next))
    setViewDate(new Date(next.getFullYear(), next.getMonth(), 1))
  }, [activeView, selectedISODate])

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
      const next = [
        {
          id: createId(),
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
        ...(Array.isArray(prev) ? prev : []),
      ]
      broadcastTasks(next)
      return next
    })
  }

  const updateTask = (taskId, updates) => {
    setTasks((prev) => {
      const before = prev.find((t) => t.id === taskId)
      if (before && isTaskDeleted(before)) return prev
      const next = prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t))
      broadcastTasks(next)
      return next
    })
  }

  const deleteTask = (taskId) => {
    const removed = tasksRef.current.find((t) => t.id === taskId) ?? null
    if (!removed) return
    const logCat = categoryFromItemType(removed.itemType)
    void addLogEntry({
      action: `${logCat}.deleted`,
      category: logCat,
      severity: 'warning',
      message: `Deleted ${logCat} "${removed.title || 'Untitled'}"`,
      userId: user?.id,
      userName: user?.email?.split('@')[0] || '',
      projectId: activeProject?.id,
      projectName: activeProject?.name || '',
      entityType: logCat,
      entityId: removed.id,
      entityName: removed.title || '',
    })
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

  return (
    <section>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-500 via-pink-500 to-violet-600">
          {t('page_calendar_title')}
        </span>
      </h1>
      <ActiveProjectBadge />
      {syncNotice ? (
        <p
          className="mt-3 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
          role="status"
        >
          {t('sync_received')}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2 shrink-0">
          {['day', 'week', 'month'].map((id) => (
            <Button
              key={id}
              size="sm"
              variant={activeView === id ? 'primary' : 'secondary'}
              onClick={() => setActiveView(id)}
            >
              {id === 'day' ? t('cal_view_day') : id === 'week' ? t('cal_view_week') : t('cal_view_month')}
            </Button>
          ))}
        </div>
        <p className="text-xs text-[rgb(var(--zc-muted))] sm:text-sm">
          {t('page_calendar_subtitle')}
        </p>
      </div>

      <div className="mt-3 rounded-xl border border-l-4 border-[rgb(var(--zc-border))] border-l-violet-500/70 bg-[rgb(var(--zc-bg)/0.25)] p-2">
        <div className="mb-1.5 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-violet-600">
            <span aria-hidden="true">🗂️</span>
            {t('cal_sidebar_calendars')}
          </p>
        </div>
        <div
          className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgb(var(--zc-border))]"
          role="tablist"
          aria-label={t('cal_sidebar_calendars')}
        >
          <CalendarChip
            active={activeCalendar === 'general'}
            onClick={() => setActiveCalendar('general')}
            color="bg-indigo-500"
            label={activeProject?.name || t('cal_calendar_general')}
          />
          <CalendarChip
            active={activeCalendar === 'personal'}
            onClick={() => setActiveCalendar('personal')}
            color="bg-emerald-500"
            label={t('cal_calendar_personal')}
          />
          {visibleCustomCalendars.map((cal) => (
            <CalendarChip
              key={cal.id}
              active={activeCalendar === cal.id}
              onClick={() => setActiveCalendar(cal.id)}
              color={cal.color}
              label={cal.name}
              onDelete={() => deleteCalendar(cal.id)}
            />
          ))}
          {showNewCalendarInput ? (
            <div className="flex shrink-0 items-center gap-1">
              <input
                autoFocus
                type="text"
                value={newCalendarName}
                onChange={(e) => setNewCalendarName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addCalendar()
                  if (e.key === 'Escape') {
                    setShowNewCalendarInput(false)
                    setNewCalendarName('')
                  }
                }}
                placeholder={t('cal_calendar_name_ph')}
                className="w-40 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 py-1 text-xs text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
              />
              <button
                type="button"
                onClick={addCalendar}
                className="rounded-md bg-indigo-500/20 px-2 py-1 text-xs font-medium text-indigo-300 hover:bg-indigo-500/30"
              >
                {t('cal_add')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNewCalendarInput(false)
                  setNewCalendarName('')
                }}
                className="rounded-md bg-[rgb(var(--zc-border)/0.5)] px-2 py-1 text-xs text-[rgb(var(--zc-muted))] hover:bg-[rgb(var(--zc-border))]"
              >
                {t('btn_cancel')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={!activeProject?.id || !ownerUserId}
              title={
                !activeProject?.id
                  ? t('cal_new_calendar_need_project')
                  : !ownerUserId
                    ? t('cal_new_calendar_need_owner')
                    : t('cal_new_calendar')
              }
              onClick={() => setShowNewCalendarInput(true)}
              className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-[rgb(var(--zc-border))] bg-transparent px-3 py-1.5 text-xs font-medium text-[rgb(var(--zc-muted))] transition hover:border-indigo-400 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span aria-hidden="true">+</span>
              <span>{t('cal_new_calendar')}</span>
            </button>
          )}
        </div>
      </div>

      <div className={`mt-3 ${isDayOpen ? 'lg:mr-80' : ''}`}>
        {isLoadingTasks ? (
          <div className="rounded-xl border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-6 text-sm text-[rgb(var(--zc-muted2))]">
            {t('loading_tasks')}
          </div>
        ) : (
          <MonthlyCalendar
            viewMode={activeView}
            viewDate={viewDate}
            onChangeViewDate={setViewDate}
            selectedISODate={selectedISODate}
            onSelectISODate={handleSelectISODate}
            tasksByISODate={tasksByISODate}
            meetingsByISODate={meetingsByISODate}
            onNavigatePrev={onNavigatePrev}
            onNavigateNext={onNavigateNext}
            onGoToday={onGoToday}
          />
        )}
      </div>

      <DayTasksModal
        open={isDayOpen}
        onClose={() => setIsDayOpen(false)}
        isoDate={selectedISODate}
        tasks={selectedTasks}
        meetings={meetingsByISODate.get(selectedISODate) ?? []}
        onAdd={() => setIsAddOpen(true)}
        onTaskClick={(task) => {
          setSelectedTaskId(task.id)
          setDetailInitialEdit(false)
        }}
      />

      <AddTaskModal
        key={`calendar-add-task-${isAddOpen ? 'open' : 'closed'}-${activeCalendar}-${selectedISODate}`}
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onCreate={createTask}
        initialValues={{
          dueDate: selectedISODate,
          calendarType: activeCalendar.startsWith('custom_')
            ? 'personal'
            : activeCalendar,
          calendarId: activeCalendar,
        }}
        customCalendars={visibleCustomCalendars}
        activeProject={activeProject}
        activeTeam={activeTeam}
      />

      <TaskDetailModal
        key={`calendar-task-detail-${selectedTaskId ?? 'none'}-${detailInitialEdit ? 'edit' : 'view'}`}
        open={!!selectedTask}
        onClose={() => setSelectedTaskId(null)}
        task={selectedTask}
        onUpdate={updateTask}
        onDelete={(id) => {
          deleteTask(id)
          setSelectedTaskId(null)
        }}
        customCalendars={visibleCustomCalendars}
        initialEdit={detailInitialEdit}
      />
    </section>
  )
}
