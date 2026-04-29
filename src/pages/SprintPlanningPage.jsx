import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../utils/AuthContext.jsx'
import { useWorkspace } from '../utils/WorkspaceContext.jsx'
import { loadTasks, saveTasks } from '../components/kanban/taskStorage.js'
import { tasksForP2PBroadcast } from '../utils/taskP2PSync.js'
import { broadcastTaskSync } from '../utils/hubManager.js'
import { sendToAllPeers } from '../utils/p2pManager.js'

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
  const { activeProject, activeSprint, memberProjectIds = [] } = useWorkspace()
  const [tasks, setTasks] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) {
      setTasks([])
      setIsLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setIsLoading(true)
      const existing = await loadTasks(user.id)
      if (cancelled) return
      setTasks(Array.isArray(existing) ? existing : [])
      setIsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const projectTasks = useMemo(() => {
    if (!activeProject?.id) return []
    return (Array.isArray(tasks) ? tasks : []).filter(
      (t) => t && t.projectId === activeProject.id,
    )
  }, [tasks, activeProject?.id])

  const readyBacklog = useMemo(
    () =>
      projectTasks.filter(
        (t) =>
          t.backlogState === 'ready' &&
          (t.sprintId == null || t.sprintId === '') &&
          isSprintCompatibleItemType(t.itemType || 'task') &&
          t.status !== 'done',
      ),
    [projectTasks],
  )

  const hasReadyNonSprintItems = useMemo(
    () =>
      projectTasks.some(
        (t) =>
          t.backlogState === 'ready' &&
          (t.sprintId == null || t.sprintId === '') &&
          (t.itemType === 'epic' || t.itemType === 'feature'),
      ),
    [projectTasks],
  )

  const sprintBacklog = useMemo(
    () =>
      !activeSprint?.id
        ? []
        : projectTasks.filter((t) => t.sprintId === activeSprint.id),
    [projectTasks, activeSprint?.id],
  )

  const canPlan = !!user?.id && !!activeProject?.id && !!activeSprint?.id

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
    if (!user?.id) return
    setTasks((prev) => {
      const list = Array.isArray(prev) ? prev : []
      const next = list.map((task) => {
        if (task.id !== taskId) return task
        if (shouldAssign) {
          return {
            ...task,
            sprintId: activeSprint?.id ?? null,
            sprintNumber: activeSprint?.sprint_number ?? null,
            sprintCommittedAt: Date.now(),
          }
        }
        return {
          ...task,
          sprintId: null,
          sprintNumber: null,
          sprintCommittedAt: null,
        }
      })
      void (async () => {
        await saveTasks(next, user.id)
        await broadcastUpdatedTasks(next)
      })()
      return next
    })
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
                {activeSprint.sprint_goal || '—'}
              </p>
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
                      {getStoryPoints(task) != null ? (
                        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300">
                          SP: {getStoryPoints(task)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                      Assignee: {task.assignee || 'Unassigned'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!canPlan}
                    onClick={() => updateTaskSprint(task.id, true)}
                    className="shrink-0 rounded-md bg-emerald-500/20 px-2 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
                  >
                    Add to Sprint
                  </button>
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
                    </div>
                    <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                      Assignee: {task.assignee || 'Unassigned'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!canPlan}
                    onClick={() => updateTaskSprint(task.id, false)}
                    className="shrink-0 rounded-md bg-rose-500/15 px-2 py-1 text-xs font-medium text-rose-300 hover:bg-rose-500/25 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  )
}

