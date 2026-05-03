import { useEffect, useRef } from 'react'
import { useAuth } from '../../utils/AuthContext.jsx'
import { useWorkspace } from '../../utils/WorkspaceContext.jsx'
import { on, P2P_EVENTS } from '../../utils/p2pManager.js'
import {
  isTaskChatPayload,
  persistIncomingTaskChatIfEligible,
} from './taskChatInbound.js'

/**
 * Keeps task-scoped chat durable for every signed-in route: persists incoming
 * P2P/hub task-chat messages for all projects the user belongs to (not only when Kanban/Chat is mounted).
 */
export function TaskChatInboundSync() {
  const { user } = useAuth()
  const { memberProjectIds = [], activeProject } = useWorkspace()
  const userId = user?.id ?? null

  const memberIdsRef = useRef(memberProjectIds)
  const activePidRef = useRef(activeProject?.id ?? null)
  memberIdsRef.current = memberProjectIds
  activePidRef.current = activeProject?.id ?? null

  useEffect(() => {
    if (!userId) return
    const off = on(P2P_EVENTS.MESSAGE, ({ data }) => {
      if (data?.type !== 'chat-message') return
      const payload = data.payload
      if (!isTaskChatPayload(payload)) return
      if (import.meta.env.DEV) {
        console.log('[TaskChat] received peer message', {
          id: payload.id,
          taskId: payload.taskId,
          projectId: payload.projectId ?? payload.project_id,
        })
      }
      void persistIncomingTaskChatIfEligible(
        payload,
        userId,
        memberIdsRef.current,
        activePidRef.current,
      )
    })
    return () => off()
  }, [userId])

  useEffect(() => {
    if (!userId) return
    const onHub = (e) => {
      const msg = e.detail
      if (!msg || msg.action === 'task-sync' || msg.action === 'task-delete') return
      if (!isTaskChatPayload(msg)) return
      if (import.meta.env.DEV) {
        console.log('[TaskChat] received hub message', {
          id: msg.id,
          taskId: msg.taskId,
          projectId: msg.projectId ?? msg.project_id,
        })
      }
      void persistIncomingTaskChatIfEligible(msg, userId, memberProjectIds, activeProject?.id ?? null)
    }
    window.addEventListener('hub:message', onHub)
    return () => window.removeEventListener('hub:message', onHub)
  }, [userId, memberProjectIds, activeProject?.id])

  return null
}
