import { replaceTasksForOwner, getTasksForOwner } from '../../utils/database.js'

export async function loadTasks(ownerUserId) {
  try {
    if (!ownerUserId) return []
    const tasks = await getTasksForOwner(ownerUserId)
    return Array.isArray(tasks) ? tasks : []
  } catch {
    return []
  }
}

export async function saveTasks(tasks, ownerUserId) {
  try {
    if (!ownerUserId) return
    await replaceTasksForOwner(ownerUserId, tasks)
  } catch {
    // ignore storage errors
  }
}

export async function pruneSharedTasksByProjectIds(projectIds, ownerUserId) {
  if (!ownerUserId) return
  const ids = new Set(Array.isArray(projectIds) ? projectIds.filter(Boolean) : [])
  if (ids.size === 0) return
  const current = await loadTasks(ownerUserId)
  const next = current.filter((task) => {
    if (!task?.projectId) return true
    if (task.calendarType !== 'general') return true
    return !ids.has(task.projectId)
  })
  if (next.length !== current.length) {
    await saveTasks(next, ownerUserId)
  }
}
