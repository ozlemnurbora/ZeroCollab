/**
 * P2P task sync helpers. Only tasks with calendarType === 'personal' stay local-only.
 * All others (general or missing field) participate in TASK_SYNC.
 */

export function tasksForP2PBroadcast(tasks) {
  return (Array.isArray(tasks) ? tasks : []).filter((t) => t && t.calendarType !== 'personal')
}

export function mergeTasksFromSync(prevTasks, incomingList) {
  const prev = Array.isArray(prevTasks) ? prevTasks : []
  const personalTasks = prev.filter((t) => t && t.calendarType === 'personal')
  const generalTasks = (Array.isArray(incomingList) ? incomingList : []).filter(
    (t) => t && t.calendarType !== 'personal',
  )
  return [...personalTasks, ...generalTasks]
}
