/** General tasks included in P2P when no project is focused (legacy + all projects). */
function matchesProjectForSync(task, activeProject) {
  if (!task || task.calendarType !== 'general') return false
  if (!activeProject?.id) return true
  if (!task.projectId) return true
  return task.projectId === activeProject.id
}

export function tasksForP2PBroadcast(tasks, activeProject) {
  const list = Array.isArray(tasks) ? tasks : []
  return list.filter((t) => matchesProjectForSync(t, activeProject))
}

export function mergeTasksFromSync(localTasks, incomingTasks, activeProject) {
  const local = Array.isArray(localTasks) ? localTasks : []
  const incoming = Array.isArray(incomingTasks) ? incomingTasks : []
  const personalTasks = local.filter((t) => t?.calendarType === 'personal')
  const incomingGeneral = incoming
    .filter((t) => t?.calendarType === 'general' || !t?.calendarType)
    .filter(
      (t) =>
        !activeProject?.id || !t?.projectId || t.projectId === activeProject.id,
    )
  return [...personalTasks, ...incomingGeneral]
}
