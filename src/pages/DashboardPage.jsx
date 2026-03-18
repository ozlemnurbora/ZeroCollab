import { useEffect, useMemo, useState } from 'react'
import { ASSIGNEES } from '../components/kanban/kanbanConstants.js'
import { loadTasks } from '../components/kanban/taskStorage.js'

export function DashboardPage() {
  const [tasks, setTasks] = useState([])
  const [isLoadingTasks, setIsLoadingTasks] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setIsLoadingTasks(true)
      const next = await loadTasks()
      if (cancelled) return
      setTasks(Array.isArray(next) ? next : [])
      setIsLoadingTasks(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const stats = useMemo(() => {
    const total = tasks.length
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length
    const done = tasks.filter((t) => t.status === 'done').length

    const recent = [...tasks]
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .slice(0, 5)

    const workload = ASSIGNEES.map((name) => ({
      name,
      count: tasks.filter((t) => t.assignee === name).length,
    }))

    return { total, inProgress, done, recent, workload }
  }, [tasks])

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight text-[rgb(var(--zc-text))] sm:text-3xl">
        Dashboard
      </h1>

      <p className="mt-2 text-sm text-[rgb(var(--zc-muted))] sm:text-base">
        Project overview and team activity, powered by your Tasks board.
      </p>

      {isLoadingTasks ? (
        <div className="mt-6 rounded-xl border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-6 text-sm text-[rgb(var(--zc-muted2))]">
          Loading tasks…
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Total Tasks"
          value={stats.total}
          helper="All tasks in your board"
        />
        <SummaryCard
          title="Tasks In Progress"
          value={stats.inProgress}
          helper="Currently being worked on"
        />
        <SummaryCard
          title="Tasks Completed"
          value={stats.done}
          helper="Marked as done"
        />
        <SummaryCard
          title="Team Members"
          value={ASSIGNEES.length}
          helper={ASSIGNEES.join(', ')}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel title="Recent Tasks" subtitle="Last 5 tasks added">
          {stats.recent.length === 0 ? (
            <EmptyState>
              No tasks yet. Add your first task in the Tasks board.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-[rgb(var(--zc-border))]">
              {stats.recent.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[rgb(var(--zc-text))]">
                      {t.title}
                    </p>
                    <p className="mt-1 text-xs text-[rgb(var(--zc-muted2))]">
                      {t.assignee ? `Assignee: ${t.assignee}` : 'Unassigned'}
                      {t.dueDate ? ` • Due: ${t.dueDate}` : ''}
                    </p>
                  </div>
                  <StatusPill status={t.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Team Workload" subtitle="Tasks per team member">
          <ul className="space-y-3">
            {stats.workload.map((m) => (
              <li
                key={m.name}
                className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.4)] p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-[rgb(var(--zc-text))]">{m.name}</p>
                  <span className="rounded-md bg-[rgb(var(--zc-bg)/0.4)] px-2 py-1 text-xs text-[rgb(var(--zc-muted))] ring-1 ring-inset ring-[rgb(var(--zc-border))]">
                    {m.count} task{m.count === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--zc-panel))] ring-1 ring-inset ring-[rgb(var(--zc-border))]">
                  <div
                    className="h-full rounded-full bg-indigo-500/70"
                    style={{
                      width:
                        stats.total === 0
                          ? '0%'
                          : `${Math.round((m.count / stats.total) * 100)}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </section>
  )
}

function SummaryCard({ title, value, helper }) {
  return (
    <div className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)] p-4">
      <p className="text-sm font-medium text-[rgb(var(--zc-muted))]">{title}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-[rgb(var(--zc-text))]">
        {value}
      </p>
      <p className="mt-2 text-xs text-[rgb(var(--zc-subtle))]">{helper}</p>
    </div>
  )
}

function Panel({ title, subtitle, children }) {
  return (
    <section className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)]">
      <header className="border-b border-[rgb(var(--zc-border))] px-4 py-3">
        <h2 className="text-sm font-semibold text-[rgb(var(--zc-text))]">{title}</h2>
        <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">{subtitle}</p>
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  )
}

function EmptyState({ children }) {
  return (
    <div className="rounded-lg border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] p-4 text-sm text-[rgb(var(--zc-muted2))]">
      {children}
    </div>
  )
}

function StatusPill({ status }) {
  const label =
    status === 'done' ? 'Done' : status === 'in_progress' ? 'In Progress' : 'To Do'

  const classes =
    status === 'done'
      ? 'bg-emerald-500/10 text-emerald-200 ring-emerald-500/30'
      : status === 'in_progress'
        ? 'bg-indigo-500/10 text-indigo-200 ring-indigo-500/30'
        : 'bg-[rgb(var(--zc-panel)/0.5)] text-[rgb(var(--zc-muted))] ring-[rgb(var(--zc-border))]'

  return (
    <span
      className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium ring-1 ring-inset ${classes}`}
    >
      {label}
    </span>
  )
}

