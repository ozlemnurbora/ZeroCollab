function hasNonEmptySprintId(task) {
  const sprintId = task?.sprintId
  return !(sprintId == null || sprintId === '')
}

export function isTaskInActiveSprint(task, activeProjectId, activeSprintId) {
  if (!task || !activeProjectId || !activeSprintId) return false
  if (task.projectId !== activeProjectId) return false
  if (!hasNonEmptySprintId(task)) return false
  return String(task.sprintId) === String(activeSprintId)
}

export function getNormalizedTaskStatus(task) {
  return String(task?.status || '').toLowerCase()
}

