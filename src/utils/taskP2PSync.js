export function tasksForP2PBroadcast(tasks) {
  const list = Array.isArray(tasks) ? tasks : []
  return list.filter((t) => t && (t.calendarType === 'general' || !t.calendarType))
}

export function mergeTasksFromSync(localTasks, incomingTasks) {
  const local = Array.isArray(localTasks) ? localTasks : []
  if (!Array.isArray(incomingTasks)) return local
  const personalTasks = local.filter((t) => t && t.calendarType === 'personal')
  const generalTasks = incomingTasks.filter((t) => t && t.calendarType !== 'personal')
  return [...personalTasks, ...generalTasks]
}
