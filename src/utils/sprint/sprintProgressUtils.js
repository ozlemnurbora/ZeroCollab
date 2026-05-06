import { isTaskDeleted } from '../../components/kanban/taskStorage.js'

export function normalizeSprintId(value) {
  if (value == null) return null
  const s = String(value).trim()
  return s ? s : null
}

function normalizeStatus(value) {
  if (value == null) return 'todo'
  const raw = String(value).trim()
  const low = raw.toLowerCase()
  if (low === 'done') return 'done'
  if (low === 'in_progress' || low === 'in progress' || low === 'inprogress' || low === 'in-progress')
    return 'in_progress'
  if (low === 'in_review' || low === 'in review' || low === 'inreview' || low === 'in-review')
    return 'in_review'
  if (low === 'todo' || low === 'to do' || low === 'to-do') return 'todo'
  return low
}

export function getTasksForActiveSprint(tasks, activeSprint, projectId) {
  const list = Array.isArray(tasks) ? tasks : []
  const pid = projectId == null ? null : String(projectId)
  if (!activeSprint || !pid) return []

  const sprintIdA = normalizeSprintId(activeSprint.id)
  const sprintIdB = normalizeSprintId(activeSprint.sprintId)
  const candidates = new Set([sprintIdA, sprintIdB].filter(Boolean))
  if (candidates.size === 0) return []

  return list.filter((t) => {
    if (!t || isTaskDeleted(t)) return false
    if (String(t.projectId ?? '') !== pid) return false

    const tSprintId = normalizeSprintId(t.sprintId)
    const tSprint_id = normalizeSprintId(t.sprint_id)
    const tActive = normalizeSprintId(t.activeSprintId)

    if (tSprintId && candidates.has(tSprintId)) return true
    if (tSprint_id && candidates.has(tSprint_id)) return true
    if (tActive && candidates.has(tActive)) return true

    if (t.committedToSprint === true) return true
    if (t.inSprint === true) return true

    return false
  })
}

export function calculateSprintProgress(tasks, activeSprint, projectId) {
  const sprintTasks = getTasksForActiveSprint(tasks, activeSprint, projectId)
  const totalTasks = sprintTasks.length

  let completedTasks = 0
  let inProgressTasks = 0
  let inReviewTasks = 0

  for (const t of sprintTasks) {
    const s = normalizeStatus(t?.status)
    if (s === 'done') completedTasks += 1
    else if (s === 'in_progress') inProgressTasks += 1
    else if (s === 'in_review') inReviewTasks += 1
  }

  const completionPercent =
    totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100)

  return {
    sprintTasks,
    totalTasks,
    completedTasks,
    inProgressTasks,
    inReviewTasks,
    completionPercent,
  }
}

