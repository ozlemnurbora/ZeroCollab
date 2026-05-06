import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../utils/AuthContext.jsx'
import { useWorkspace } from '../utils/WorkspaceContext.jsx'
import {
  loadTasks,
  saveTasks,
  normalizeTaskForStorage,
  mergeTaskListsByIdPreferNewer,
  isTaskDeleted,
} from '../components/kanban/taskStorage.js'
import {
  tasksForP2PBroadcast,
  mergeTasksFromSync,
  applyAuthorizedGeneralTaskSoftDelete,
} from '../utils/taskP2PSync.js'
import { broadcastTaskSync } from '../utils/hubManager.js'
import { on, P2P_EVENTS, sendToAllPeers } from '../utils/p2pManager.js'
import {
  upsertRemoteTasks,
  fetchRemoteProjectTasks,
  isSharedProjectTask,
} from '../utils/taskRemoteStorage.js'
import { normalizeCapacityPoints } from '../utils/workspaceDB.js'
import { ConfirmDialog } from '../components/common/ConfirmDialog.jsx'

function formatPlanningCompletedAt(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString()
}

const ITEM_TYPE_LABELS = {
  epic: 'Epic',
  feature: 'Feature',
  user_story: 'User Story',
  task: 'Task',
}

const PRIORITY_LABELS = {
  must: 'Must',
  should: 'Should',
  could: 'Could',
  wont: "Won't",
}

const STATUS_LABELS = {
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
}

function getStoryPoints(task) {
  if (task?.storyPoints != null) return task.storyPoints
  if (task?.story_points != null) return task.story_points
  if (task?.points != null) return task.points
  return null
}

function isSprintCompatibleItemType(itemType) {
  return itemType === 'task' || itemType === 'user_story'
}

