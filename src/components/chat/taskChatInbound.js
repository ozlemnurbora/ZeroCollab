import { saveMessage } from './chatStorage.js'
import {
  isTaskChatMessage,
  shouldAcceptIncomingTaskChatMessage,
} from '../../utils/taskChatUtils.js'

/** @deprecated Use isTaskChatMessage from taskChatUtils — kept for existing imports. */
export const isTaskChatPayload = isTaskChatMessage

/**
 * Persist a peer/hub task-chat message into this user's IndexedDB store (ownerUserId = current user).
 * Does not require incoming.ownerUserId to match currentUserId.
 */
export async function persistIncomingTaskChatIfEligible(
  incoming,
  currentUserId,
  memberProjectIds,
  activeProjectId,
) {
  if (!currentUserId || !incoming?.id) return false
  if (!isTaskChatMessage(incoming)) return false
  if (!shouldAcceptIncomingTaskChatMessage(incoming, memberProjectIds, activeProjectId)) {
    if (import.meta.env.DEV) {
      console.log('[TaskChat] skipped persist: project not allowed', {
        projectId: incoming.projectId ?? incoming.project_id,
      })
    }
    return false
  }

  const pid = incoming.projectId ?? incoming.project_id
  const toStore = {
    ...incoming,
    projectId: pid,
    taskId: incoming.taskId ?? incoming.task_id,
    ownerUserId: currentUserId,
  }
  await saveMessage(toStore, currentUserId)
  if (import.meta.env.DEV) {
    console.log('[TaskChat] saved locally', {
      id: toStore.id,
      taskId: toStore.taskId,
      projectId: toStore.projectId,
    })
  }
  return true
}
