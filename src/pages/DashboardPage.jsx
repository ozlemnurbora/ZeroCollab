import { useEffect, useMemo, useState } from 'react'
import { ASSIGNEES } from '../components/kanban/kanbanConstants.js'
import { loadTasks } from '../components/kanban/taskStorage.js'
import {
  Line,
  LineChart,
  Pie,
  PieChart,
  Bar,
  BarChart,
  Cell,
  Tooltip,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Legend,
} from 'recharts'

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

    const todo = tasks.filter((t) => t.status !== 'in_progress' && t.status !== 'done')
      .length

    const createdByDay = new Map()
    const completedByDay = new Map()

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      createdByDay.set(key, 0)
      completedByDay.set(key, 0)
    }

    for (const t of tasks) {
      if (t.createdAt) {
        const d = new Date(t.createdAt)
        d.setHours(0, 0, 0, 0)
        const key = d.toISOString().slice(0, 10)
        if (createdByDay.has(key)) {
          createdByDay.set(key, createdByDay.get(key) + 1)
        }
      }
      if (t.status === 'done' && t.completedAt) {
        const d = new Date(t.completedAt)
        d.setHours(0, 0, 0, 0)
        const key = d.toISOString().slice(0, 10)
        if (completedByDay.has(key)) {
          completedByDay.set(key, completedByDay.get(key) + 1)
        }
      }
    }

    const weeklyActivity = Array.from(createdByDay.keys()).map((key) => {
      const d = new Date(key)
      const label = `${d.getMonth() + 1}/${d.getDate()}`
      return {
        date: label,
        created: createdByDay.get(key) ?? 0,
        completed: completedByDay.get(key) ?? 0,
      }
    })

    const progressPct = total === 0 ? 0 : Math.round((done / total) * 100)

    return {
      total,
      inProgress,
      done,
      recent,
      workload,
      statusPie: [
        { name: 'To Do', value: todo },
        { name: 'In Progress', value: inProgress },
        { name: 'Done', value: done },
      ],
      weeklyActivity,
      progressPct,
    }
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

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel
          title="Task Status"
          subtitle="Distribution across To Do, In Progress, and Done."
        >
          {stats.total === 0 ? (
            <EmptyState>No tasks yet to visualize.</EmptyState>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.statusPie}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                  >
                    {stats.statusPie.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={
                          entry.name === 'Done'
                            ? '#22c55e'
                            : entry.name === 'In Progress'
                              ? '#6366f1'
                              : '#4b5563'
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(15,23,42,0.95)',
                      border: '1px solid rgba(148,163,184,0.4)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel
          title="Team Workload (Chart)"
          subtitle="Tasks per team member as a horizontal bar chart."
        >
          {stats.total === 0 ? (
            <EmptyState>No tasks yet to visualize.</EmptyState>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.workload}
                  layout="vertical"
                  margin={{ top: 8, right: 16, bottom: 8, left: 32 }}
                >
                  <XAxis type="number" stroke="#9ca3af" />
                  <YAxis dataKey="name" type="category" stroke="#9ca3af" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(15,23,42,0.95)',
                      border: '1px solid rgba(148,163,184,0.4)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 4, 4]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel
          title="Weekly Activity"
          subtitle="Task creation and completion over the last 7 days."
        >
          {stats.weeklyActivity.length === 0 ? (
            <EmptyState>No recent activity to visualize.</EmptyState>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.weeklyActivity} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <XAxis dataKey="date" stroke="#9ca3af" />
                  <YAxis allowDecimals={false} stroke="#9ca3af" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(15,23,42,0.95)',
                      border: '1px solid rgba(148,163,184,0.4)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="created"
                    name="Created"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="completed"
                    name="Completed"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel
          title="Project Progress"
          subtitle="Overall completion percentage (Done / Total)."
        >
          {stats.total === 0 ? (
            <EmptyState>No tasks yet to visualize.</EmptyState>
          ) : (
            <div className="flex h-72 items-center justify-center">
              <div className="relative h-40 w-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Completed', value: stats.progressPct },
                        { name: 'Remaining', value: 100 - stats.progressPct },
                      ]}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      <Cell key="completed" fill="#22c55e" />
                      <Cell key="remaining" fill="#1e293b" />
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(15,23,42,0.95)',
                        border: '1px solid rgba(148,163,184,0.4)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-2xl font-semibold text-[rgb(var(--zc-text))]">
                    {stats.progressPct}%
                  </p>
                  <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">Complete</p>
                </div>
              </div>
            </div>
          )}
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