export function SprintPlanningPage() {
  const { user } = useAuth()
  const {
    activeProject,
    activeSprint,
    memberProjectIds = [],
    projects,
    updateProjectSprint,
  } = useWorkspace()
  const [tasks, setTasks] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [capacityEditing, setCapacityEditing] = useState(false)
  const [capacityDraft, setCapacityDraft] = useState(0)
  const [capacitySaving, setCapacitySaving] = useState(false)
  const [capacitySaveError, setCapacitySaveError] = useState('')
  const [capacitySaveOk, setCapacitySaveOk] = useState(false)
  const [completePlanningOpen, setCompletePlanningOpen] = useState(false)
  const [reopenPlanningOpen, setReopenPlanningOpen] = useState(false)
  const [planningActionSaving, setPlanningActionSaving] = useState(false)
  const [planningCompleteOk, setPlanningCompleteOk] = useState(false)

  useEffect(() => {
    if (!user?.id) {
      setTasks([])
      setIsLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setIsLoading(true)
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
      setIsLoading(false)
      if (projectId && normalized.length > 0) {
        await saveTasks(normalized, user.id, { reason: 'SprintPlanning remote merge' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, activeProject?.id])

  const visibilityOptions = useMemo(
    () => ({
      allowedProjectIds: memberProjectIds,
      currentUserId: user?.id ?? null,
    }),
    [memberProjectIds, user?.id],
  )

  useEffect(() => {
    if (!user?.id) return
    const unsub = on(P2P_EVENTS.MESSAGE, ({ data }) => {
      if (data?.type === 'TASK_DELETE') {
        const { taskId, projectId } = data
        setTasks((prev) => {
          const { next, changed } = applyAuthorizedGeneralTaskSoftDelete(
            prev,
            taskId,
            projectId,
            memberProjectIds,
            user.id,
          )
          if (!changed) return prev
          void saveTasks(next, user.id, { allowEmpty: true, reason: 'SprintPlanning P2P delete' })
          const tomb = next.find(
            (t) =>
              t?.id === taskId &&
              String(t?.projectId ?? '') === String(projectId) &&
              isSharedProjectTask(t),
          )
          if (tomb) void upsertRemoteTasks([tomb], user.id)
          return next
        })
        return
      }
      if (data?.type !== 'TASK_SYNC') return
      const incomingGeneral = (Array.isArray(data.tasks) ? data.tasks : []).filter(
        (task) =>
          task &&
          (task.calendarType === 'general' || !task.calendarType) &&
          !!task.projectId &&
          memberProjectIds.includes(task.projectId),
      )
      if (incomingGeneral.length === 0) return
      if (activeProject?.id && data.projectId && data.projectId !== activeProject.id) return
      setTasks((prev) => {
        const nextBase = mergeTasksFromSync(prev, incomingGeneral, visibilityOptions)
        if (prev.length > 0 && nextBase.length === 0) return prev
        const next = nextBase.map((t) => ({
          ...t,
          ownerUserId: t.ownerUserId ?? user.id,
        }))
        void saveTasks(next, user.id, { reason: 'SprintPlanning P2P sync' })
        void upsertRemoteTasks(incomingGeneral, user.id)
        return next
      })
    })

    const onHub = (e) => {
      const payload = e.detail || {}
      const { action, tasks: incomingTasks, projectId, taskId } = payload
      if (action === 'task-delete') {
        if (activeProject?.id && projectId && projectId !== activeProject.id) return
        setTasks((prev) => {
          const { next, changed } = applyAuthorizedGeneralTaskSoftDelete(
            prev,
            taskId,
            projectId,
            memberProjectIds,
            user.id,
          )
          if (!changed) return prev
          void saveTasks(next, user.id, { allowEmpty: true, reason: 'SprintPlanning hub delete' })
          const tomb = next.find(
            (t) =>
              t?.id === taskId &&
              String(t?.projectId ?? '') === String(projectId) &&
              isSharedProjectTask(t),
          )
          if (tomb) void upsertRemoteTasks([tomb], user.id)
          return next
        })
        return
      }
      if (action !== 'task-sync') return
      if (projectId && !memberProjectIds.includes(projectId)) return
      if (activeProject?.id && projectId && projectId !== activeProject.id) return
      if (!Array.isArray(incomingTasks) || incomingTasks.length === 0) return
      setTasks((prev) => {
        const nextBase = mergeTasksFromSync(prev, incomingTasks, visibilityOptions)
        if (prev.length > 0 && nextBase.length === 0) return prev
        const next = nextBase.map((t) => ({
          ...t,
          ownerUserId: t.ownerUserId ?? user.id,
        }))
        void saveTasks(next, user.id, { reason: 'SprintPlanning hub sync' })
        void upsertRemoteTasks(incomingTasks, user.id)
        return next
      })
    }
    window.addEventListener('hub:message', onHub)
    return () => {
      unsub()
      window.removeEventListener('hub:message', onHub)
    }
  }, [
    user?.id,
    memberProjectIds,
    activeProject?.id,
    visibilityOptions,
  ])

  const projectTasks = useMemo(() => {
    if (!activeProject?.id) return []
    return (Array.isArray(tasks) ? tasks : []).filter(
      (t) =>
        t &&
        !isTaskDeleted(t) &&
        String(t.projectId) === String(activeProject.id),
    )
  }, [tasks, activeProject?.id])

  const readyBacklog = useMemo(
    () =>
      projectTasks.filter(
        (t) =>
          t.backlogState === 'ready' &&
          !t.sprintId &&
          isSprintCompatibleItemType(t.itemType || 'task'),
      ),
    [projectTasks],
  )

  const hasReadyNonSprintItems = useMemo(
    () =>
      projectTasks.some(
        (t) =>
          t.backlogState === 'ready' &&
          !t.sprintId &&
          (t.itemType === 'epic' || t.itemType === 'feature'),
      ),
    [projectTasks],
  )

  const sprintBacklog = useMemo(() => {
    if (!activeSprint?.id || !activeProject?.id) return []
    return projectTasks.filter(
      (t) =>
        t &&
        String(t.projectId) === String(activeProject.id) &&
        String(t.sprintId) === String(activeSprint.id),
    )
  }, [projectTasks, activeSprint?.id, activeProject?.id])

  const projectForMembers = useMemo(() => {
    if (!activeProject?.id) return activeProject
    return (projects || []).find((p) => p.id === activeProject.id) || activeProject
  }, [projects, activeProject])

  const currentMember = useMemo(() => {
    const members = projectForMembers?.projectMembers || []
    return user?.id ? members.find((m) => m?.userId === user.id) || null : null
  }, [projectForMembers?.projectMembers, user?.id])

  const canManageSprintPlanning =
    currentMember?.customRole === 'project_manager' ||
    currentMember?.custom_role === 'project_manager'

  const sprintTasks = useMemo(() => {
    if (!activeSprint?.id || !activeProject?.id) return []
    return projectTasks.filter(
      (t) =>
        t &&
        String(t.projectId) === String(activeProject.id) &&
        String(t.sprintId) === String(activeSprint.id),
    )
  }, [projectTasks, activeSprint?.id, activeProject?.id])

  const hasSprintGoal = Boolean(
    String(activeSprint?.sprint_goal ?? activeSprint?.sprintGoal ?? '').trim(),
  )
  const hasCommittedItems = sprintTasks.length > 0
  const isPlanningCompleted =
    activeSprint?.planningStatus === 'completed' ||
    activeSprint?.planning_status === 'completed'
  const canMutateSprintPlanning =
    canManageSprintPlanning && !isPlanningCompleted
  const canCompletePlanning =
    canManageSprintPlanning &&
    !isPlanningCompleted &&
    hasSprintGoal &&
    hasCommittedItems

  const selectedStoryPoints = useMemo(
    () =>
      sprintTasks.reduce((sum, task) => {
        const sp = Number(task.storyPoints || task.story_points || 0)
        return sum + (Number.isFinite(sp) ? sp : 0)
      }, 0),
    [sprintTasks],
  )

  const capacityPoints = useMemo(
    () =>
      Number(
        activeSprint?.capacityPoints ??
          activeSprint?.capacity_points ??
          0,
      ),
    [activeSprint?.capacityPoints, activeSprint?.capacity_points],
  )

  const capacityPointsInt = Number.isFinite(capacityPoints)
    ? Math.max(0, Math.round(capacityPoints))
    : 0

  const remainingPoints = capacityPointsInt - selectedStoryPoints

  const isOverCapacity =
    capacityPointsInt > 0 && selectedStoryPoints > capacityPointsInt

  const canPlan =
    canMutateSprintPlanning &&
    !!user?.id &&
    !!activeProject?.id &&
    !!activeSprint?.id

  useEffect(() => {
    if (isPlanningCompleted) setCapacityEditing(false)
  }, [isPlanningCompleted])

  useEffect(() => {
    if (!planningCompleteOk) return
    const t = setTimeout(() => setPlanningCompleteOk(false), 4000)
    return () => clearTimeout(t)
  }, [planningCompleteOk])

  useEffect(() => {
    console.log('[SprintPlanning] visibility debug', {
      activeProjectId: activeProject?.id,
      activeSprintId: activeSprint?.id,
      totalTasks: tasks.length,
      projectTasks: projectTasks.length,
      sprintTasks: sprintTasks.length,
      readyBacklogTasks: readyBacklog.length,
      currentRole: currentMember?.customRole || currentMember?.custom_role,
    })
  }, [
    activeProject?.id,
    activeSprint?.id,
    tasks.length,
    projectTasks.length,
    sprintTasks.length,
    readyBacklog.length,
    currentMember?.customRole,
    currentMember?.custom_role,
  ])

  useEffect(() => {
    if (!capacitySaveOk) return
    const t = setTimeout(() => setCapacitySaveOk(false), 3500)
    return () => clearTimeout(t)
  }, [capacitySaveOk])

  useEffect(() => {
    if (!activeSprint?.id) {
      setCapacityEditing(false)
      return
    }
    const cap = normalizeCapacityPoints(
      activeSprint.capacityPoints ?? activeSprint.capacity_points ?? 0,
    )
    setCapacityDraft(cap)
  }, [activeSprint?.id, activeSprint?.capacityPoints, activeSprint?.capacity_points])

  const broadcastUpdatedTasks = async (nextTasks) => {
    if (!activeProject?.id) return
    const generalTasks = tasksForP2PBroadcast(nextTasks, {
      activeProjectId: activeProject.id,
      allowedProjectIds: memberProjectIds,
    })
    if (generalTasks.length === 0) return
    sendToAllPeers({
      type: 'TASK_SYNC',
      tasks: generalTasks,
      projectId: activeProject.id,
    })
    await broadcastTaskSync(generalTasks, activeProject.id)
  }

  const updateTaskSprint = async (taskId, shouldAssign) => {
    if (!user?.id || !canMutateSprintPlanning) return
    const projectId = activeProject?.id
    if (!projectId || !activeSprint?.id) return
    const rawLocal = await loadTasks(user.id)
    const localArr = Array.isArray(rawLocal) ? rawLocal : []
    let remote = []
    try {
      remote = await fetchRemoteProjectTasks(projectId)
    } catch {
      remote = []
    }
    const stateList = Array.isArray(tasks) ? tasks : []
    const merged = mergeTaskListsByIdPreferNewer(
      mergeTaskListsByIdPreferNewer(localArr, remote),
      stateList,
    )
    const list = merged
      .map((t) => normalizeTaskForStorage(t, user.id))
      .filter(Boolean)
    const now = Date.now()
    const sprintNo =
      activeSprint?.sprint_number ?? activeSprint?.sprintNumber ?? null
    let changed = null
    const nextRaw = list.map((task) => {
      if (task?.id !== taskId) return task
      if (shouldAssign) {
        const rawBs = task.backlogState || 'ready'
        const backlogStateForSprint =
          String(rawBs).toLowerCase() === 'refined' ? 'ready' : rawBs
        changed = {
          ...task,
          sprintId: activeSprint.id,
          sprintNumber: sprintNo,
          sprintCommittedAt: now,
          backlogState: backlogStateForSprint,
          calendarType: 'general',
          calendarId: 'general',
          updatedAt: now,
        }
        return changed
      }
      changed = {
        ...task,
        sprintId: null,
        sprintNumber: null,
        sprintCommittedAt: null,
        backlogState: 'ready',
        calendarType: 'general',
        calendarId: 'general',
        updatedAt: now,
      }
      return changed
    })
    const next = nextRaw
      .map((t) => normalizeTaskForStorage(t, user.id))
      .filter(Boolean)

    if (!changed) {
      console.warn('[SprintPlanning] updateTaskSprint: task not in merged list', taskId)
      return
    }

    setTasks(next)
    await saveTasks(next, user.id, { reason: 'SprintPlanningPage updateTaskSprint' })
    console.log('[SprintPlanning] saved full task count:', next.length)
    await broadcastUpdatedTasks(next)

    if (String(changed.projectId) === String(projectId)) {
      if (shouldAssign) {
        console.log('[SprintPlanning] addToSprint persisted', {
          taskId: changed.id,
          sprintId: changed.sprintId,
          projectId: changed.projectId,
          storyPoints: changed.storyPoints,
        })
      } else {
        console.log('[SprintPlanning] removeFromSprint persisted', {
          taskId: changed.id,
          sprintId: changed.sprintId,
          projectId: changed.projectId,
        })
      }
      await upsertRemoteTasks([changed], user.id)
      console.log('[SprintPlanning] remote upsert done', changed.id)
    }
  }

  if (!activeProject) {
    return (
      <section>
        <h2 className="text-2xl font-semibold text-[rgb(var(--zc-text))]">
          Sprint Planning
        </h2>
        <p className="mt-3 text-sm text-[rgb(var(--zc-muted2))]">
          Select an active project to plan a sprint.
        </p>
      </section>
    )
  }

  if (!activeSprint) {
    return (
      <section>
        <h2 className="text-2xl font-semibold text-[rgb(var(--zc-text))]">
          Sprint Planning
        </h2>
        <p className="mt-3 text-sm text-[rgb(var(--zc-muted2))]">
          No active sprint. Create one from Project Overview before planning.
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-semibold text-[rgb(var(--zc-text))]">
        Sprint Planning
      </h2>
      <p className="text-sm text-[rgb(var(--zc-muted2))]">
        Only Ready User Stories and Tasks can be committed to the sprint.
      </p>
      {hasReadyNonSprintItems ? (
        <p className="text-xs text-[rgb(var(--zc-subtle))]">
          Epics and Features are used for backlog organization and cannot be committed directly to a sprint.
        </p>
      ) : null}
      {!canManageSprintPlanning ? (
        <p className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.25)] px-3 py-2 text-sm text-[rgb(var(--zc-muted2))]">
          Read-only sprint view. Only the project manager can change sprint planning.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)] p-5 lg:col-span-1">
          <h3 className="text-lg font-semibold text-[rgb(var(--zc-text))]">
            Active Sprint
          </h3>
          <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
            Commit ready backlog items into this sprint.
          </p>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2">
              <span className="text-[rgb(var(--zc-muted))]">Sprint</span>
              <span className="text-[rgb(var(--zc-text))]">
                #{activeSprint.sprint_number}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2">
              <span className="text-[rgb(var(--zc-muted))]">Dates</span>
              <span className="text-[rgb(var(--zc-text))]">
                {activeSprint.start_date} → {activeSprint.end_date}
              </span>
            </div>
            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2">
              <p className="text-[rgb(var(--zc-muted))] text-xs uppercase tracking-wide">
                Sprint Goal
              </p>
              <p className="mt-1 text-sm text-[rgb(var(--zc-text))]">
                {activeSprint.sprint_goal || activeSprint.sprintGoal || '—'}
              </p>
            </div>

            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2 text-sm">
              <p className="text-[rgb(var(--zc-muted))] text-xs uppercase tracking-wide">
                Planning status
              </p>
              <p className="mt-1 font-medium text-[rgb(var(--zc-text))]">
                {isPlanningCompleted ? 'Planning: Completed' : 'Planning: Draft'}
              </p>
              {isPlanningCompleted &&
              (activeSprint.planningCompletedAt ||
                activeSprint.planning_completed_at) ? (
                <p className="mt-1 text-xs text-[rgb(var(--zc-muted2))]">
                  Completed at:{' '}
                  {formatPlanningCompletedAt(
                    activeSprint.planningCompletedAt ||
                      activeSprint.planning_completed_at,
                  )}
                </p>
              ) : null}
            </div>

            {isPlanningCompleted ? (
              <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-200/90">
                Sprint planning is completed. Backlog changes are locked.
              </p>
            ) : null}

            {canManageSprintPlanning && !isPlanningCompleted ? (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={!canCompletePlanning}
                  onClick={() => setCompletePlanningOpen(true)}
                  className="w-full rounded-md bg-emerald-500/25 px-3 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/35 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Complete Planning
                </button>
                {!canCompletePlanning ? (
                  <p className="text-xs text-[rgb(var(--zc-subtle))]">
                    Add at least one item and define a sprint goal to complete planning.
                  </p>
                ) : null}
              </div>
            ) : null}

            {canManageSprintPlanning && isPlanningCompleted ? (
              <button
                type="button"
                onClick={() => setReopenPlanningOpen(true)}
                className="w-full rounded-md border border-[rgb(var(--zc-border))] px-3 py-2 text-sm font-medium text-[rgb(var(--zc-muted))] hover:bg-[rgb(var(--zc-panel)/0.4)]"
              >
                Reopen Planning
              </button>
            ) : null}

            {planningCompleteOk ? (
              <p className="text-xs text-emerald-400">Sprint planning completed.</p>
            ) : null}

            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-[rgb(var(--zc-muted))] text-xs uppercase tracking-wide">
                  Capacity vs backlog
                </p>
                {canMutateSprintPlanning && !capacityEditing ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCapacitySaveError('')
                      setCapacityDraft(capacityPointsInt)
                      setCapacityEditing(true)
                    }}
                    className="text-xs font-medium text-indigo-300 hover:text-indigo-200"
                  >
                    Edit capacity
                  </button>
                ) : null}
              </div>

              {capacityEditing && canMutateSprintPlanning ? (
                <div className="mt-3 space-y-2">
                  <label className="block text-[10px] font-medium uppercase tracking-wide text-[rgb(var(--zc-subtle))]">
                    Team capacity (SP)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={capacityDraft}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v === '') {
                        setCapacityDraft(0)
                        return
                      }
                      const n = Number(v)
                      if (!Number.isFinite(n)) return
                      setCapacityDraft(n < 0 ? 0 : Math.round(n))
                    }}
                    className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.5)] px-2 py-1.5 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                  {capacitySaveError ? (
                    <p className="text-xs text-rose-400">{capacitySaveError}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={capacitySaving}
                      onClick={() => {
                        setCapacitySaveError('')
                        setCapacitySaving(true)
                        void (async () => {
                          try {
                            await updateProjectSprint(activeSprint.id, {
                              capacity_points: normalizeCapacityPoints(capacityDraft),
                            })
                            setCapacityEditing(false)
                            setCapacitySaveOk(true)
                          } catch (err) {
                            setCapacitySaveError(
                              err?.message || 'Could not update sprint capacity.',
                            )
                          } finally {
                            setCapacitySaving(false)
                          }
                        })()
                      }}
                      className="rounded-md bg-indigo-500/25 px-3 py-1 text-xs font-medium text-indigo-200 hover:bg-indigo-500/35 disabled:opacity-50"
                    >
                      {capacitySaving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      disabled={capacitySaving}
                      onClick={() => {
                        setCapacitySaveError('')
                        setCapacityDraft(capacityPointsInt)
                        setCapacityEditing(false)
                      }}
                      className="rounded-md border border-[rgb(var(--zc-border))] px-3 py-1 text-xs font-medium text-[rgb(var(--zc-muted))] hover:bg-[rgb(var(--zc-panel)/0.4)] disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 space-y-2 text-sm text-[rgb(var(--zc-text))]">
                  {capacityPointsInt === 0 ? (
                    <p className="text-[rgb(var(--zc-muted2))]">Capacity not set</p>
                  ) : (
                    <p>
                      <span className="text-[rgb(var(--zc-muted))]">Team Capacity:</span>{' '}
                      {capacityPointsInt} SP
                    </p>
                  )}
                  <p>
                    <span className="text-[rgb(var(--zc-muted))]">Selected:</span>{' '}
                    {selectedStoryPoints} SP
                  </p>
                  {isOverCapacity ? (
                    <p className="text-amber-300">
                      ⚠ Sprint is overloaded by{' '}
                      {Math.round(selectedStoryPoints - capacityPointsInt)} SP
                    </p>
                  ) : capacityPointsInt > 0 && remainingPoints >= 0 ? (
                    <p className="text-[rgb(var(--zc-muted2))]">
                      Remaining: {remainingPoints} SP
                    </p>
                  ) : null}
                  {capacitySaveOk ? (
                    <p className="text-xs text-emerald-400">Capacity updated.</p>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)] p-5 lg:col-span-1">
          <h3 className="text-lg font-semibold text-[rgb(var(--zc-text))]">
            Ready Backlog
          </h3>
          <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
            Backlog items that are ready and not yet assigned to a sprint.
          </p>
          {isLoading ? (
            <div className="mt-4 rounded-lg border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.25)] p-4 text-sm text-[rgb(var(--zc-muted2))]">
              Loading tasks…
            </div>
          ) : readyBacklog.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.25)] p-4 text-sm text-[rgb(var(--zc-muted2))]">
              No ready backlog items. Mark items as Ready from task details.
            </div>
          ) : (
            <ul className="mt-4 space-y-2 text-sm">
              {readyBacklog.map((task) => (
                <li
                  key={task.id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.4)] px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[rgb(var(--zc-text))]">
                      {task.title || task.name || 'Untitled'}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] text-indigo-300">
                        {ITEM_TYPE_LABELS[task.itemType] || 'Task'}
                      </span>
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300">
                        {PRIORITY_LABELS[task.priority] || 'Must'}
                      </span>
                      {Number(task.storyPoints || task.story_points || 0) > 0 ? (
                        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300">
                          SP: {getStoryPoints(task)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                      Assignee: {task.assignee || 'Unassigned'}
                    </p>
                  </div>
                  {canMutateSprintPlanning ? (
                    <button
                      type="button"
                      disabled={!canPlan}
                      onClick={() => updateTaskSprint(task.id, true)}
                      className="shrink-0 rounded-md bg-emerald-500/20 px-2 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
                    >
                      Add to Sprint
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)] p-5 lg:col-span-1">
          <h3 className="text-lg font-semibold text-[rgb(var(--zc-text))]">
            Sprint Backlog
          </h3>
          <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
            Items already committed to this sprint.
          </p>
          {isLoading ? (
            <div className="mt-4 rounded-lg border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.25)] p-4 text-sm text-[rgb(var(--zc-muted2))]">
              Loading tasks…
            </div>
          ) : sprintBacklog.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.25)] p-4 text-sm text-[rgb(var(--zc-muted2))]">
              No items in this sprint yet.
            </div>
          ) : (
            <ul className="mt-4 space-y-2 text-sm">
              {sprintBacklog.map((task) => (
                <li
                  key={task.id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.4)] px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[rgb(var(--zc-text))]">
                      {task.title || task.name || 'Untitled'}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] text-indigo-300">
                        {ITEM_TYPE_LABELS[task.itemType] || 'Task'}
                      </span>
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300">
                        {PRIORITY_LABELS[task.priority] || 'Must'}
                      </span>
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
                        {STATUS_LABELS[task.status] || 'To Do'}
                      </span>
                      {Number(task.storyPoints || task.story_points || 0) > 0 ? (
                        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300">
                          SP: {getStoryPoints(task)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                      Assignee: {task.assignee || 'Unassigned'}
                    </p>
                  </div>
                  {canMutateSprintPlanning ? (
                    <button
                      type="button"
                      disabled={!canPlan}
                      onClick={() => updateTaskSprint(task.id, false)}
                      className="shrink-0 rounded-md bg-rose-500/15 px-2 py-1 text-xs font-medium text-rose-300 hover:bg-rose-500/25 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={completePlanningOpen}
        title="Complete sprint planning?"
        message="After completing planning, sprint backlog changes will be locked unless planning is reopened."
        confirmText="Complete Planning"
        cancelText="Cancel"
        loading={planningActionSaving}
        onCancel={() => !planningActionSaving && setCompletePlanningOpen(false)}
        onConfirm={() => {
          void (async () => {
            if (!user?.id || !activeSprint?.id) return
            setPlanningActionSaving(true)
            try {
              await updateProjectSprint(activeSprint.id, {
                planning_status: 'completed',
                planning_completed_at: new Date().toISOString(),
                planning_completed_by: user.id,
              })
              setCompletePlanningOpen(false)
              setPlanningCompleteOk(true)
            } catch (err) {
              console.error('[SprintPlanning] complete planning failed', err)
            } finally {
              setPlanningActionSaving(false)
            }
          })()
        }}
      />
      <ConfirmDialog
        open={reopenPlanningOpen}
        title="Reopen sprint planning?"
        message="This will allow changes to the sprint backlog again."
        confirmText="Reopen"
        cancelText="Cancel"
        loading={planningActionSaving}
        onCancel={() => !planningActionSaving && setReopenPlanningOpen(false)}
        onConfirm={() => {
          void (async () => {
            if (!activeSprint?.id) return
            setPlanningActionSaving(true)
            try {
              await updateProjectSprint(activeSprint.id, {
                planning_status: 'draft',
                planning_completed_at: null,
                planning_completed_by: null,
              })
              setReopenPlanningOpen(false)
            } catch (err) {
              console.error('[SprintPlanning] reopen planning failed', err)
            } finally {
              setPlanningActionSaving(false)
            }
          })()
        }}
      />
    </section>
  )
}

