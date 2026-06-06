import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../utils/AuthContext.jsx'
import { useLanguage } from '../utils/LanguageContext.jsx'
import { useWorkspace } from '../utils/WorkspaceContext.jsx'
import {
  loadTasks,
  saveTasks,
  normalizeTaskForStorage,
  mergeTaskListsByIdPreferNewer,
  isTaskDeleted,
} from '../components/kanban/taskStorage.js'
import { getTasksForActiveSprint } from '../utils/sprint/sprintProgressUtils.js'
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
import {
  calculateSprintCapacityLoad,
  commitIndependentTaskToSprint,
  commitStoryToSprint,
  getLinkedTasksForStory,
  getReadySprintCandidates,
  removeIndependentTaskFromSprint,
  removeStoryFromSprint,
} from '../utils/sprint/sprintPlanningHierarchyUtils.js'

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
  todo: 'status_todo',
  in_progress: 'status_in_progress',
  in_review: 'status_in_review',
  done: 'status_done',
}

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

function getStoryPoints(task) {
  if (task?.storyPoints != null) return task.storyPoints
  if (task?.story_points != null) return task.story_points
  if (task?.points != null) return task.points
  return null
}

export function SprintPlanningPage() {
  const { t } = useLanguage()
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

  const { readyStories, readyIndependentTasks } = useMemo(() => {
    return getReadySprintCandidates(projectTasks)
  }, [projectTasks])

  // Linked Tasks that are themselves Ready and not yet in a sprint.
  // Rules:
  //   - normalizeItemType === 'task'
  //   - backlogState === 'ready' (case-insensitive)
  //   - has a parentStoryId
  //   - not already in a sprint
  // Epics/Features are inherently excluded (filtered by item type).
  const readyLinkedTasks = useMemo(() => {
    return (Array.isArray(projectTasks) ? projectTasks : []).filter((t) => {
      if (!t) return false
      if (t.sprintId || t.inSprint === true) return false
      if (normalizeItemType(t) !== 'task') return false
      const bs = String(t.backlogState ?? '').toLowerCase().trim()
      if (bs !== 'ready') return false
      return !!t.parentStoryId
    })
  }, [projectTasks])

  const readyStoryIdSet = useMemo(
    () => new Set(readyStories.map((s) => s.id)),
    [readyStories],
  )

  // Map<storyId, Task[]> — used to nest linked ready Tasks under their parent
  // User Story in the Ready Backlog rendering.
  const readyLinkedTasksByStory = useMemo(() => {
    const map = new Map()
    for (const t of readyLinkedTasks) {
      const list = map.get(t.parentStoryId) ?? []
      list.push(t)
      map.set(t.parentStoryId, list)
    }
    return map
  }, [readyLinkedTasks])

  // Linked ready Tasks whose parent User Story is NOT itself in the Ready
  // Backlog (e.g. parent is still Refined, or parent is already in sprint).
  // They are required to appear, so we render them in a dedicated subsection.
  // Rule 7: deduplicated — they are NOT shown under a story group above.
  const readyLinkedTasksOrphan = useMemo(
    () => readyLinkedTasks.filter((t) => !readyStoryIdSet.has(t.parentStoryId)),
    [readyLinkedTasks, readyStoryIdSet],
  )

  const projectItemsById = useMemo(() => {
    const map = new Map()
    for (const it of projectTasks) {
      if (it?.id) map.set(it.id, it)
    }
    return map
  }, [projectTasks])

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

  const sprintItems = useMemo(() => {
    return getTasksForActiveSprint(
      projectTasks,
      activeSprint,
      activeProject?.id ?? null,
    )
  }, [projectTasks, activeSprint?.id, activeProject?.id])

  const sprintStories = useMemo(
    () => sprintItems.filter((it) => normalizeItemType(it) === 'user_story'),
    [sprintItems],
  )

  const sprintTasksOnly = useMemo(
    () => sprintItems.filter((it) => normalizeItemType(it) === 'task'),
    [sprintItems],
  )

  const sprintLinkedTasksByStory = useMemo(() => {
    const map = new Map()
    for (const t of sprintTasksOnly) {
      if (!t?.parentStoryId) continue
      const list = map.get(t.parentStoryId) ?? []
      list.push(t)
      map.set(t.parentStoryId, list)
    }
    return map
  }, [sprintTasksOnly])

  const sprintIndependentTasks = useMemo(
    () => sprintTasksOnly.filter((t) => !t?.parentStoryId),
    [sprintTasksOnly],
  )

  const featureById = useMemo(() => {
    return new Map(
      projectTasks
        .filter((it) => normalizeItemType(it) === 'feature')
        .map((f) => [f.id, f]),
    )
  }, [projectTasks])

  useEffect(() => {
    // TEMP DEBUG: ensure Sprint Planning and Project Overview are using the same sprint backlog definition
    console.log('[SprintPlanning Debug] Sprint Backlog Items', sprintItems)
  }, [sprintItems])

  const projectForMembers = useMemo(() => {
    if (!activeProject?.id) return activeProject
    return (projects || []).find((p) => p.id === activeProject.id) || activeProject
  }, [projects, activeProject])

  const teamMembers = useMemo(() => {
    const members = projectForMembers?.projectMembers || []
    return members.map((m) => ({
      userId: m.userId || m.user_id,
      name: m.displayName || m.display_name || m.email || m.userId || 'Unknown',
    }))
  }, [projectForMembers?.projectMembers])

  const currentMember = useMemo(() => {
    const members = projectForMembers?.projectMembers || []
    return user?.id ? members.find((m) => m?.userId === user.id) || null : null
  }, [projectForMembers?.projectMembers, user?.id])

  const canManageSprintPlanning =
    currentMember?.customRole === 'project_manager' ||
    currentMember?.custom_role === 'project_manager'

  const sprintTasks = useMemo(() => {
    return getTasksForActiveSprint(projectTasks, activeSprint, activeProject?.id ?? null)
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

  const selectedStoryPoints = useMemo(() => {
    return calculateSprintCapacityLoad(
      projectTasks,
      activeSprint,
      activeProject?.id ?? null,
    )
  }, [projectTasks, activeSprint, activeProject?.id])

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
    const timer = setTimeout(() => setPlanningCompleteOk(false), 4000)
    return () => clearTimeout(timer)
  }, [planningCompleteOk])

  useEffect(() => {
    console.log('[SprintPlanning] visibility debug', {
      activeProjectId: activeProject?.id,
      activeSprintId: activeSprint?.id,
      totalTasks: tasks.length,
      projectTasks: projectTasks.length,
      sprintTasks: sprintTasks.length,
      readyBacklogStories: readyStories.length,
      readyBacklogIndependentTasks: readyIndependentTasks.length,
      currentRole: currentMember?.customRole || currentMember?.custom_role,
    })
  }, [
    activeProject?.id,
    activeSprint?.id,
    tasks.length,
    projectTasks.length,
    sprintTasks.length,
    readyStories.length,
    readyIndependentTasks.length,
    currentMember?.customRole,
    currentMember?.custom_role,
  ])

  useEffect(() => {
    if (!capacitySaveOk) return
    const timer = setTimeout(() => setCapacitySaveOk(false), 3500)
    return () => clearTimeout(timer)
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

  const updateSprintCommitment = async (itemId, shouldAssign) => {
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
    const target = list.find((it) => it?.id === itemId) ?? null
    if (!target) {
      console.warn('[SprintPlanning] updateSprintCommitment: item not in merged list', itemId)
      return
    }

    const type = normalizeItemType(target)
    let result
    if (type === 'user_story') {
      result = shouldAssign
        ? commitStoryToSprint(itemId, activeSprint.id, list, {
            now,
            sprintNumber: sprintNo,
          })
        : removeStoryFromSprint(itemId, list, { now })
    } else if (type === 'task') {
      // Only independent tasks are directly commit-able from Sprint Planning.
      if (target.parentStoryId) {
        console.warn('[SprintPlanning] refusing to commit linked task directly', itemId)
        return
      }
      result = shouldAssign
        ? commitIndependentTaskToSprint(itemId, activeSprint.id, list, {
            now,
            sprintNumber: sprintNo,
          })
        : removeIndependentTaskFromSprint(itemId, list, { now })
    } else {
      // Epic/Feature cannot be committed.
      return
    }

    const next = (result?.nextItems ?? [])
      .map((t) => normalizeTaskForStorage(t, user.id))
      .filter(Boolean)
    const changedItems = (result?.changedItems ?? [])
      .map((t) => normalizeTaskForStorage(t, user.id))
      .filter(Boolean)

    setTasks(next)
    await saveTasks(next, user.id, { reason: 'SprintPlanningPage updateSprintCommitment' })
    console.log('[SprintPlanning] saved full task count:', next.length)
    await broadcastUpdatedTasks(next)

    const remoteChanged = changedItems.filter(
      (c) => String(c?.projectId ?? '') === String(projectId),
    )
    if (remoteChanged.length > 0) {
      await upsertRemoteTasks(remoteChanged, user.id)
      console.log('[SprintPlanning] remote upsert done', remoteChanged.length)
    }
  }

  const updateTaskField = async (taskId, fieldUpdates) => {
    if (!user?.id) return
    const now = Date.now()
    const nextTasks = tasks.map((t) => {
      if (t?.id !== taskId) return t
      const updated = { ...t, ...fieldUpdates, updatedAt: now }
      if (updated.projectId) {
        updated.calendarType = 'general'
        updated.calendarId = 'general'
      }
      return updated
    })
    setTasks(nextTasks)
    await saveTasks(nextTasks, user.id, { reason: 'SprintPlanning task field update' })
    const changed = nextTasks.find((t) => t?.id === taskId)
    if (changed) {
      await broadcastUpdatedTasks(nextTasks)
      if (isSharedProjectTask(changed)) {
        await upsertRemoteTasks([changed], user.id)
      }
    }
  }

  if (!activeProject) {
    return (
      <section>
        <h2 className="text-2xl font-bold">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-blue-600">
            {t('sp_title')}
          </span>
        </h2>
        <p className="mt-3 text-sm text-[rgb(var(--zc-muted2))]">
          {t('sp_no_project')}
        </p>
      </section>
    )
  }

  if (!activeSprint) {
    return (
      <section>
        <h2 className="text-2xl font-bold">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-blue-600">
            {t('sp_title')}
          </span>
        </h2>
        <p className="mt-3 text-sm text-[rgb(var(--zc-muted2))]">
          {t('sp_no_sprint')}
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-bold">
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-blue-600">
          {t('sp_title')}
        </span>
      </h2>
      <p className="text-sm text-[rgb(var(--zc-muted2))]">
        {t('sp_intro')}
      </p>
      {hasReadyNonSprintItems ? (
        <p className="text-xs text-[rgb(var(--zc-subtle))]">
          {t('sp_epics_features_note')}
        </p>
      ) : null}
      {!canManageSprintPlanning ? (
        <p className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.25)] px-3 py-2 text-sm text-[rgb(var(--zc-muted2))]">
          {t('sp_readonly_note')}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-l-4 border-[rgb(var(--zc-border))] border-l-indigo-500 bg-[rgb(var(--zc-bg)/0.3)] p-5 lg:col-span-1">
          <h3 className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-cyan-600">
            🏃 {t('sp_active_sprint')}
          </h3>
          <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
            {t('sp_active_sprint_sub')}
          </p>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2">
              <span className="text-[rgb(var(--zc-muted))]">{t('sp_sprint_word')}</span>
              <span className="text-[rgb(var(--zc-text))]">
                #{activeSprint.sprint_number}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2">
              <span className="text-[rgb(var(--zc-muted))]">{t('po_dates')}</span>
              <span className="text-[rgb(var(--zc-text))]">
                {activeSprint.start_date} → {activeSprint.end_date}
              </span>
            </div>
            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2">
              <p className="text-[rgb(var(--zc-muted))] text-xs uppercase tracking-wide">
                {t('sp_sprint_goal')}
              </p>
              <p className="mt-1 text-sm text-[rgb(var(--zc-text))]">
                {activeSprint.sprint_goal || activeSprint.sprintGoal || '—'}
              </p>
            </div>

            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2 text-sm">
              <p className="text-[rgb(var(--zc-muted))] text-xs uppercase tracking-wide">
                {t('sp_planning_status')}
              </p>
              <p className="mt-1 font-medium text-[rgb(var(--zc-text))]">
                {isPlanningCompleted ? t('sp_planning_completed') : t('sp_planning_draft')}
              </p>
              {isPlanningCompleted &&
              (activeSprint.planningCompletedAt ||
                activeSprint.planning_completed_at) ? (
                <p className="mt-1 text-xs text-[rgb(var(--zc-muted2))]">
                  {t('sp_completed_at')}{' '}
                  {formatPlanningCompletedAt(
                    activeSprint.planningCompletedAt ||
                      activeSprint.planning_completed_at,
                  )}
                </p>
              ) : null}
            </div>

            {isPlanningCompleted ? (
              <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-200/90">
                {t('sp_planning_locked')}
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
                  {t('sp_complete_planning')}
                </button>
                {!canCompletePlanning ? (
                  <p className="text-xs text-[rgb(var(--zc-subtle))]">
                    {t('sp_complete_hint')}
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
                {t('sp_reopen_planning')}
              </button>
            ) : null}

            {planningCompleteOk ? (
              <p className="text-xs text-emerald-400">{t('sp_planning_done_ok')}</p>
            ) : null}

            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-[rgb(var(--zc-muted))] text-xs uppercase tracking-wide">
                  {t('sp_capacity_vs_backlog')}
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
                    {t('sp_edit_capacity')}
                  </button>
                ) : null}
              </div>

              {capacityEditing && canMutateSprintPlanning ? (
                <div className="mt-3 space-y-2">
                  <label className="block text-[10px] font-medium uppercase tracking-wide text-[rgb(var(--zc-subtle))]">
                    {t('sp_team_capacity_sp')}
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
                              err?.message || t('sp_err_capacity'),
                            )
                          } finally {
                            setCapacitySaving(false)
                          }
                        })()
                      }}
                      className="rounded-md bg-indigo-500/25 px-3 py-1 text-xs font-medium text-indigo-200 hover:bg-indigo-500/35 disabled:opacity-50"
                    >
                      {capacitySaving ? t('po_saving') : t('btn_save')}
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
                      {t('btn_cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 space-y-2 text-sm text-[rgb(var(--zc-text))]">
                  {capacityPointsInt === 0 ? (
                    <p className="text-[rgb(var(--zc-muted2))]">{t('sp_capacity_not_set')}</p>
                  ) : (
                    <p>
                      <span className="text-indigo-300">{t('sp_team_capacity')}</span>{' '}
                      {capacityPointsInt} SP
                    </p>
                  )}
                  <p>
                    <span className="text-amber-300">{t('sp_selected')}</span>{' '}
                    {selectedStoryPoints} SP
                  </p>
                  {isOverCapacity ? (
                    <p className="text-amber-300">
                      ⚠ {t('sp_overloaded_by')}{' '}
                      {Math.round(selectedStoryPoints - capacityPointsInt)} SP
                    </p>
                  ) : capacityPointsInt > 0 && remainingPoints >= 0 ? (
                    <p className="text-[rgb(var(--zc-muted2))]">
                      <span className="text-emerald-300">{t('sp_remaining')}</span> {remainingPoints} SP
                    </p>
                  ) : null}
                  {capacitySaveOk ? (
                    <p className="text-xs text-emerald-400">{t('sp_capacity_updated')}</p>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-l-4 border-[rgb(var(--zc-border))] border-l-emerald-500 bg-[rgb(var(--zc-bg)/0.3)] p-5 lg:col-span-1">
          <h3 className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-green-500 to-emerald-600">
            📦 {t('sp_ready_backlog')}
          </h3>
          <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
            {t('sp_ready_backlog_sub')}
          </p>
          {isLoading ? (
            <div className="mt-4 rounded-lg border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.25)] p-4 text-sm text-[rgb(var(--zc-muted2))]">
              {t('loading_tasks')}
            </div>
          ) : readyStories.length === 0 &&
            readyIndependentTasks.length === 0 &&
            readyLinkedTasksOrphan.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.25)] p-4 text-sm text-[rgb(var(--zc-muted2))]">
              {t('sp_no_ready')}
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {readyStories.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--zc-subtle))]">
                    {t('sp_ready_user_stories')}
                  </p>
                  <ul className="mt-2 space-y-2 text-sm">
                    {readyStories.map((story) => {
                      const linked = getLinkedTasksForStory(story.id, projectTasks)
                      const linkedReady = readyLinkedTasksByStory.get(story.id) ?? []
                      const featureTitle = story.parentFeatureId
                        ? featureById.get(story.parentFeatureId)?.title || null
                        : null
                      return (
                        <li
                          key={story.id}
                          className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.4)] px-3 py-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-[rgb(var(--zc-text))]">
                                {story.title || story.name || 'Untitled'}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] text-indigo-300">
                                  {t('sp_badge_user_story')}
                                </span>
                                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300">
                                  {PRIORITY_LABELS[story.priority] || 'Must'}
                                </span>
                                {Number(story.storyPoints || story.story_points || 0) > 0 ? (
                                  <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300">
                                    SP: {getStoryPoints(story)}
                                  </span>
                                ) : null}
                                <span className="rounded-full bg-[rgb(var(--zc-border))] px-2 py-0.5 text-[10px] text-[rgb(var(--zc-muted))]">
                                  {t('sp_tasks_count')} {linked.length}
                                </span>
                                {linkedReady.length > 0 ? (
                                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
                                    {t('sp_ready_tasks_count')} {linkedReady.length}
                                  </span>
                                ) : null}
                              </div>
                              {featureTitle ? (
                                <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                                  {t('sp_feature')} {featureTitle}
                                </p>
                              ) : null}
                              <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                                {t('sp_state_ready')}
                              </p>
                            </div>
                            {canMutateSprintPlanning ? (
                              <button
                                type="button"
                                disabled={!canPlan}
                                onClick={() => updateSprintCommitment(story.id, true)}
                                className="shrink-0 rounded-md bg-emerald-500/20 px-2 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
                              >
                                {t('sp_add_to_sprint')}
                              </button>
                            ) : null}
                          </div>
                          {linkedReady.length > 0 ? (
                            <ul className="mt-2 space-y-1">
                              {linkedReady.map((task) => (
                                <li
                                  key={task.id}
                                  className="flex items-start justify-between gap-2 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.25)] px-2 py-2"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-medium text-[rgb(var(--zc-text))]">
                                      {task.title || task.name || 'Untitled'}
                                    </p>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] text-indigo-300">
                                        {t('sp_badge_task')}
                                      </span>
                                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
                                        {t('sp_state_ready')}
                                      </span>
                                      {Number(task.storyPoints || task.story_points || 0) > 0 ? (
                                        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300">
                                          SP: {getStoryPoints(task)}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : null}

              {readyLinkedTasksOrphan.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--zc-subtle))]">
                    {t('sp_ready_linked_tasks')}
                  </p>
                  <p className="mt-1 text-[11px] text-[rgb(var(--zc-subtle))]">
                    {t('sp_ready_linked_tasks_hint')}
                  </p>
                  <ul className="mt-2 space-y-2 text-sm">
                    {readyLinkedTasksOrphan.map((task) => {
                      const parent = projectItemsById.get(task.parentStoryId) ?? null
                      const parentLabel =
                        parent?.title || parent?.name || task.parentStoryId
                      const parentState = parent
                        ? String(parent.backlogState ?? '').toLowerCase() ||
                          'unknown'
                        : 'missing'
                      return (
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
                                {t('sp_badge_task')}
                              </span>
                              <span className="rounded-full bg-[rgb(var(--zc-border))] px-2 py-0.5 text-[10px] text-[rgb(var(--zc-muted))]">
                                {t('sp_badge_linked_task')}
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
                              {t('sp_parent_story')} {parentLabel} ({t('sp_state_word')}: {parentState})
                            </p>
                            <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                              {t('sp_state_ready')}
                            </p>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : null}

              {readyIndependentTasks.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--zc-subtle))]">
                    {t('sp_ready_independent_tasks')}
                  </p>
                  <ul className="mt-2 space-y-2 text-sm">
                    {readyIndependentTasks.map((task) => (
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
                              {t('sp_badge_task')}
                            </span>
                            <span className="rounded-full bg-[rgb(var(--zc-border))] px-2 py-0.5 text-[10px] text-[rgb(var(--zc-muted))]">
                              {t('sp_badge_independent_task')}
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
                            {t('sp_state_ready')}
                          </p>
                        </div>
                        {canMutateSprintPlanning ? (
                          <button
                            type="button"
                            disabled={!canPlan}
                            onClick={() => updateSprintCommitment(task.id, true)}
                            className="shrink-0 rounded-md bg-emerald-500/20 px-2 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
                          >
                            {t('sp_add_to_sprint')}
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-l-4 border-[rgb(var(--zc-border))] border-l-amber-500 bg-[rgb(var(--zc-bg)/0.3)] p-5 lg:col-span-1">
          <h3 className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-600">
            📌 {t('sp_sprint_backlog')}
          </h3>
          <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
            {t('sp_sprint_backlog_sub')}
          </p>
          {isLoading ? (
            <div className="mt-4 rounded-lg border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.25)] p-4 text-sm text-[rgb(var(--zc-muted2))]">
              {t('loading_tasks')}
            </div>
          ) : sprintItems.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.25)] p-4 text-sm text-[rgb(var(--zc-muted2))]">
              {t('sp_no_sprint_items')}
            </div>
          ) : (
            <div className="mt-4 space-y-4 text-sm">
              {sprintStories.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--zc-subtle))]">
                    📋 {t('sp_committed_user_stories')}
                  </p>
                  <ul className="mt-2 space-y-2">
                    {sprintStories.map((story) => {
                      const linked = sprintLinkedTasksByStory.get(story.id) ?? []
                      return (
                        <li
                          key={story.id}
                          className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.4)] px-3 py-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-[rgb(var(--zc-text))]">
                                {story.title || story.name || 'Untitled'}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] text-indigo-300">
                                  {t('sp_badge_user_story')}
                                </span>
                                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300">
                                  {PRIORITY_LABELS[story.priority] || 'Must'}
                                </span>
                                {Number(story.storyPoints || story.story_points || 0) > 0 ? (
                                  <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300">
                                    SP: {getStoryPoints(story)}
                                  </span>
                                ) : null}
                                <span className="rounded-full bg-[rgb(var(--zc-border))] px-2 py-0.5 text-[10px] text-[rgb(var(--zc-muted))]">
                                  {t('sp_tasks_count')} {linked.length}
                                </span>
                              </div>
                            </div>
                            {canMutateSprintPlanning ? (
                              <button
                                type="button"
                                disabled={!canPlan}
                                onClick={() => updateSprintCommitment(story.id, false)}
                                className="shrink-0 rounded-md bg-rose-600 px-2 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                              >
                                {t('pr_remove')}
                              </button>
                            ) : null}
                          </div>
                          {linked.length > 0 ? (
                            <ul className="mt-2 space-y-1">
                              {linked.map((task) => (
                                <li
                                  key={task.id}
                                  className="flex items-start justify-between gap-2 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.25)] px-2 py-2"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-medium text-[rgb(var(--zc-text))]">
                                      {task.title || task.name || 'Untitled'}
                                    </p>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] text-indigo-300">
                                        {t('sp_badge_task')}
                                      </span>
                                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
                                        {t(STATUS_LABELS[task.status] || 'status_todo')}
                                      </span>
                                      {Number(task.storyPoints || task.story_points || 0) > 0 ? (
                                        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300">
                                          SP: {getStoryPoints(task)}
                                        </span>
                                      ) : null}
                                    </div>
                                    {canMutateSprintPlanning && (
                                      <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <select
                                          className="h-6 rounded border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-1 text-[10px] text-[rgb(var(--zc-text))]"
                                          value={task.assignee || ''}
                                          onChange={(e) => {
                                            e.stopPropagation()
                                            updateTaskField(task.id, { assignee: e.target.value })
                                          }}
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <option value="">{t('dash_unassigned')}</option>
                                          {teamMembers.map((m) => (
                                            <option key={m.userId} value={m.name}>{m.name}</option>
                                          ))}
                                        </select>
                                        <input
                                          type="date"
                                          className="h-6 rounded border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-1 text-[10px] text-[rgb(var(--zc-text))]"
                                          value={task.startDate || ''}
                                          onChange={(e) => {
                                            e.stopPropagation()
                                            updateTaskField(task.id, { startDate: e.target.value })
                                          }}
                                          onClick={(e) => e.stopPropagation()}
                                          title={t('task_start_date')}
                                        />
                                        <span className="text-[10px] text-[rgb(var(--zc-subtle))]">→</span>
                                        <input
                                          type="date"
                                          className="h-6 rounded border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-1 text-[10px] text-[rgb(var(--zc-text))]"
                                          value={task.dueDate || task.endDate || ''}
                                          onChange={(e) => {
                                            e.stopPropagation()
                                            updateTaskField(task.id, { dueDate: e.target.value, endDate: e.target.value })
                                          }}
                                          onClick={(e) => e.stopPropagation()}
                                          title={t('sp_end_date')}
                                        />
                                      </div>
                                    )}
                                    {!canMutateSprintPlanning && (task.assignee || task.startDate || task.dueDate) && (
                                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-[rgb(var(--zc-subtle))]">
                                        {task.assignee && <span>👤 {task.assignee}</span>}
                                        {task.startDate && <span>{t('task_start_prefix')} {task.startDate}</span>}
                                        {(task.dueDate || task.endDate) && <span>{t('task_due')}: {task.dueDate || task.endDate}</span>}
                                      </div>
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : null}

              {sprintIndependentTasks.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--zc-subtle))]">
                    📎 {t('sp_committed_independent_tasks')}
                  </p>
                  <ul className="mt-2 space-y-2">
                    {sprintIndependentTasks.map((task) => (
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
                              {t('sp_badge_task')}
                            </span>
                            <span className="rounded-full bg-[rgb(var(--zc-border))] px-2 py-0.5 text-[10px] text-[rgb(var(--zc-muted))]">
                              {t('sp_badge_independent_task')}
                            </span>
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300">
                              {PRIORITY_LABELS[task.priority] || 'Must'}
                            </span>
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
                              {t(STATUS_LABELS[task.status] || 'status_todo')}
                            </span>
                            {Number(task.storyPoints || task.story_points || 0) > 0 ? (
                              <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300">
                                SP: {getStoryPoints(task)}
                              </span>
                            ) : null}
                          </div>
                          {canMutateSprintPlanning && (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <select
                                className="h-6 rounded border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-1 text-[10px] text-[rgb(var(--zc-text))]"
                                value={task.assignee || ''}
                                onChange={(e) => {
                                  e.stopPropagation()
                                  updateTaskField(task.id, { assignee: e.target.value })
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <option value="">{t('dash_unassigned')}</option>
                                {teamMembers.map((m) => (
                                  <option key={m.userId} value={m.name}>{m.name}</option>
                                ))}
                              </select>
                              <input
                                type="date"
                                className="h-6 rounded border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-1 text-[10px] text-[rgb(var(--zc-text))]"
                                value={task.startDate || ''}
                                onChange={(e) => {
                                  e.stopPropagation()
                                  updateTaskField(task.id, { startDate: e.target.value })
                                }}
                                onClick={(e) => e.stopPropagation()}
                                title={t('task_start_date')}
                              />
                              <span className="text-[10px] text-[rgb(var(--zc-subtle))]">→</span>
                              <input
                                type="date"
                                className="h-6 rounded border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-1 text-[10px] text-[rgb(var(--zc-text))]"
                                value={task.dueDate || task.endDate || ''}
                                onChange={(e) => {
                                  e.stopPropagation()
                                  updateTaskField(task.id, { dueDate: e.target.value, endDate: e.target.value })
                                }}
                                onClick={(e) => e.stopPropagation()}
                                title={t('sp_end_date')}
                              />
                            </div>
                          )}
                          {!canMutateSprintPlanning && (task.assignee || task.startDate || task.dueDate) && (
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-[rgb(var(--zc-subtle))]">
                              {task.assignee && <span>👤 {task.assignee}</span>}
                              {task.startDate && <span>{t('task_start_prefix')} {task.startDate}</span>}
                              {(task.dueDate || task.endDate) && <span>{t('task_due')}: {task.dueDate || task.endDate}</span>}
                            </div>
                          )}
                        </div>
                        {canMutateSprintPlanning ? (
                          <button
                            type="button"
                            disabled={!canPlan}
                            onClick={() => updateSprintCommitment(task.id, false)}
                            className="shrink-0 rounded-md bg-rose-600 px-2 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                          >
                            {t('pr_remove')}
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={completePlanningOpen}
        title={t('sp_complete_dialog_title')}
        message={t('sp_complete_dialog_msg')}
        confirmText={t('sp_complete_planning')}
        cancelText={t('btn_cancel')}
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
        title={t('sp_reopen_dialog_title')}
        message={t('sp_reopen_dialog_msg')}
        confirmText={t('sp_reopen')}
        cancelText={t('btn_cancel')}
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

