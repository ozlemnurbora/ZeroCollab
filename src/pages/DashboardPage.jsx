import { useEffect, useMemo, useState } from 'react'
import { loadTasks } from '../components/kanban/taskStorage.js'
import { useLanguage } from '../utils/LanguageContext.jsx'
import { useWorkspace } from '../utils/WorkspaceContext.jsx'
import { useAuth } from '../utils/AuthContext.jsx'
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
import { Button } from '../components/ui/Button.jsx'
import { SprintCreationModal } from '../components/workspace/SprintCreationModal.jsx'

function statusPieColor(id) {
  if (id === 'done') return '#22c55e'
  if (id === 'in_progress') return '#6366f1'
  return '#4b5563'
}

export function DashboardPage() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const {
    activeProject,
    teams,
    activeSprint,
    createProjectSprint,
    completeProjectSprint,
  } = useWorkspace()
  const [tasks, setTasks] = useState([])
  const [isLoadingTasks, setIsLoadingTasks] = useState(true)
  const [createSprintOpen, setCreateSprintOpen] = useState(false)
  const [sprintActionError, setSprintActionError] = useState('')

  const memberNameFromAny = (member) =>
    typeof member === 'string'
      ? member
      : member?.name || member?.email || 'Unknown'

  useEffect(() => {
    const ownerUserId = user?.id ?? null
    if (!ownerUserId) {
      setTasks([])
      setIsLoadingTasks(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setIsLoadingTasks(true)
      const next = await loadTasks(ownerUserId)
      if (cancelled) return
      setTasks(Array.isArray(next) ? next : [])
      setIsLoadingTasks(false)
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const visibleTasks = useMemo(() => {
    if (!activeProject) return tasks
    return tasks.filter(
      (t) => t.projectId === activeProject.id || !t.projectId,
    )
  }, [tasks, activeProject])

  const projectMembers = useMemo(() => {
    if (!activeProject || !teams || teams.length === 0) {
      const assignees = new Set()
      tasks.forEach((task) => {
        if (task.assignee) assignees.add(task.assignee)
      })
      return Array.from(assignees)
    }

    const projectTeamIds = activeProject.teamIds || []
    const projectTeams = teams.filter((team) => projectTeamIds.includes(team.id))

    const members = new Set()
    projectTeams.forEach((team) => {
      ;(team.members || []).forEach((member) =>
        members.add(memberNameFromAny(member)),
      )
    })

    if (members.size === 0) {
      tasks.forEach((task) => {
        if (task.assignee) members.add(task.assignee)
      })
    }

    return Array.from(members)
  }, [activeProject, teams, tasks])

  const stats = useMemo(() => {
    const total = visibleTasks.length
    const inProgress = visibleTasks.filter((task) => task.status === 'in_progress').length
    const done = visibleTasks.filter((task) => task.status === 'done').length

    const recent = [...visibleTasks]
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .slice(0, 5)

    const workload = projectMembers.map((name) => ({
      name,
      count: visibleTasks.filter((task) => task.assignee === name).length,
    }))

    const todo = visibleTasks.filter(
      (task) => task.status !== 'in_progress' && task.status !== 'done',
    ).length

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

    for (const task of visibleTasks) {
      if (task.createdAt) {
        const d = new Date(task.createdAt)
        d.setHours(0, 0, 0, 0)
        const key = d.toISOString().slice(0, 10)
        if (createdByDay.has(key)) {
          createdByDay.set(key, createdByDay.get(key) + 1)
        }
      }
      if (task.status === 'done' && task.completedAt) {
        const d = new Date(task.completedAt)
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

    const statusPie = [
      { id: 'todo', name: t('status_todo'), value: todo },
      { id: 'in_progress', name: t('status_in_progress'), value: inProgress },
      { id: 'done', name: t('status_done'), value: done },
    ]

    const projectProgressPie = [
      { id: 'completed', name: t('chart_completed'), value: progressPct },
      { id: 'remaining', name: t('chart_remaining'), value: 100 - progressPct },
    ]

    return {
      total,
      inProgress,
      done,
      recent,
      workload,
      statusPie,
      projectProgressPie,
      weeklyActivity,
      progressPct,
    }
  }, [visibleTasks, t, projectMembers])

  const sprintDateRange = useMemo(() => {
    if (!activeSprint?.start_date || !activeSprint?.end_date) return ''
    const start = new Date(activeSprint.start_date)
    const end = new Date(activeSprint.end_date)
    const fmt = (d) =>
      d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    return `${fmt(start)} → ${fmt(end)}`
  }, [activeSprint])

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight text-[rgb(var(--zc-text))] sm:text-3xl">
        {t('page_dashboard_title')}
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
        {t('page_dashboard_subtitle')}
      </p>

      {isLoadingTasks ? (
        <div className="mt-6 rounded-xl border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-6 text-sm text-[rgb(var(--zc-muted2))]">
          {t('loading_tasks')}
        </div>
      ) : null}

      <div className="mt-6">
        <Panel title="Active Sprint" subtitle="Current sprint details">
          {activeSprint ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-[rgb(var(--zc-text))]">
                Sprint {activeSprint.sprint_number}
              </p>
              <p className="text-sm text-[rgb(var(--zc-muted))]">
                Goal: {activeSprint.sprint_goal || '—'}
              </p>
              <p className="text-sm text-[rgb(var(--zc-muted))]">{sprintDateRange}</p>
              <p className="text-sm text-[rgb(var(--zc-muted))]">
                Duration: {activeSprint.duration_weeks} week
                {activeSprint.duration_weeks > 1 ? 's' : ''}
              </p>
              <p className="text-sm text-[rgb(var(--zc-muted))]">
                Status: {activeSprint.status === 'active' ? 'Active' : 'Completed'}
              </p>
              {sprintActionError ? (
                <p className="text-xs text-rose-400">{sprintActionError}</p>
              ) : null}
              <div className="pt-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSprintActionError('')
                    void completeProjectSprint(activeSprint.id).catch((err) =>
                      setSprintActionError(err?.message || 'Failed to complete sprint.'),
                    )
                  }}
                >
                  Complete Sprint
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-[rgb(var(--zc-muted2))]">No active sprint</p>
              {sprintActionError ? (
                <p className="text-xs text-rose-400">{sprintActionError}</p>
              ) : null}
              <Button
                onClick={() => {
                  setSprintActionError('')
                  setCreateSprintOpen(true)
                }}
                disabled={!activeProject}
              >
                Create Sprint
              </Button>
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title={t('dash_total_tasks')}
          value={stats.total}
          helper={t('dash_total_tasks_help')}
          color="text-indigo-400"
          barColor="bg-indigo-500"
          barWidth={stats.total > 0 ? 100 : 0}
        />
        <SummaryCard
          title={t('dash_in_progress')}
          value={stats.inProgress}
          helper={t('dash_in_progress_help')}
          color="text-amber-400"
          barColor="bg-amber-500"
          barWidth={
            stats.total > 0
              ? Math.round((stats.inProgress / stats.total) * 100)
              : 0
          }
        />
        <SummaryCard
          title={t('dash_completed')}
          value={stats.done}
          helper={t('dash_completed_help')}
          color="text-emerald-400"
          barColor="bg-emerald-500"
          barWidth={stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0}
        />
        <SummaryCard
          title={t('dash_team_members')}
          value={projectMembers.length}
          helper={projectMembers.join(', ') || t('dash_no_members')}
          color="text-violet-400"
        />
      </div>

      <SprintCreationModal
        open={createSprintOpen}
        onClose={() => setCreateSprintOpen(false)}
        onCreate={async (payload) => {
          try {
            await createProjectSprint(payload)
            setSprintActionError('')
          } catch (err) {
            const message =
              err?.message || 'Only one active sprint is allowed per project.'
            setSprintActionError(message)
            throw err
          }
        }}
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel title={t('dash_recent_tasks')} subtitle={t('dash_recent_tasks_sub')}>
          {stats.recent.length === 0 ? (
            <EmptyState>{t('dash_empty_recent')}</EmptyState>
          ) : (
            <ul className="divide-y divide-[rgb(var(--zc-border))]">
              {stats.recent.map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[rgb(var(--zc-text))]">
                      {task.title}
                    </p>
                    <p className="mt-1 text-xs text-[rgb(var(--zc-muted2))]">
                      {task.assignee
                        ? `${t('dash_assignee')}: ${task.assignee}`
                        : t('dash_unassigned')}
                      {task.dueDate ? ` • ${t('dash_due')}: ${task.dueDate}` : ''}
                    </p>
                  </div>
                  <StatusPill status={task.status} t={t} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={t('dash_team_workload')} subtitle={t('dash_team_workload_sub')}>
          <ul className="space-y-3">
            {stats.workload.map((m) => (
              <li
                key={m.name}
                className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.4)] p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-[rgb(var(--zc-text))]">{m.name}</p>
                  <span className="rounded-md bg-[rgb(var(--zc-bg)/0.4)] px-2 py-1 text-xs text-[rgb(var(--zc-muted))] ring-1 ring-inset ring-[rgb(var(--zc-border))]">
                    {m.count}{' '}
                    {m.count === 1 ? t('dash_task_one') : t('dash_task_many')}
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
        <Panel title={t('dash_task_status')} subtitle={t('dash_task_status_sub')}>
          {stats.total === 0 ? (
            <EmptyState>{t('dash_empty_viz')}</EmptyState>
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
                      <Cell key={entry.id} fill={statusPieColor(entry.id)} />
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
          title={t('dash_team_workload_chart')}
          subtitle={t('dash_team_workload_chart_sub')}
        >
          {stats.total === 0 ? (
            <EmptyState>{t('dash_empty_viz')}</EmptyState>
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
        <Panel title={t('dash_weekly_activity')} subtitle={t('dash_weekly_activity_sub')}>
          {stats.weeklyActivity.length === 0 ? (
            <EmptyState>{t('dash_empty_activity')}</EmptyState>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={stats.weeklyActivity}
                  margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
                >
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
                    name={t('chart_created')}
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="completed"
                    name={t('chart_completed')}
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

        <Panel title={t('dash_project_progress')} subtitle={t('dash_project_progress_sub')}>
          {stats.total === 0 ? (
            <EmptyState>{t('dash_empty_viz')}</EmptyState>
          ) : (
            <div className="flex h-72 items-center justify-center">
              <div className="relative h-40 w-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.projectProgressPie}
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
                  <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                    {t('dash_complete_label')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </section>
  )
}

function SummaryCard({
  title,
  value,
  helper,
  color = 'text-[rgb(var(--zc-text))]',
  barColor = '',
  barWidth = 0,
}) {
  return (
    <div className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)] p-4">
      <p className="text-sm font-medium text-[rgb(var(--zc-muted))]">{title}</p>
      <p className={`mt-2 text-3xl font-semibold tracking-tight ${color}`}>{value}</p>
      <p className="mt-2 text-xs text-[rgb(var(--zc-subtle))]">{helper}</p>
      {barColor && (
        <div className="mt-3 h-1 w-full rounded-full bg-[rgb(var(--zc-border))]">
          <div
            className={`h-1 rounded-full transition-all ${barColor}`}
            style={{ width: `${Math.min(barWidth, 100)}%` }}
          />
        </div>
      )}
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

function StatusPill({ status, t }) {
  const label =
    status === 'done'
      ? t('status_done')
      : status === 'in_progress'
        ? t('status_in_progress')
        : t('status_todo')

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
