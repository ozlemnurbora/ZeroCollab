import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MonthlyCalendar } from '../components/calendar/MonthlyCalendar.jsx'
import { DayTasksModal } from '../components/calendar/DayTasksModal.jsx'
import { AddTaskModal } from '../components/kanban/AddTaskModal.jsx'
import { loadTasks, saveTasks } from '../components/kanban/taskStorage.js'
import {
  addDaysCalendar,
  parseISODateLocal,
  toISODate,
} from '../components/calendar/calendarDateUtils.js'
import { getCurrentUser } from '../components/settings/settingsStorage.js'
import { Button } from '../components/ui/Button.jsx'
import { useLanguage } from '../utils/LanguageContext.jsx'
import { on, sendToAllPeers, P2P_EVENTS } from '../utils/p2pManager.js'
import { mergeTasksFromSync, tasksForP2PBroadcast } from '../utils/taskP2PSync.js'

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID)
    return crypto.randomUUID()
  return `task_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

/** Stored tasks without `calendarType` are treated as personal. */
function taskCalendarType(task) {
  return task?.calendarType === 'general' ? 'general' : 'personal'
}

export function CalendarPage() {
  const { t } = useLanguage()
  const [tasks, setTasks] = useState([])
  const [currentUserName, setCurrentUserName] = useState('')
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
  const [syncNotice, setSyncNotice] = useState(false)
  const tasksRef = useRef(tasks)

  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])

  const broadcastTasks = useCallback((updatedTasks) => {
    const generalTasks = tasksForP2PBroadcast(updatedTasks)
    if (generalTasks.length === 0) return
    sendToAllPeers({
      type: 'TASK_SYNC',
      tasks: generalTasks,
    })
  }, [])

  useEffect(() => {
    void getCurrentUser().then(setCurrentUserName)
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
      setTasks(Array.isArray(existing) ? existing : [])
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

  const filteredTasks = useMemo(() => {
    const list = Array.isArray(tasks) ? tasks : []
    if (activeCalendar === 'general') {
      return list.filter((task) => taskCalendarType(task) === 'general')
    }
    const u = currentUserName.trim()
    if (!u) return []
    return list.filter(
      (task) =>
        taskCalendarType(task) === 'personal' && (task.assignee || '') === u,
    )
  }, [tasks, activeCalendar, currentUserName])

  const tasksByISODate = useMemo(() => {
    const map = new Map()
    for (const task of filteredTasks) {
      if (!task.dueDate) continue
      const list = map.get(task.dueDate) ?? []
      list.push(task)
      map.set(task.dueDate, list)
    }
    for (const [, list] of map.entries()) {
      list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    }
    return map
  }, [filteredTasks])

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
          ...payload,
          calendarType,
        },
        ...(Array.isArray(prev) ? prev : []),
      ]
      broadcastTasks(next)
      return next
    })
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight text-[rgb(var(--zc-text))] sm:text-3xl">
        {t('page_calendar_title')}
      </h1>
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
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-indigo-500" aria-hidden="true" />
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
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
              {t('cal_calendar_personal')}
            </button>
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
        onAdd={() => setIsAddOpen(true)}
      />

      <AddTaskModal
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onCreate={createTask}
        initialValues={{
          dueDate: selectedISODate,
          calendarType: activeCalendar,
        }}
      />
    </section>
  )
}
