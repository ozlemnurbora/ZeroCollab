import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MonthlyCalendar } from '../components/calendar/MonthlyCalendar.jsx'
import { DayTasksModal } from '../components/calendar/DayTasksModal.jsx'
import { AddTaskModal } from '../components/kanban/AddTaskModal.jsx'
import { TaskDetailModal } from '../components/kanban/TaskDetailModal.jsx'
import { loadTasks, saveTasks } from '../components/kanban/taskStorage.js'
import { deleteMeeting, loadMeetings, saveMeeting } from '../utils/meetingStorage.js'
import {
  addDaysCalendar,
  parseISODateLocal,
  toISODate,
} from '../components/calendar/calendarDateUtils.js'
import { Button } from '../components/ui/Button.jsx'
import { useLanguage } from '../utils/LanguageContext.jsx'
import { useWorkspace } from '../utils/WorkspaceContext.jsx'
import { on, sendToAllPeers, P2P_EVENTS } from '../utils/p2pManager.js'
import { mergeTasksFromSync, tasksForP2PBroadcast } from '../utils/taskP2PSync.js'

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID)
    return crypto.randomUUID()
  return `task_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

const CALENDAR_COLORS = [
  'bg-violet-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-cyan-500',
  'bg-pink-500',
  'bg-orange-500',
]

export function CalendarPage() {
  const { t } = useLanguage()
  const { activeProject, activeTeam } = useWorkspace()
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
  const [customCalendars, setCustomCalendars] = useState(() => {
    try {
      if (typeof localStorage === 'undefined') return []
      const parsed = JSON.parse(localStorage.getItem('zc-custom-calendars') || '[]')
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })
  const [showNewCalendarInput, setShowNewCalendarInput] = useState(false)
  const [newCalendarName, setNewCalendarName] = useState('')
  const tasksRef = useRef(tasks)

  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  )

  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem('zc-custom-calendars', JSON.stringify(customCalendars))
  }, [customCalendars])

  const broadcastTasks = useCallback(
    (updatedTasks) => {
      const generalTasks = tasksForP2PBroadcast(updatedTasks, activeProject)
      if (generalTasks.length === 0) return
      sendToAllPeers({
        type: 'TASK_SYNC',
        tasks: generalTasks,
      })
    },
    [activeProject],
  )

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
      setTasks(Array.isArray(existing) ? existing : [])
      setHasLoadedTasks(true)
      setIsLoadingTasks(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    loadMeetings().then((data) => setMeetings(Array.isArray(data) ? data : []))
  }, [])

  useEffect(() => {
    const handleMeetingUpdate = async (e) => {
      const { meeting, meetingId, meetingAction, projectId } = e.detail || {}
      if (activeProject?.id && projectId && projectId !== activeProject.id) return

      if (meetingAction === 'upsert' && meeting) {
        await saveMeeting(meeting)
        setMeetings((prev) => {
          const exists = prev.find((m) => m.id === meeting.id)
          if (exists) return prev.map((m) => (m.id === meeting.id ? meeting : m))
          return [...prev, meeting]
        })
      } else if (meetingAction === 'delete' && meetingId) {
        await deleteMeeting(meetingId)
        setMeetings((prev) => prev.filter((m) => m.id !== meetingId))
      }
    }
    window.addEventListener('hub:meeting-update', handleMeetingUpdate)
    return () => window.removeEventListener('hub:meeting-update', handleMeetingUpdate)
  }, [activeProject])

  useEffect(() => {
    let hideTimer
    let peerBroadcastTimer
    const unsubMsg = on(P2P_EVENTS.MESSAGE, ({ data }) => {
      if (data?.type !== 'TASK_SYNC') return
      const incomingGeneralTasks = (data.tasks ?? []).filter((t) =>
        t &&
        t.calendarType === 'general' &&
        (!activeProject?.id ||
          !t.projectId ||
          t.projectId === activeProject.id),
      )
      if (incomingGeneralTasks.length === 0) return
      setSyncNotice(true)
      window.clearTimeout(hideTimer)
      hideTimer = window.setTimeout(() => setSyncNotice(false), 3200)
      setTasks((prev) => {
        const next = mergeTasksFromSync(prev, data.tasks, activeProject)
        void saveTasks(next)
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
  }, [broadcastTasks, activeProject])

  const filteredTasks = useMemo(() => {
    let list = Array.isArray(tasks) ? tasks : []

    // Filter by active project
    if (activeProject) {
      list = list.filter(
        (t) => t.projectId === activeProject.id || !t.projectId,
      )
    }

    // Filter by calendar selection
    if (activeCalendar === 'general') {
      return list.filter((task) => task.calendarType === 'general')
    }

    if (activeCalendar === 'personal') {
      return list.filter((task) => task.calendarType !== 'general')
    }

    // Custom calendar
    return list.filter((task) => task.calendarId === activeCalendar)
  }, [tasks, activeCalendar, activeProject])

  const addCalendar = () => {
    const name = newCalendarName.trim()
    if (!name) return
    const newCal = {
      id: `custom_${Date.now()}`,
      name,
      color: CALENDAR_COLORS[customCalendars.length % CALENDAR_COLORS.length],
    }
    setCustomCalendars((prev) => [...prev, newCal])
    setActiveCalendar(newCal.id)
    setNewCalendarName('')
    setShowNewCalendarInput(false)
  }

  const deleteCalendar = (id) => {
    setCustomCalendars((prev) => prev.filter((c) => c.id !== id))
    if (activeCalendar === id) setActiveCalendar('general')
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
      if (
        !activeProject ||
        !meeting.projectId ||
        meeting.projectId === activeProject.id ||
        !meeting.projectId
      ) {
        if (activeCalendar === 'general')
          return meeting.calendarType === 'general'
        if (activeCalendar === 'personal')
          return (
            meeting.calendarType === 'personal' ||
            meeting.calendarType !== 'general'
          )
        return (
          meeting.calendarId === activeCalendar ||
          meeting.calendarType === activeCalendar
        )
      }
      return false
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
  }, [meetings, activeCalendar, activeProject])

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
    const calendarType =
      payload?.calendarType === 'general' ? 'general' : 'personal'
    setTasks((prev) => {
      const next = [
        {
          id: createId(),
          status: 'todo',
          createdAt: now,
          projectId: activeProject?.id || null,
          teamId: activeTeam?.id || null,
          ...payload,
          calendarType,
        },
        ...(Array.isArray(prev) ? prev : []),
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

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight text-[rgb(var(--zc-text))] sm:text-3xl">
        {t('page_calendar_title')}
      </h1>
      {activeProject ? (
        <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-indigo-500/15 px-3 py-1">
          <span
            className={`h-2 w-2 rounded-full ${activeProject.color}`}
          />
          <span className="text-xs font-medium text-indigo-300">
            {activeProject.name}
          </span>
        </div>
      ) : null}
      <p className="mt-2 text-sm text-[rgb(var(--zc-muted))] sm:text-base">
        {t('page_calendar_subtitle')}
      </p>
      {syncNotice ? (
        <p
          className="mt-3 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
          role="status"
        >
          {t('sync_received')}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
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

      <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-start">
        <aside className="shrink-0 rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.25)] p-3 lg:w-56">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--zc-muted2))]">
            {t('cal_sidebar_calendars')}
          </p>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setActiveCalendar('general')}
              className={[
                'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium transition',
                activeCalendar === 'general'
                  ? 'bg-[rgb(var(--zc-border)/0.5)] text-[rgb(var(--zc-text))]'
                  : 'text-[rgb(var(--zc-muted))] hover:bg-[rgb(var(--zc-border)/0.35)]',
              ].join(' ')}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full bg-indigo-500"
                aria-hidden="true"
              />
              {t('cal_calendar_general')}
            </button>

            <button
              type="button"
              onClick={() => setActiveCalendar('personal')}
              className={[
                'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium transition',
                activeCalendar === 'personal'
                  ? 'bg-[rgb(var(--zc-border)/0.5)] text-[rgb(var(--zc-text))]'
                  : 'text-[rgb(var(--zc-muted))] hover:bg-[rgb(var(--zc-border)/0.35)]',
              ].join(' ')}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500"
                aria-hidden="true"
              />
              {t('cal_calendar_personal')}
            </button>

            {customCalendars.map((cal) => (
              <div key={cal.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveCalendar(cal.id)}
                  className={[
                    'flex flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium transition',
                    activeCalendar === cal.id
                      ? 'bg-[rgb(var(--zc-border)/0.5)] text-[rgb(var(--zc-text))]'
                      : 'text-[rgb(var(--zc-muted))] hover:bg-[rgb(var(--zc-border)/0.35)]',
                  ].join(' ')}
                >
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${cal.color}`}
                    aria-hidden="true"
                  />
                  <span className="truncate">{cal.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteCalendar(cal.id)}
                  className="hidden h-5 w-5 items-center justify-center rounded text-xs text-[rgb(var(--zc-subtle))] hover:bg-rose-500/10 hover:text-rose-400 group-hover:flex"
                  aria-label={t('cal_remove_calendar')}
                >
                  ✕
                </button>
              </div>
            ))}

            <div className="mt-2 border-t border-[rgb(var(--zc-border))] pt-2">
              {showNewCalendarInput ? (
                <div className="flex flex-col gap-1.5">
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
                    className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 py-1.5 text-xs text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                  />
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={addCalendar}
                      className="flex-1 rounded-md bg-indigo-500/20 px-2 py-1 text-xs font-medium text-indigo-300 hover:bg-indigo-500/30"
                    >
                      {t('cal_add')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewCalendarInput(false)
                        setNewCalendarName('')
                      }}
                      className="flex-1 rounded-md bg-[rgb(var(--zc-border)/0.5)] px-2 py-1 text-xs text-[rgb(var(--zc-muted))] hover:bg-[rgb(var(--zc-border))]"
                    >
                      {t('btn_cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowNewCalendarInput(true)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-medium text-[rgb(var(--zc-muted2))] transition hover:bg-[rgb(var(--zc-border)/0.35)] hover:text-[rgb(var(--zc-text))]"
                >
                  <span className="text-base leading-none">+</span>
                  {t('cal_new_calendar')}
                </button>
              )}
            </div>
          </div>
        </aside>

        <div
          className={[
            'min-w-0 flex-1 transition-[margin] duration-200 ease-out',
            isDayOpen ? 'lg:mr-80' : '',
          ].join(' ')}
        >
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
        customCalendars={customCalendars}
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
        customCalendars={customCalendars}
        initialEdit={detailInitialEdit}
      />
    </section>
  )
}
