import { useEffect, useMemo, useState } from 'react'
import { MonthlyCalendar } from '../components/calendar/MonthlyCalendar.jsx'
import { DayTasksModal } from '../components/calendar/DayTasksModal.jsx'
import { AddTaskModal } from '../components/kanban/AddTaskModal.jsx'
import { loadTasks, saveTasks } from '../components/kanban/taskStorage.js'
import { toISODate } from '../components/calendar/calendarDateUtils.js'

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID)
    return crypto.randomUUID()
  return `task_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function CalendarPage() {
  const [tasks, setTasks] = useState(() => loadTasks())
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedISODate, setSelectedISODate] = useState(() => toISODate(new Date()))
  const [isDayOpen, setIsDayOpen] = useState(false)
  const [isAddOpen, setIsAddOpen] = useState(false)

  useEffect(() => {
    saveTasks(tasks)
  }, [tasks])

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key && e.key.includes('zerocollab.tasks')) {
        setTasks(loadTasks())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const tasksByISODate = useMemo(() => {
    const map = new Map()
    for (const t of tasks) {
      if (!t.dueDate) continue
      const list = map.get(t.dueDate) ?? []
      list.push(t)
      map.set(t.dueDate, list)
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
      ...prev,
    ])
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight text-[rgb(var(--zc-text))] sm:text-3xl">
        Calendar
      </h1>
      <p className="mt-2 text-sm text-[rgb(var(--zc-muted))] sm:text-base">
        Monthly view of upcoming due dates. Click a day to see tasks and add new ones.
      </p>

      <div className="mt-6">
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

