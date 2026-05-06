import { useEffect, useMemo, useState } from 'react'
import {
  loadTasks,
  isTaskDeleted,
  mergeTaskListsByIdPreferNewer,
  normalizeTaskForStorage,
  saveTasks,
} from '../components/kanban/taskStorage.js'
import { useWorkspace } from '../utils/WorkspaceContext.jsx'
import { useAuth } from '../utils/AuthContext.jsx'
import { Button } from '../components/ui/Button.jsx'
import { SprintCreationModal } from '../components/workspace/SprintCreationModal.jsx'
import { getSprintRemainingDays } from '../utils/sprintDateUtils.js'
import { fetchRemoteProjectTasks } from '../utils/taskRemoteStorage.js'
import { calculateSprintProgress } from '../utils/sprint/sprintProgressUtils.js'

function fmtDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function ProjectOverviewPage() {
  const { user } = useAuth()
  const {
    activeProject,
    teams,
    activeSprint,
    projects,
    createProjectSprint,
    completeProjectSprint,
    updateProjectOverview,
  } = useWorkspace()
  const [tasks, setTasks] = useState([])
  const [createSprintOpen, setCreateSprintOpen] = useState(false)
  const [sprintActionError, setSprintActionError] = useState('')
  const [isEditingOverview, setIsEditingOverview] = useState(false)
  const [overviewError, setOverviewError] = useState('')
  const [overviewSaving, setOverviewSaving] = useState(false)
  const [goalDraft, setGoalDraft] = useState('')
  const [startDraft, setStartDraft] = useState('')
  const [targetEndDraft, setTargetEndDraft] = useState('')

  useEffect(() => {
    if (!user?.id) {
      setTasks([])
      return
    }
    let cancelled = false
    const refresh = async () => {
      const rawLocal = await loadTasks(user.id)
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
      const normalized = merged
        .map((t) => normalizeTaskForStorage(t, user.id))
        .filter(Boolean)
      if (cancelled) return
      setTasks(normalized)
      if (projectId && normalized.length > 0) {
        // Keep local cache aligned with sprint planning (which also persists the merge).
        await saveTasks(normalized, user.id, { reason: 'ProjectOverview remote merge' })
      }
    }
    void refresh()

    const onTasksChanged = (e) => {
      const owner = e?.detail?.ownerUserId ?? null
      if (owner && String(owner) !== String(user.id)) return
      void refresh()
    }
    window.addEventListener('zc-tasks-changed', onTasksChanged)
    return () => {
      cancelled = true
      window.removeEventListener('zc-tasks-changed', onTasksChanged)
    }
  }, [user?.id, activeProject?.id])

  const projectTasks = useMemo(() => {
    if (!activeProject?.id) return []
    return tasks.filter(
      (t) => t.projectId === activeProject.id && !isTaskDeleted(t),
    )
  }, [tasks, activeProject?.id])

  const progress = useMemo(() => {
    const projectId = activeProject?.id ?? null

    console.log('[ProjectOverview Debug] Active Sprint', activeSprint ?? null)
    console.log('[ProjectOverview Debug] Project ID', projectId)
    console.log('[ProjectOverview Debug] All Tasks', Array.isArray(tasks) ? tasks : [])

    const p = calculateSprintProgress(projectTasks, activeSprint, projectId)
    console.log('[ProjectOverview Debug] Sprint Progress', p)

    return {
      total: p.totalTasks,
      completed: p.completedTasks,
      inProgress: p.inProgressTasks,
      completionPct: p.completionPercent,
    }
  }, [projectTasks, activeSprint, activeProject?.id, tasks])

  const assignedTeams = useMemo(() => {
    if (!activeProject?.teamIds?.length) return []
    return (teams || []).filter((team) => activeProject.teamIds.includes(team.id))
  }, [activeProject?.teamIds, teams])

  const projectForOverview = useMemo(() => {
    if (!activeProject?.id) return activeProject
    return (projects || []).find((p) => p.id === activeProject.id) || activeProject
  }, [projects, activeProject])

  const currentMember = useMemo(() => {
    const members = projectForOverview?.projectMembers || []
    return user?.id ? members.find((m) => m?.userId === user.id) || null : null
  }, [projectForOverview?.projectMembers, user?.id])

  // STRICT: only project_manager can edit overview fields (admins cannot unless also manager).
  const canEditProjectOverview = currentMember?.customRole === 'project_manager'

  const projectAdmin = useMemo(() => {
    if (!projectForOverview?.projectMembers?.length) return '—'
    const owner = projectForOverview.projectMembers.find((m) => m.role === 'owner')
    return owner?.name || owner?.email || '—'
  }, [projectForOverview?.projectMembers])

  const projectManagers = useMemo(() => {
    const members = projectForOverview?.projectMembers || []
    const managers = members.filter((m) => m.customRole === 'project_manager')
    return managers.map((m) => m.name || m.email).filter(Boolean)
  }, [projectForOverview?.projectMembers])

  const remainingDays = useMemo(() => {
    return getSprintRemainingDays(activeSprint?.end_date)
  }, [activeSprint?.end_date])

  useEffect(() => {
    if (!projectForOverview) return
    if (isEditingOverview) return
    setGoalDraft(projectForOverview.goal || '')
    setStartDraft(projectForOverview.startDate || projectForOverview.start_date || '')
    setTargetEndDraft(projectForOverview.targetEndDate || projectForOverview.target_end_date || '')
  }, [projectForOverview, isEditingOverview])

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
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[rgb(var(--zc-text))]">Project Identity</h2>
              <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">High-level project context</p>
            </div>
            {canEditProjectOverview ? (
              isEditingOverview ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    disabled={overviewSaving}
                    onClick={() => {
                      setOverviewError('')
                      setIsEditingOverview(false)
                      setGoalDraft(projectForOverview.goal || '')
                      setStartDraft(projectForOverview.startDate || projectForOverview.start_date || '')
                      setTargetEndDraft(projectForOverview.targetEndDate || projectForOverview.target_end_date || '')
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={overviewSaving}
                    onClick={() => {
                      if (!activeProject?.id) return
                      setOverviewError('')
                      const goal = (goalDraft || '').trim()
                      const start = startDraft || ''
                      const end = targetEndDraft || ''
                      if (start && end) {
                        const s = Date.parse(start)
                        const e = Date.parse(end)
                        if (Number.isFinite(s) && Number.isFinite(e) && s > e) {
                          setOverviewError('Start Date cannot be after Target End Date.')
                          return
                        }
                      }
                      setOverviewSaving(true)
                      void (async () => {
                        const ok = await updateProjectOverview?.(activeProject.id, {
                          goal,
                          start_date: start || null,
                          target_end_date: end || null,
                        })
                        if (!ok) {
                          setOverviewError('Failed to save project overview.')
                          return
                        }
                        setIsEditingOverview(false)
                      })().finally(() => setOverviewSaving(false))
                    }}
                  >
                    {overviewSaving ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setOverviewError('')
                    setIsEditingOverview(true)
                  }}
                >
                  Edit
                </Button>
              )
            ) : null}
          </div>

          <div className="mt-4">
            <p className="text-sm text-[rgb(var(--zc-muted))]">Project Name</p>
            <p className="text-lg font-semibold text-[rgb(var(--zc-text))]">{activeProject.name}</p>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] p-3">
              <p className="text-xs uppercase tracking-wide text-[rgb(var(--zc-subtle))]">Project Goal</p>
              {isEditingOverview && canEditProjectOverview ? (
                <textarea
                  value={goalDraft}
                  onChange={(e) => setGoalDraft(e.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              ) : (
                <p className="mt-1 text-sm text-[rgb(var(--zc-text))]">{activeProject.goal || '—'}</p>
              )}
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
              {isEditingOverview && canEditProjectOverview ? (
                <input
                  type="date"
                  value={startDraft}
                  onChange={(e) => setStartDraft(e.target.value)}
                  className="rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 py-1 text-xs text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              ) : (
                <span className="text-[rgb(var(--zc-text))]">{fmtDate(activeProject.startDate || activeProject.start_date)}</span>
              )}
            </div>
            <div className="flex items-center justify-between rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2">
              <span className="text-[rgb(var(--zc-muted))]">Target End Date</span>
              {isEditingOverview && canEditProjectOverview ? (
                <input
                  type="date"
                  value={targetEndDraft}
                  onChange={(e) => setTargetEndDraft(e.target.value)}
                  className="rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 py-1 text-xs text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              ) : (
                <span className="text-[rgb(var(--zc-text))]">{fmtDate(activeProject.targetEndDate || activeProject.target_end_date)}</span>
              )}
            </div>
            <div className="flex items-center justify-between rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2">
              <span className="text-[rgb(var(--zc-muted))]">Created At</span>
              <span className="text-[rgb(var(--zc-text))]">{fmtDate(activeProject.created_at)}</span>
            </div>
          </div>
          {overviewError ? (
            <p className="mt-2 text-xs text-rose-400">{overviewError}</p>
          ) : null}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)] p-5">
          <h2 className="text-lg font-semibold text-[rgb(var(--zc-text))]">Sprint Summary</h2>
          <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">Current delivery cycle</p>
          {activeSprint ? (
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] p-3">
                  <p className="text-xs uppercase tracking-wide text-[rgb(var(--zc-subtle))]">
                    Active Sprint
                  </p>
                  <p className="mt-1 text-sm font-medium text-[rgb(var(--zc-text))]">
                    Sprint {activeSprint.sprint_number}
                  </p>
                </div>
                <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] p-3">
                  <p className="text-xs uppercase tracking-wide text-[rgb(var(--zc-subtle))]">
                    Status
                  </p>
                  <p className="mt-1 text-sm font-medium text-[rgb(var(--zc-text))]">
                    {activeSprint.status}
                  </p>
                </div>
                <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] p-3">
                  <p className="text-xs uppercase tracking-wide text-[rgb(var(--zc-subtle))]">
                    Duration
                  </p>
                  <p className="mt-1 text-sm text-[rgb(var(--zc-text))]">
                    {activeSprint.duration_weeks} week
                    {activeSprint.duration_weeks > 1 ? 's' : ''}
                  </p>
                </div>
                <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] p-3">
                  <p className="text-xs uppercase tracking-wide text-[rgb(var(--zc-subtle))]">
                    Remaining Days
                  </p>
                  <p className="mt-1 text-sm text-[rgb(var(--zc-text))]">
                    {remainingDays ?? '—'}
                  </p>
                </div>
                <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] p-3 sm:col-span-2">
                  <p className="text-xs uppercase tracking-wide text-[rgb(var(--zc-subtle))]">
                    Dates
                  </p>
                  <p className="mt-1 text-sm text-[rgb(var(--zc-text))]">
                    {fmtDate(activeSprint.start_date)} → {fmtDate(activeSprint.end_date)}
                  </p>
                </div>
                <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] p-3 sm:col-span-2">
                  <p className="text-xs uppercase tracking-wide text-[rgb(var(--zc-subtle))]">
                    Sprint Goal
                  </p>
                  <p className="mt-1 text-sm text-[rgb(var(--zc-text))]">
                    {activeSprint.sprint_goal || '—'}
                  </p>
                </div>
              </div>
              {sprintActionError ? (
                <p className="text-xs text-rose-400">{sprintActionError}</p>
              ) : null}
              <div className="pt-1">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSprintActionError('')
                    void completeProjectSprint(activeSprint.id).catch((err) =>
                      setSprintActionError(
                        err?.message || 'Failed to complete sprint.',
                      ),
                    )
                  }}
                >
                  Complete Sprint
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.25)] p-4 text-sm text-[rgb(var(--zc-muted2))]">
              <p className="mb-2">No active sprint.</p>
              {sprintActionError ? (
                <p className="mb-2 text-xs text-rose-400">{sprintActionError}</p>
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
