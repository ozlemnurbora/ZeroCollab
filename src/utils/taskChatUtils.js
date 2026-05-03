/**
 * Pure helpers for task-scoped chat (no IndexedDB / network).
 * Shared visibility is by projectId + taskId, not by message.ownerUserId.
 */

/** True when message is a well-formed task-chat row (kind + task + project). */
export function isTaskChatMessage(message) {
  if (!message || message.kind !== 'task-chat') return false
  const tid = message.taskId ?? message.task_id
  if (tid == null || String(tid).trim() === '') return false
  const pid = message.projectId ?? message.project_id
  if (pid == null || String(pid).trim() === '') return false
  return true
}

/** Task thread filter: same task id and same project id (string-safe). */
export function isTaskChatMessageForTask(message, taskId, projectId) {
  if (!isTaskChatMessage(message)) return false
  if (String(message.taskId ?? message.task_id ?? '') !== String(taskId ?? '')) return false
  const mp = message.projectId ?? message.project_id
  const tp = projectId ?? null
  return String(mp ?? '') === String(tp ?? '')
}

/**
 * Project membership gate for accepting an incoming task-chat into this client.
 * Does not inspect ownerUserId / senderUserId — only project access.
 */
export function projectIdAllowedForTaskChat(projectId, memberProjectIds, activeProjectId = null) {
  const ps = String(projectId ?? '')
  if (!ps) return false
  const list = Array.isArray(memberProjectIds) ? memberProjectIds : []
  for (const id of list) {
    if (String(id) === ps) return true
  }
  if (activeProjectId != null && String(activeProjectId) === ps) return true
  return false
}

export function shouldAcceptIncomingTaskChatMessage(
  message,
  memberProjectIds,
  activeProjectId = null,
) {
  if (!isTaskChatMessage(message)) return false
  const pid = message.projectId ?? message.project_id
  return projectIdAllowedForTaskChat(pid, memberProjectIds, activeProjectId)
}

/**
 * Merge two message lists by id (incoming overwrites same id), then sort by createdAt ascending.
 */
export function mergeTaskChatMessages(existingMessages, incomingMessages) {
  const byId = new Map()
  for (const m of Array.isArray(existingMessages) ? existingMessages : []) {
    if (m?.id != null && String(m.id).trim() !== '') byId.set(String(m.id), m)
  }
  for (const m of Array.isArray(incomingMessages) ? incomingMessages : []) {
    if (m?.id != null && String(m.id).trim() !== '') byId.set(String(m.id), m)
  }
  return Array.from(byId.values()).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
}
