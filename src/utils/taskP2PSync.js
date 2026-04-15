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
  if (!task || task.calendarType === 'general') return false
  if (task.projectId) return false
  if (!currentUserId) return !task.ownerUserId
  return !task.ownerUserId || task.ownerUserId === currentUserId
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
    isOwnedPersonalTask(task, currentUserId),
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

export function filterTasksForVisibility(tasks, options = {}) {
  const list = Array.isArray(tasks) ? tasks : []
  const { allowedProjectIds = [], currentUserId = null } = options
  const allowed = normalizeSet(allowedProjectIds)
  return list.filter(
    (task) =>
      isOwnedPersonalTask(task, currentUserId) ||
      isAuthorizedProjectTask(task, allowed),
  )
}
