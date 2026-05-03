import { saveMessage } from './chatStorage.js'

export function isTaskChatPayload(m) {
  if (!m || m.kind !== 'task-chat') return false
  const tid = m.taskId ?? m.task_id
  if (tid == null || String(tid).trim() === '') return false
  const pid = m.projectId ?? m.project_id
  if (pid == null || String(pid).trim() === '') return false
  return true
}

/**
 * True if the message targets a project the user may access (member list or current project).
 */
export function projectIdAllowedForTaskChat(projectId, memberProjectIds, activeProjectId) {
  const ps = String(projectId ?? '')
  if (!ps) return false
  const list = Array.isArray(memberProjectIds) ? memberProjectIds : []
  for (const id of list) {
    if (String(id) === ps) return true
  }
  if (activeProjectId != null && String(activeProjectId) === ps) return true
  return false
}

/**
 * Persist a peer/hub task-chat message into this user's IndexedDB store (ownerUserId = current user).
 * Does not mutate the original object shape beyond stamping ids for storage.
 */
export async function persistIncomingTaskChatIfEligible(
  incoming,
  currentUserId,
  memberProjectIds,
  activeProjectId,
) {
  if (!currentUserId || !incoming?.id) return false
  if (!isTaskChatPayload(incoming)) return false
  const pid = incoming.projectId ?? incoming.project_id
  if (!projectIdAllowedForTaskChat(pid, memberProjectIds, activeProjectId)) {
    if (import.meta.env.DEV) {
      console.log('[TaskChat] skipped persist: project not in membership', {
        projectId: pid,
        memberCount: Array.isArray(memberProjectIds) ? memberProjectIds.length : 0,
      })
    }
    return false
  }

  const toStore = {
    ...incoming,
    projectId: pid,
    taskId: incoming.taskId ?? incoming.task_id,
    ownerUserId: currentUserId,
  }
  await saveMessage(toStore, currentUserId)
  if (import.meta.env.DEV) {
    console.log('[TaskChat] saved incoming message locally', {
      id: toStore.id,
      taskId: toStore.taskId,
      projectId: toStore.projectId,
    })
  }
  return true
}
