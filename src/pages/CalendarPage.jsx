import { useEffect, useMemo, useState } from 'react'
import { MonthlyCalendar } from '../components/calendar/MonthlyCalendar.jsx'
import { DayTasksModal } from '../components/calendar/DayTasksModal.jsx'
import { AddTaskModal } from '../components/kanban/AddTaskModal.jsx'
import { loadTasks, saveTasks } from '../components/kanban/taskStorage.js'
import { toISODate } from '../components/calendar/calendarDateUtils.js'
import { useLanguage } from '../utils/LanguageContext.jsx'

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID)
    return crypto.randomUUID()
  return `task_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function CalendarPage() {
  const { t } = useLanguage()
  const [tasks, setTasks] = useState([])
  const [isLoadingTasks, setIsLoadingTasks] = useState(true)
  const [hasLoadedTasks, setHasLoadedTasks] = useState(false)
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedISODate, setSelectedISODate] = useState(() => toISODate(new Date()))
  const [isDayOpen, setIsDayOpen] = useState(false)
  const [isAddOpen, setIsAddOpen] = useState(false)

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

  const tasksByISODate = useMemo(() => {
    const map = new Map()
    for (const task of Array.isArray(tasks) ? tasks : []) {
      if (!task.dueDate) continue
      const list = map.get(task.dueDate) ?? []
      list.push(task)
      map.set(task.dueDate, list)
    }
    for (const [, list] of map.entries()) {
      list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    }
    return map
  }, [tasks])

  const selectedTasks = tasksByISODate.get(selectedISODate) ?? []

  const createTask = (payload) => {
    const now = Date.now()
    setTasks((prev) => [
      {
        id: createId(),
        status: 'todo',
        createdAt: now,
        ...payload,
      },
      ...(Array.isArray(prev) ? prev : []),
    ])
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight text-[rgb(var(--zc-text))] sm:text-3xl">
        {t('page_calendar_title')}
      </h1>
      <p className="mt-2 text-sm text-[rgb(var(--zc-muted))] sm:text-base">
        {t('page_calendar_subtitle')}
      </p>

      <div className="mt-6">
        {isLoadingTasks ? (
          <div className="rounded-xl border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-6 text-sm text-[rgb(var(--zc-muted2))]">
            {t('loading_tasks')}
          </div>
        ) : (
          <MonthlyCalendar
            viewDate={viewDate}
            onChangeViewDate={setViewDate}
            selectedISODate={selectedISODate}
            onSelectISODate={(iso) => {
              setSelectedISODate(iso)
              setIsDayOpen(true)
            }}
            tasksByISODate={tasksByISODate}
          />
        )}
      </div>

      <DayTasksModal
        open={isDayOpen}
        onClose={() => setIsDayOpen(false)}
        isoDate={selectedISODate}
        tasks={selectedTasks}
        onAdd={() => {
          setIsDayOpen(false)
          setIsAddOpen(true)
        }}
      />

      <AddTaskModal
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onCreate={createTask}
        initialValues={{ dueDate: selectedISODate }}
      />
    </section>
  )
}
