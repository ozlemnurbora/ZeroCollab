function normalizeSet(values) {
  return new Set(Array.isArray(values) ? values.filter(Boolean) : [])
}

function isGeneralTask(task) {
  return !!task && (task.calendarType === 'general' || !task.calendarType)
}

function isAuthorizedProjectTask(task, allowedProjectIds) {
  if (!isGeneralTask(task)) return false
  if (!task.projectId) return false
  return allowedProjectIds.has(task.projectId)
}

function isOwnedPersonalTask(task, currentUserId) {
  if (!task || isGeneralTask(task)) return false
  if (!currentUserId) return !task.ownerUserId
  return task.ownerUserId === currentUserId
}

/** Personal/custom tasks scoped to a project the user belongs to (excludes legacy null projectId). */
function isOwnedPersonalTaskInAllowedProjects(task, currentUserId, allowedProjectIds) {
  if (!isOwnedPersonalTask(task, currentUserId)) return false
  const allowed = normalizeSet(allowedProjectIds)
  if (!task.projectId) return false
  return allowed.has(task.projectId)
}

export function tasksForP2PBroadcast(tasks, options = {}) {
  const list = Array.isArray(tasks) ? tasks : []
  const { activeProjectId = null, allowedProjectIds = [] } = options
  const allowed = normalizeSet(allowedProjectIds)
  if (!activeProjectId || !allowed.has(activeProjectId)) return []
  return list.filter(
    (task) =>
      isGeneralTask(task) &&
      task.projectId === activeProjectId &&
      allowed.has(task.projectId),
  )
}

export function mergeTasksFromSync(localTasks, incomingTasks, options = {}) {
  const local = Array.isArray(localTasks) ? localTasks : []
  const incoming = Array.isArray(incomingTasks) ? incomingTasks : []
  const { allowedProjectIds = [], currentUserId = null } = options
  const allowed = normalizeSet(allowedProjectIds)

  const personalTasks = local.filter((task) =>
    isOwnedPersonalTaskInAllowedProjects(task, currentUserId, allowedProjectIds),
  )
  const mergedGeneralById = new Map()

  for (const task of local) {
    if (isAuthorizedProjectTask(task, allowed)) {
      mergedGeneralById.set(task.id, task)
    }
  }
  for (const task of incoming) {
    if (isAuthorizedProjectTask(task, allowed)) {
      mergedGeneralById.set(task.id, task)
    }
  }

  return [...personalTasks, ...mergedGeneralById.values()]
}

/** When a project is selected: general tasks in that project, or personal/custom owned by current user in that project. */
export function taskVisibleInActiveProject(task, activeProjectId, ownerUserId) {
  if (!activeProjectId) return true
  if (!task || task.projectId !== activeProjectId) return false
  if (isGeneralTask(task)) return true
  return !!ownerUserId && task.ownerUserId === ownerUserId
}

export function filterTasksForVisibility(tasks, options = {}) {
  const list = Array.isArray(tasks) ? tasks : []
  const { allowedProjectIds = [], currentUserId = null } = options
  const allowed = normalizeSet(allowedProjectIds)
  return list.filter(
    (task) =>
      isOwnedPersonalTaskInAllowedProjects(task, currentUserId, allowedProjectIds) ||
      isAuthorizedProjectTask(task, allowed),
  )
}

/** General/shared task deleted locally — safe to tell peers (same scope as project task sync). */
export function shouldBroadcastGeneralTaskDelete(task, allowedProjectIds = []) {
  if (!task?.id || !task.projectId) return false
  if (!isGeneralTask(task)) return false
  return normalizeSet(allowedProjectIds).has(task.projectId)
}

/** Incoming TASK_DELETE payload is for a project we are allowed to sync. */
export function canApplyIncomingTaskDelete(payload, allowedProjectIds = []) {
  const { taskId, projectId } = payload || {}
  const allowed = normalizeSet(allowedProjectIds)
  return !!(taskId && projectId && allowed.has(projectId))
}

/** Remove one general project task by id after an authorized delete event. */
export function removeAuthorizedGeneralTaskById(
  tasks,
  taskId,
  projectId,
  allowedProjectIds = [],
) {
  if (!canApplyIncomingTaskDelete({ taskId, projectId }, allowedProjectIds)) {
    return Array.isArray(tasks) ? tasks : []
  }
  const list = Array.isArray(tasks) ? tasks : []
  return list.filter(
    (t) =>
      !(t.id === taskId && t.projectId === projectId && isGeneralTask(t)),
  )
}
