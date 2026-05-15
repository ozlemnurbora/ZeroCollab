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
import { Modal } from '../components/ui/Modal.jsx'
import { SprintCreationModal } from '../components/workspace/SprintCreationModal.jsx'
import { getSprintRemainingDays } from '../utils/sprintDateUtils.js'
import { fetchRemoteProjectTasks } from '../utils/taskRemoteStorage.js'
import { calculateSprintProgress, getTasksForActiveSprint } from '../utils/sprint/sprintProgressUtils.js'

function normalizeItemType(item) {
  if (!item) return 'task'
  const it = String(item.itemType ?? '').toLowerCase().trim()
  if (it) return it
  const t = String(item.type ?? '').trim()
  if (t === 'Epic') return 'epic'
  if (t === 'Feature') return 'feature'
  if (t === 'User Story' || t === 'UserStory') return 'user_story'
  if (t === 'Task') return 'task'
  return 'task'
}

const DONE_VALUES = new Set(['done', 'complete', 'completed'])

function pickStr(v) {
  return String(v ?? '').toLowerCase().trim()
}

/** User Story completion (unchanged): backlogState OR status counts. */
function isStoryDone(item) {
  if (DONE_VALUES.has(pickStr(item?.backlogState))) return true
  if (DONE_VALUES.has(pickStr(item?.status))) return true
  return false
}

/**
 * Strict Task completion that mirrors the Sprint Board workflow column.
 * - Prefer task workflow `status` (todo / in_progress / in_review / done).
 * - Then `state` (some legacy items use this).
 * - Only fall back to `backlogState` when BOTH status and state are missing,
 *   because `backlogState` can be stale for in-flight sprint tasks (e.g. an
 *   item carried into the sprint with backlogState=done but moved to In Review).
 */
function isTaskDoneStrict(item) {
  const status = pickStr(item?.status)
  const state = pickStr(item?.state)
  const backlogState = pickStr(item?.backlogState)

  console.log(
    '[Sprint Checklist] linked task',
    item?.title,
    item?.status,
    item?.state,
    item?.backlogState,
  )

  if (status) return DONE_VALUES.has(status)
  if (state) return DONE_VALUES.has(state)
  if (backlogState) return DONE_VALUES.has(backlogState)
  return false
}

