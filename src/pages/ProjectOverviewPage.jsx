import { useEffect, useMemo, useState } from 'react'
import { loadTasks } from '../components/kanban/taskStorage.js'
import { useWorkspace } from '../utils/WorkspaceContext.jsx'
import { useAuth } from '../utils/AuthContext.jsx'

function fmtDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function ProjectOverviewPage() {
  const { user } = useAuth()
  const { activeProject, teams, activeSprint } = useWorkspace()
  const [tasks, setTasks] = useState([])

  useEffect(() => {
    if (!user?.id) {
      setTasks([])
      return
    }
    let cancelled = false
    void (async () => {
      const next = await loadTasks(user.id)
      if (!cancelled) setTasks(Array.isArray(next) ? next : [])
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const projectTasks = useMemo(() => {
    if (!activeProject?.id) return []
    return tasks.filter((t) => t.projectId === activeProject.id)
  }, [tasks, activeProject?.id])

  const progress = useMemo(() => {
    const total = projectTasks.length
    const completed = projectTasks.filter((t) => t.status === 'done').length
    const inProgress = projectTasks.filter((t) => t.status === 'in_progress').length
    const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0
    return { total, completed, inProgress, completionPct }
  }, [projectTasks])

  const assignedTeams = useMemo(() => {
    if (!activeProject?.teamIds?.length) return []
    return (teams || []).filter((team) => activeProject.teamIds.includes(team.id))
  }, [activeProject?.teamIds, teams])

  const projectAdmin = useMemo(() => {
    if (!activeProject?.projectMembers?.length) return '—'
    const owner = activeProject.projectMembers.find((m) => m.role === 'owner')
    return owner?.name || owner?.email || '—'
  }, [activeProject?.projectMembers])

  const projectManagers = useMemo(() => {
    const members = activeProject?.projectMembers || []
    const managers = members.filter((m) => m.customRole === 'project_manager')
    return managers.map((m) => m.name || m.email).filter(Boolean)
  }, [activeProject?.projectMembers])

  const remainingDays = useMemo(() => {
    if (!activeSprint?.end_date) return null
    const end = new Date(activeSprint.end_date)
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return diff
  }, [activeSprint?.end_date])

  if (!activeProject) {
    return (
      <section>
        <h1 className="text-2xl font-semibold text-[rgb(var(--zc-text))]">Project Overview</h1>
        <p className="mt-3 text-sm text-[rgb(var(--zc-muted2))]">
          Select an active project to view overview.
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold text-[rgb(var(--zc-text))]">Project Overview</h1>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)] p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold text-[rgb(var(--zc-text))]">Project Identity</h2>
          <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">High-level project context</p>

          <div className="mt-4">
            <p className="text-sm text-[rgb(var(--zc-muted))]">Project Name</p>
            <p className="text-lg font-semibold text-[rgb(var(--zc-text))]">{activeProject.name}</p>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] p-3">
              <p className="text-xs uppercase tracking-wide text-[rgb(var(--zc-subtle))]">Project Goal</p>
              <p className="mt-1 text-sm text-[rgb(var(--zc-text))]">{activeProject.goal || '—'}</p>
            </div>
            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] p-3">
              <p className="text-xs uppercase tracking-wide text-[rgb(var(--zc-subtle))]">Description</p>
              <p className="mt-1 text-sm text-[rgb(var(--zc-text))]">{activeProject.description || '—'}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] p-3">
              <p className="text-xs uppercase tracking-wide text-[rgb(var(--zc-subtle))]">Project Admin</p>
              <p className="mt-1 text-sm text-[rgb(var(--zc-text))]">{projectAdmin}</p>
            </div>
            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] p-3">
              <p className="text-xs uppercase tracking-wide text-[rgb(var(--zc-subtle))]">Project Managers</p>
              <p className="mt-1 text-sm text-[rgb(var(--zc-text))]">
                {projectManagers.length ? projectManagers.join(', ') : '—'}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)] p-5">
          <h2 className="text-lg font-semibold text-[rgb(var(--zc-text))]">Project Status</h2>
          <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">Lifecycle and schedule</p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-indigo-500/15 px-2.5 py-1 text-xs font-medium text-indigo-300">
              Phase: {activeProject.phase || 'planning'}
            </span>
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
              Status: {activeProject.status || 'active'}
            </span>
          </div>

          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2">
              <span className="text-[rgb(var(--zc-muted))]">Start Date</span>
              <span className="text-[rgb(var(--zc-text))]">{fmtDate(activeProject.startDate || activeProject.start_date)}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2">
              <span className="text-[rgb(var(--zc-muted))]">Target End Date</span>
              <span className="text-[rgb(var(--zc-text))]">{fmtDate(activeProject.targetEndDate || activeProject.target_end_date)}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2">
              <span className="text-[rgb(var(--zc-muted))]">Created At</span>
              <span className="text-[rgb(var(--zc-text))]">{fmtDate(activeProject.created_at)}</span>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)] p-5">
          <h2 className="text-lg font-semibold text-[rgb(var(--zc-text))]">Sprint Summary</h2>
          <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">Current delivery cycle</p>
          {activeSprint ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] p-3">
                <p className="text-xs uppercase tracking-wide text-[rgb(var(--zc-subtle))]">Active Sprint</p>
                <p className="mt-1 text-sm font-medium text-[rgb(var(--zc-text))]">
                  Sprint {activeSprint.sprint_number}
                </p>
              </div>
              <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] p-3">
                <p className="text-xs uppercase tracking-wide text-[rgb(var(--zc-subtle))]">Status</p>
                <p className="mt-1 text-sm font-medium text-[rgb(var(--zc-text))]">
                  {activeSprint.status}
                </p>
              </div>
              <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] p-3 sm:col-span-2">
                <p className="text-xs uppercase tracking-wide text-[rgb(var(--zc-subtle))]">Sprint Goal</p>
                <p className="mt-1 text-sm text-[rgb(var(--zc-text))]">
                  {activeSprint.sprint_goal || '—'}
                </p>
              </div>
              <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] p-3">
                <p className="text-xs uppercase tracking-wide text-[rgb(var(--zc-subtle))]">Dates</p>
                <p className="mt-1 text-sm text-[rgb(var(--zc-text))]">
                  {fmtDate(activeSprint.start_date)} → {fmtDate(activeSprint.end_date)}
                </p>
              </div>
              <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] p-3">
                <p className="text-xs uppercase tracking-wide text-[rgb(var(--zc-subtle))]">Remaining Days</p>
                <p className="mt-1 text-sm text-[rgb(var(--zc-text))]">
                  {remainingDays ?? '—'}
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.25)] p-4 text-sm text-[rgb(var(--zc-muted2))]">
              No active sprint
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)] p-5">
          <h2 className="text-lg font-semibold text-[rgb(var(--zc-text))]">Project Progress</h2>
          <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">Execution metrics</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] p-3">
              <p className="text-xs uppercase tracking-wide text-[rgb(var(--zc-subtle))]">Total Tasks</p>
              <p className="mt-1 text-lg font-semibold text-[rgb(var(--zc-text))]">{progress.total}</p>
            </div>
            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] p-3">
              <p className="text-xs uppercase tracking-wide text-[rgb(var(--zc-subtle))]">Completed</p>
              <p className="mt-1 text-lg font-semibold text-emerald-300">{progress.completed}</p>
            </div>
            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] p-3">
              <p className="text-xs uppercase tracking-wide text-[rgb(var(--zc-subtle))]">In Progress</p>
              <p className="mt-1 text-lg font-semibold text-amber-300">{progress.inProgress}</p>
            </div>
            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] p-3">
              <p className="text-xs uppercase tracking-wide text-[rgb(var(--zc-subtle))]">Completion</p>
              <p className="mt-1 text-lg font-semibold text-indigo-300">{progress.completionPct}%</p>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-[rgb(var(--zc-muted))]">
              <span>Completion</span>
              <span>{progress.completionPct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--zc-border))]">
              <div
                className="h-full rounded-full bg-indigo-500/80 transition-all"
                style={{ width: `${Math.max(0, Math.min(100, progress.completionPct))}%` }}
              />
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)] p-5">
        <h2 className="text-lg font-semibold text-[rgb(var(--zc-text))]">Team Summary</h2>
        <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">Assigned teams and leadership</p>
        {assignedTeams.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.25)] p-4 text-sm text-[rgb(var(--zc-muted2))]">
            No assigned teams
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {assignedTeams.map((team) => {
              const managers = (team.members || [])
                .filter((m) => typeof m !== 'string' && m?.customRole === 'team_manager')
                .map((m) => m.name || m.email)
                .filter(Boolean)
              return (
                <div
                  key={team.id}
                  className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] p-3 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${team.color}`} />
                    <p className="font-medium text-[rgb(var(--zc-text))]">{team.name}</p>
                  </div>
                  <p className="mt-2 text-[rgb(var(--zc-muted))]">Members: {team.members?.length || 0}</p>
                  <p className="mt-1 text-[rgb(var(--zc-muted))]">
                    Managers: {managers.length ? managers.join(', ') : '—'}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </section>
  )
}
