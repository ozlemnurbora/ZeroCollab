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

