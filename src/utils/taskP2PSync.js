export function tasksForP2PBroadcast(tasks) {
  const list = Array.isArray(tasks) ? tasks : []
  return list.filter((t) => t && t.calendarType === 'general')
}

export function mergeTasksFromSync(localTasks, incomingTasks) {
  const local = Array.isArray(localTasks) ? localTasks : []
  if (!Array.isArray(incomingTasks)) return local
  // Keep local non-general tasks (personal + missing calendarType treated as personal)
  const personalTasks = local.filter((t) => t && t.calendarType !== 'general')
  const generalTasks = incomingTasks.filter((t) => t && t.calendarType === 'general')
  return [...personalTasks, ...generalTasks]
}
