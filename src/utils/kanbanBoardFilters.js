import { isTaskDeleted } from '../components/kanban/taskStorage.js'

/** True when task.sprintId is set (committed to a sprint). */
export function isSprintCommittedKanbanTask(task) {
  if (!task) return false
  const sid = task.sprintId
  return sid != null && String(sid).trim() !== ''
}

const list = (visibleProjectTasks) =>
  Array.isArray(visibleProjectTasks) ? visibleProjectTasks : []

/** Tasks on the active sprint (by sprint id). */
export function filterSprintTasksForActiveSprint(visibleProjectTasks, activeSprintId) {
  if (!activeSprintId) return []
  const sid = String(activeSprintId)
  return list(visibleProjectTasks).filter(
    (task) => task && String(task.sprintId) === sid,
  )
}

/**
 * Backlog column: not sprint-committed; backlog state New or Refined only
 * (Ready appears in All Tasks + Ready Backlog, not here).
 */
export function filterBacklogTasks(visibleProjectTasks) {
  return list(visibleProjectTasks).filter((task) => {
    if (!task) return false
    if (isSprintCommittedKanbanTask(task)) return false
    const bs = String(task.backlogState || 'new').toLowerCase()
    return ['new', 'refined'].includes(bs)
  })
}

/** Refinement session: Refined only, not sprint-committed. */
export function filterRefinementSessionTasks(visibleProjectTasks) {
  return list(visibleProjectTasks).filter((task) => {
    if (!task) return false
    if (isSprintCommittedKanbanTask(task)) return false
    return String(task.backlogState || '').toLowerCase() === 'refined'
  })
}

/** Ready backlog: Ready, same project, not sprint-committed, not deleted. */
export function filterReadyBacklogTasks(visibleProjectTasks, activeProjectId) {
  if (activeProjectId == null || String(activeProjectId).trim() === '') return []
  const pid = String(activeProjectId)
  return list(visibleProjectTasks).filter((task) => {
    if (!task || isTaskDeleted(task)) return false
    if (String(task.projectId ?? '') !== pid) return false
    if (isSprintCommittedKanbanTask(task)) return false
    return String(task.backlogState || '').toLowerCase() === 'ready'
  })
}

/** Sprint board variant: tasks in active project + active sprint. */
export function filterSprintBoardScopedTasks(visibleProjectTasks, activeProjectId, activeSprintId) {
  if (!activeProjectId || !activeSprintId) return []
  const pid = String(activeProjectId)
  const sid = String(activeSprintId)
  return list(visibleProjectTasks).filter((task) => {
    if (!task) return false
    // Must be in the active project
    if (String(task.projectId ?? '') !== pid) return false
    // Match by sprintId (various field names)
    if (String(task.sprintId ?? '') === sid) return true
    if (String(task.sprint_id ?? '') === sid) return true
    if (String(task.activeSprintId ?? '') === sid) return true
    // Also include tasks marked as committed to sprint
    if (task.inSprint === true || task.committedToSprint === true) return true
    return false
  })
}
