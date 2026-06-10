import { useEffect, useMemo, useState } from 'react'
import {
  loadTasks,
  mergeTaskListsByIdPreferNewer,
  normalizeTaskForStorage,
} from '../components/kanban/taskStorage.js'
import { useLanguage } from '../utils/LanguageContext.jsx'
import { useWorkspace } from '../utils/WorkspaceContext.jsx'
import { useAuth } from '../utils/AuthContext.jsx'
import { ActiveProjectBadge } from '../components/common/ActiveProjectBadge.jsx'
import {
  calculateDashboardMetrics,
  buildDashboardMembers,
  getVisibleDashboardTasks,
} from '../utils/dashboard/dashboardTaskUtils.js'
import { fetchRemoteProjectTasks } from '../utils/taskRemoteStorage.js'
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

function statusPieColor(id) {
  if (id === 'done') return '#22c55e'
  if (id === 'in_progress') return '#6366f1'
  if (id === 'in_review') return '#a855f7'
  return '#4b5563'
}

export function DashboardPage() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const {
    activeProject,
    teams,
    memberProjectIds,
  } = useWorkspace()
  const [tasks, setTasks] = useState([])
  const [isLoadingTasks, setIsLoadingTasks] = useState(true)

  useEffect(() => {
    const ownerUserId = user?.id ?? null
    if (!ownerUserId) {
      setTasks([])
      setIsLoadingTasks(false)
      return
    }
    let cancelled = false
    const refresh = async () => {
      setIsLoadingTasks(true)
      const rawLocal = await loadTasks(ownerUserId)
      const localArr = Array.isArray(rawLocal) ? rawLocal : []

      const projectId = activeProject?.id ?? null
      let remote = []
      if (projectId) {
        try {
          remote = await fetchRemoteProjectTasks(projectId)
        } catch {
          remote = []
        }
      }

      const merged = mergeTaskListsByIdPreferNewer(
        localArr,
        Array.isArray(remote) ? remote : [],
      )
      const next = merged
        .map((t) => normalizeTaskForStorage(t, ownerUserId))
        .filter(Boolean)
      if (cancelled) return
      setTasks((prev) => {
        const a = JSON.stringify(Array.isArray(prev) ? prev : [])
        const b = JSON.stringify(Array.isArray(next) ? next : [])
        return a === b ? prev : next
      })
      setIsLoadingTasks(false)
    }
    void refresh()

    const onTasksChanged = (e) => {
      const owner = e?.detail?.ownerUserId ?? null
      if (owner && String(owner) !== String(ownerUserId)) return
      void refresh()
    }
    const onVis = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('zc-tasks-changed', onTasksChanged)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      window.removeEventListener('zc-tasks-changed', onTasksChanged)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [user?.id, activeProject?.id])

  const visibleTasks = useMemo(() => {
    return getVisibleDashboardTasks({
      rawTasks: tasks,
      memberProjectIds,
      currentUserId: user?.id ?? null,
      activeProjectId: activeProject?.id ?? null,
    })
  }, [tasks, memberProjectIds, user?.id, activeProject?.id])

  // (Debug logs removed to avoid noisy rerenders)

  const members = useMemo(() => {
    return buildDashboardMembers({ activeProject, teams, visibleTasks })
  }, [activeProject, teams, visibleTasks])

  const stats = useMemo(() => {
    const metrics = calculateDashboardMetrics({ visibleTasks })

    // Keep existing shape expected by the UI below.
    const statusPie = [
      { id: 'todo', name: t('status_todo'), value: metrics.taskStatusCounts.todo },
      {
        id: 'in_progress',
        name: t('status_in_progress'),
        value: metrics.taskStatusCounts.in_progress,
      },
      {
        id: 'in_review',
        name: t('status_in_review'),
        value: metrics.taskStatusCounts.in_review,
      },
      { id: 'done', name: t('status_done'), value: metrics.taskStatusCounts.done },
    ]

    const projectProgressPie = [
      { id: 'completed', name: t('chart_completed'), value: metrics.completionPercent },
      { id: 'remaining', name: t('chart_remaining'), value: 100 - metrics.completionPercent },
    ]

    const countsByKey = new Map(
      (metrics.workloadByMember || []).map((x) => [x.key, x.count]),
    )
    const workload = (members || []).map((m) => ({
      name: m.display,
      count: countsByKey.get(m.key) ?? 0,
    }))

    const out = {
      total: metrics.totalTasks,
      inProgress: metrics.inProgressTasks,
      inReview: metrics.inReviewTasks,
      done: metrics.completedTasks,
      recent: metrics.recentTasks,
      workload,
      statusPie,
      projectProgressPie,
      weeklyActivity: metrics.weeklyActivity,
      progressPct: metrics.completionPercent,
    }

    console.log('[Dashboard Workload Debug]', {
      visibleTasks,
      members,
      workloadByMember: workload,
    })

    return out
  }, [visibleTasks, t, members, activeProject])

  const showStrictEmpty =
    (Array.isArray(memberProjectIds) ? memberProjectIds.length : 0) === 0 &&
    stats.total === 0

  return (
    <section>
      <h1 className="text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-600 sm:text-3xl">
        {t('page_dashboard_title')}
      </h1>
      <ActiveProjectBadge />

      <p className="mt-2 text-sm text-[rgb(var(--zc-muted))] sm:text-base">
        {t('page_dashboard_subtitle')}
      </p>

      {isLoadingTasks ? (
        <div className="mt-6 rounded-xl border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-6 text-sm text-[rgb(var(--zc-muted2))]">
          {t('loading_tasks')}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title={t('dash_total_tasks')}
          value={stats.total}
          helper={t('dash_total_tasks_help')}
          color="text-indigo-400"
          barColor="bg-indigo-500"
          barWidth={stats.total > 0 ? 100 : 0}
          borderAccent="border-l-4 border-l-indigo-500"
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
          borderAccent="border-l-4 border-l-amber-500"
        />
        <SummaryCard
          title={t('dash_completed')}
          value={stats.done}
          helper={t('dash_completed_help')}
          color="text-emerald-400"
          barColor="bg-emerald-500"
          barWidth={stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0}
          borderAccent="border-l-4 border-l-emerald-500"
        />
        <SummaryCard
          title={t('dash_team_members')}
          value={members.length}
          helper={members.map((m) => m.display).join(', ') || t('dash_no_members')}
          color="text-violet-400"
          borderAccent="border-l-4 border-l-violet-500"
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel title={t('dash_recent_tasks')} subtitle={t('dash_recent_tasks_sub')}>
          {stats.recent.length === 0 ? (
            <EmptyState>
              {showStrictEmpty
                ? '📊 No tasks yet — create your first task to see analytics here.'
                : t('dash_empty_recent')}
            </EmptyState>
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
          {stats.workload.length === 0 ? (
            <EmptyState>
              {showStrictEmpty ? 'No workload data available.' : t('dash_no_members')}
            </EmptyState>
          ) : (
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
          )}
        </Panel>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel
          title={t('dash_task_status')}
          subtitle={t('dash_task_status_sub')}
          titleClassName="text-indigo-300"
        >
          {stats.total === 0 ? (
            <EmptyState>📊 No tasks yet — create your first task to see analytics here.</EmptyState>
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
          titleClassName="text-emerald-300"
        >
          {stats.total === 0 ? (
            <EmptyState>📊 No tasks yet — create your first task to see analytics here.</EmptyState>
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
          title={t('dash_weekly_activity')}
          subtitle={t('dash_weekly_activity_sub')}
          titleClassName="text-violet-300"
        >
          {stats.weeklyActivity.length === 0 ? (
            <EmptyState>
              {stats.total === 0
                ? '📊 No tasks yet — create your first task to see analytics here.'
                : t('dash_empty_activity')}
            </EmptyState>
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
            <EmptyState>📊 No tasks yet — create your first task to see analytics here.</EmptyState>
          ) : (
            <div className="flex h-72 flex-col items-center justify-center gap-4">
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
              <div className="flex items-center gap-4 text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#22c55e' }} />
                  <span className="text-[rgb(var(--zc-subtle))]">{t('chart_completed')}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#1e293b' }} />
                  <span className="text-[rgb(var(--zc-subtle))]">{t('chart_remaining')}</span>
                </span>
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
  borderAccent = '',
}) {
  return (
    <div
      className={`rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)] p-4 ${borderAccent}`}
    >
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

function Panel({ title, subtitle, children, titleClassName = 'text-[rgb(var(--zc-text))]' }) {
  return (
    <section className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)]">
      <header className="border-b border-[rgb(var(--zc-border))] px-4 py-3">
        <h2 className={`text-sm font-semibold ${titleClassName}`}>{title}</h2>
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
        : status === 'in_review'
          ? t('status_in_review')
        : t('status_todo')

  const classes =
    status === 'done'
      ? 'bg-emerald-500/10 text-emerald-200 ring-emerald-500/30'
      : status === 'in_progress'
        ? 'bg-indigo-500/10 text-indigo-200 ring-indigo-500/30'
        : status === 'in_review'
          ? 'bg-violet-500/10 text-violet-200 ring-violet-500/30'
        : 'bg-[rgb(var(--zc-panel)/0.5)] text-[rgb(var(--zc-muted))] ring-[rgb(var(--zc-border))]'

  return (
    <span
      className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium ring-1 ring-inset ${classes}`}
    >
      {label}
    </span>
  )
}
