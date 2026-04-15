import { getTasks, putTasks } from '../../utils/database.js'

export async function loadTasks() {
  try {
    const tasks = await getTasks()
    return Array.isArray(tasks) ? tasks : []
  } catch {
    return []
  }
}

export async function saveTasks(tasks) {
  try {
    await putTasks(tasks)
  } catch {
    // ignore storage errors
  }
}

export async function pruneSharedTasksByProjectIds(projectIds) {
  const ids = new Set(Array.isArray(projectIds) ? projectIds.filter(Boolean) : [])
  if (ids.size === 0) return
  const current = await loadTasks()
  const next = current.filter((task) => {
    if (!task?.projectId) return true
    if (task.calendarType !== 'general') return true
    return !ids.has(task.projectId)
  })
  if (next.length !== current.length) {
    await saveTasks(next)
  }
}