function isSprintWorkItemDone(item) {
  if (normalizeItemType(item) === 'task') return isTaskDoneStrict(item)
  return isStoryDone(item)
}

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
  const [completeWarningOpen, setCompleteWarningOpen] = useState(false)
  const [completingSprint, setCompletingSprint] = useState(false)
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

  const sprintReadiness = useMemo(() => {
    const projectId = activeProject?.id ?? null
    if (!activeSprint || !projectId) return null

    const sprintItems = getTasksForActiveSprint(
      projectTasks,
      activeSprint,
      projectId,
    )
    const goalDefined = Boolean(
      String(
        activeSprint.sprint_goal ?? activeSprint.sprintGoal ?? '',
      ).trim(),
    )

    const stories = sprintItems.filter(
      (it) => normalizeItemType(it) === 'user_story',
    )
    const tasksOnly = sprintItems.filter(
      (it) => normalizeItemType(it) === 'task',
    )
    const storyIds = new Set(stories.map((s) => s?.id).filter(Boolean))
    const linkedTasks = tasksOnly.filter(
      (t) => t?.parentStoryId && storyIds.has(t.parentStoryId),
    )
    const independentTasks = tasksOnly.filter((t) => !t?.parentStoryId)

    const storiesDone = stories.filter(isSprintWorkItemDone).length
    const linkedDone = linkedTasks.filter(isSprintWorkItemDone).length
    const indepDone = independentTasks.filter(isSprintWorkItemDone).length

    const allStoriesDone =
      stories.length === 0 || storiesDone === stories.length
    const allLinkedDone =
      linkedTasks.length === 0 || linkedDone === linkedTasks.length
    const allIndepDone =
      independentTasks.length === 0 || indepDone === independentTasks.length

    const workItems = sprintItems.filter((it) => {
      const ty = normalizeItemType(it)
      return ty === 'user_story' || ty === 'task'
    })
    const unfinished = workItems.filter((it) => !isSprintWorkItemDone(it))
    const noUnfinishedWork = unfinished.length === 0

    return {
      goalDefined,
      allStoriesDone,
      allLinkedDone,
      allIndepDone,
      noUnfinishedWork,
      storiesTotal: stories.length,
      storiesDone,
      linkedTotal: linkedTasks.length,
      linkedDone,
      indepTotal: independentTasks.length,
      indepDone,
      unfinishedCount: unfinished.length,
    }
  }, [projectTasks, activeSprint, activeProject?.id])

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

  const runCompleteSprint = async () => {
    if (!activeSprint?.id) return
    setSprintActionError('')
    setCompletingSprint(true)
    try {
      await completeProjectSprint(activeSprint.id)
      setCompleteWarningOpen(false)
    } catch (err) {
      setSprintActionError(err?.message || 'Failed to complete sprint.')
    } finally {
      setCompletingSprint(false)
    }
  }

  if (!activeProject) {
    return (
      <section>
        <h1 className="text-2xl font-bold">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-pink-400 to-violet-400">🎯 Project Overview</span>
        </h1>
        <p className="mt-3 text-sm text-[rgb(var(--zc-muted2))]">
          Select an active project to view overview.
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-pink-400 to-violet-400">🎯 Project Overview</span>
      </h1>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-l-4 border-[rgb(var(--zc-border))] border-l-indigo-500 bg-[rgb(var(--zc-bg)/0.3)] p-5 lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-blue-400">📁 Project Identity</h2>
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

        <section className="rounded-xl border border-l-4 border-[rgb(var(--zc-border))] border-l-emerald-500 bg-[rgb(var(--zc-bg)/0.3)] p-5">
          <h2 className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">📊 Project Status</h2>
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
        <section className="rounded-xl border border-l-4 border-[rgb(var(--zc-border))] border-l-cyan-500 bg-[rgb(var(--zc-bg)/0.3)] p-5">
          <h2 className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">🏃 Sprint Summary</h2>
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

              {sprintReadiness ? (
                <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.3)] p-4">
                  <h3 className="text-sm font-semibold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
                    ✅ Sprint Readiness Checklist
                  </h3>
                  <p className="mt-1 text-[11px] text-[rgb(var(--zc-subtle))]">
                    Read-only view of active sprint backlog completion. Does not
                    block completing the sprint.
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-[rgb(var(--zc-muted))]">
                    <li className="flex gap-2">
                      <span
                        className={
                          sprintReadiness.goalDefined
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }
                        aria-hidden
                      >
                        {sprintReadiness.goalDefined ? '✓' : '✗'}
                      </span>
                      <span>
                        {sprintReadiness.goalDefined
                          ? 'Sprint goal is defined'
                          : 'Sprint goal is not defined yet'}
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span
                        className={
                          sprintReadiness.allStoriesDone
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }
                        aria-hidden
                      >
                        {sprintReadiness.allStoriesDone ? '✓' : '✗'}
                      </span>
                      <span>
                        {sprintReadiness.allStoriesDone
                          ? 'All committed user stories completed'
                          : 'Some committed user stories are not done'}
                        <span className="ml-1 text-[11px] text-[rgb(var(--zc-subtle))]">
                          ({sprintReadiness.storiesDone} /{' '}
                          {sprintReadiness.storiesTotal})
                        </span>
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span
                        className={
                          sprintReadiness.allLinkedDone
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }
                        aria-hidden
                      >
                        {sprintReadiness.allLinkedDone ? '✓' : '✗'}
                      </span>
                      <span>
                        {sprintReadiness.allLinkedDone
                          ? 'Linked tasks completed'
                          : 'Some linked tasks are not done'}
                        <span className="ml-1 text-[11px] text-[rgb(var(--zc-subtle))]">
                          ({sprintReadiness.linkedDone} /{' '}
                          {sprintReadiness.linkedTotal})
                        </span>
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span
                        className={
                          sprintReadiness.allIndepDone
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }
                        aria-hidden
                      >
                        {sprintReadiness.allIndepDone ? '✓' : '✗'}
                      </span>
                      <span>
                        {sprintReadiness.allIndepDone
                          ? 'Independent sprint tasks completed'
                          : 'Some independent sprint tasks are not done'}
                        <span className="ml-1 text-[11px] text-[rgb(var(--zc-subtle))]">
                          ({sprintReadiness.indepDone} /{' '}
                          {sprintReadiness.indepTotal})
                        </span>
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span
                        className={
                          sprintReadiness.noUnfinishedWork
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }
                        aria-hidden
                      >
                        {sprintReadiness.noUnfinishedWork ? '✓' : '✗'}
                      </span>
                      <span>
                        {sprintReadiness.noUnfinishedWork
                          ? 'No unfinished sprint work remains'
                          : 'Unfinished sprint work remains'}
                        {sprintReadiness.unfinishedCount > 0 ? (
                          <span className="ml-1 text-[11px] text-amber-300/90">
                            ({sprintReadiness.unfinishedCount} item
                            {sprintReadiness.unfinishedCount === 1 ? '' : 's'}{' '}
                            not done)
                          </span>
                        ) : null}
                      </span>
                    </li>
                  </ul>
                  <div className="mt-3 space-y-1 border-t border-[rgb(var(--zc-border))] pt-3 text-[11px] text-[rgb(var(--zc-subtle))]">
                    <p>
                      Stories completed: {sprintReadiness.storiesDone} /{' '}
                      {sprintReadiness.storiesTotal}
                    </p>
                    <p>
                      Linked tasks completed: {sprintReadiness.linkedDone} /{' '}
                      {sprintReadiness.linkedTotal}
                    </p>
                    <p>
                      Independent tasks completed: {sprintReadiness.indepDone} /{' '}
                      {sprintReadiness.indepTotal}
                    </p>
                  </div>
                </div>
              ) : null}

              {sprintActionError ? (
                <p className="text-xs text-rose-400">{sprintActionError}</p>
              ) : null}
              <div className="pt-1">
                <Button
                  variant="secondary"
                  disabled={completingSprint}
                  onClick={() => {
                    setSprintActionError('')
                    const incomplete =
                      !sprintReadiness ||
                      !sprintReadiness.goalDefined ||
                      !sprintReadiness.allStoriesDone ||
                      !sprintReadiness.allLinkedDone ||
                      !sprintReadiness.allIndepDone ||
                      !sprintReadiness.noUnfinishedWork
                    if (incomplete) {
                      setCompleteWarningOpen(true)
                      return
                    }
                    void runCompleteSprint()
                  }}
                >
                  {completingSprint ? 'Completing…' : 'Complete Sprint'}
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

        <section className="rounded-xl border border-l-4 border-[rgb(var(--zc-border))] border-l-violet-500 bg-[rgb(var(--zc-bg)/0.3)] p-5">
          <h2 className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-purple-400">📈 Project Progress</h2>
          <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">Execution metrics</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] p-3">
              <p className="text-xs uppercase tracking-wide text-[rgb(var(--zc-subtle))]">Total Tasks</p>
              <p className="mt-1 text-lg font-bold text-blue-300">{progress.total}</p>
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
              <p className="mt-1 text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">{progress.completionPct}%</p>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-[rgb(var(--zc-muted))]">
              <span>Completion</span>
              <span>{progress.completionPct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--zc-border))]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all"
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

      <Modal
        open={completeWarningOpen}
        onClose={() => {
          if (completingSprint) return
          setCompleteWarningOpen(false)
        }}
        title="Sprint still has unfinished work"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              disabled={completingSprint}
              onClick={() => setCompleteWarningOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={completingSprint}
              onClick={() => {
                void runCompleteSprint()
              }}
            >
              {completingSprint ? 'Completing…' : 'Complete Anyway'}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[rgb(var(--zc-muted))]">
          Some sprint goals or work items are not fully complete. Review the
          remaining items before closing the sprint.
        </p>
        {sprintReadiness ? (
          <ul className="mt-4 space-y-1.5 text-sm text-[rgb(var(--zc-text))]">
            <li>
              Incomplete user stories:{' '}
              <span className="font-semibold tabular-nums">
                {Math.max(
                  0,
                  sprintReadiness.storiesTotal - sprintReadiness.storiesDone,
                )}
              </span>
            </li>
            <li>
              Incomplete linked tasks:{' '}
              <span className="font-semibold tabular-nums">
                {Math.max(
                  0,
                  sprintReadiness.linkedTotal - sprintReadiness.linkedDone,
                )}
              </span>
            </li>
            <li>
              Incomplete independent tasks:{' '}
              <span className="font-semibold tabular-nums">
                {Math.max(
                  0,
                  sprintReadiness.indepTotal - sprintReadiness.indepDone,
                )}
              </span>
            </li>
            <li>
              Sprint goal missing:{' '}
              <span className="font-semibold">
                {sprintReadiness.goalDefined ? 'No' : 'Yes'}
              </span>
            </li>
          </ul>
        ) : null}
        {sprintActionError ? (
          <p className="mt-3 text-xs text-rose-400">{sprintActionError}</p>
        ) : null}
        <p className="mt-4 text-[11px] text-[rgb(var(--zc-subtle))]">
          Completing now will close the sprint without changing any task or
          story statuses.
        </p>
      </Modal>

      <section className="rounded-xl border border-l-4 border-[rgb(var(--zc-border))] border-l-amber-500 bg-[rgb(var(--zc-bg)/0.3)] p-5">
        <h2 className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">👥 Team Summary</h2>
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
