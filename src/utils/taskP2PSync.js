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
  if (!Array.isArray(incomingTasks)) return local

  const personalTasks = local.filter((t) => t && t.calendarType !== 'general')
  const localGeneral = local.filter((t) => t && t.calendarType === 'general')

  const incomingFiltered = incomingTasks.filter((t) =>
    matchesProjectForSync(t, activeProject),
  )

  if (!activeProject?.id) {
    const byId = new Map()
    for (const t of localGeneral) byId.set(t.id, t)
    for (const t of incomingFiltered) byId.set(t.id, t)
    return [...personalTasks, ...byId.values()]
  }

  const otherProjectGeneral = localGeneral.filter(
    (t) => t.projectId && t.projectId !== activeProject.id,
  )
  const sameProjectGeneral = localGeneral.filter(
    (t) => !t.projectId || t.projectId === activeProject.id,
  )

  const byId = new Map()
  for (const t of sameProjectGeneral) byId.set(t.id, t)
  for (const t of incomingFiltered) byId.set(t.id, t)

  return [...personalTasks, ...byId.values(), ...otherProjectGeneral]
}
