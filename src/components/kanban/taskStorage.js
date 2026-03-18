import { TASKS_STORAGE_KEY } from './kanbanConstants.js'

export function loadTasks() {
  try {
    const raw = localStorage.getItem(TASKS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveTasks(tasks) {
  try {
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks))
  } catch {
    // ignore storage errors (quota, privacy mode, etc.)
  }
}

