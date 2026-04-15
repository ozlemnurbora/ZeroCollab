import { supabase } from './supabase.js'
import { connectToPeer, disconnectPeer, getPeerId } from './p2pManager.js'

let activeChannel = null
let currentProjectId = null
let currentUserId = null
let currentUserEmail = null
let joinVersion = 0
/** @type {Map<string, number>} */
const connectAttemptAt = new Map()

function canAttemptConnect(remotePeerId) {
  const now = Date.now()
  const last = connectAttemptAt.get(remotePeerId) ?? 0
  if (now - last < 2000) return false
  connectAttemptAt.set(remotePeerId, now)
  return true
}

function maybeConnectPeer(remotePeerId, remoteUserId, userId) {
  if (!remotePeerId || remoteUserId === userId || remotePeerId === getPeerId()) return
  if (!canAttemptConnect(remotePeerId)) return
  console.log('[Hub] Auto-connecting to peer:', remotePeerId)
  void connectToPeer(remotePeerId).catch((err) =>
    console.error('[Hub] Auto-connect failed:', err),
  )
}

export async function joinProjectHub(projectId, userId, userEmail) {
  const myJoinVersion = ++joinVersion
  // Leave existing channel if any
  if (activeChannel) {
    await supabase.removeChannel(activeChannel)
    activeChannel = null
  }

  currentProjectId = projectId
  currentUserId = userId
  currentUserEmail = userEmail

  const channelName = `project:${projectId}`

  activeChannel = supabase.channel(channelName, {
    config: { presence: { key: userId } },
  })

  // Track presence - who is online
  activeChannel.on('presence', { event: 'sync' }, () => {
    if (myJoinVersion !== joinVersion || !activeChannel) return
    const state = activeChannel.presenceState()
    console.log('[Hub] presence sync:', Object.keys(state))

    // Auto-connect to peers who are online in same project
    Object.values(state).forEach((presences) => {
      presences.forEach((presence) => {
        maybeConnectPeer(presence.peerId, presence.userId, userId)
      })
    })
    window.dispatchEvent(new CustomEvent('hub:presence-sync', { detail: state }))
  })

  // When someone joins, connect to them
  activeChannel.on('presence', { event: 'join' }, ({ newPresences }) => {
    if (myJoinVersion !== joinVersion || !activeChannel) return
    newPresences.forEach((presence) => {
      const remotePeerId = presence.peerId
      const remoteUserId = presence.userId
      maybeConnectPeer(remotePeerId, remoteUserId, userId)
      window.dispatchEvent(new CustomEvent('hub:peer-joined', {
        detail: { peerId: remotePeerId, userId: remoteUserId },
      }))
    })
  })

  activeChannel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
    if (myJoinVersion !== joinVersion || !activeChannel) return
    leftPresences.forEach((presence) => {
      if (presence?.peerId) {
        disconnectPeer(presence.peerId)
      }
      window.dispatchEvent(new CustomEvent('hub:peer-left', {
        detail: { peerId: presence.peerId, userId: presence.userId },
      }))
    })
  })

  // Broadcast messages through hub
  activeChannel.on('broadcast', { event: 'message' }, ({ payload }) => {
    if (myJoinVersion !== joinVersion) return
    if (payload.senderId !== userId) {
      // Emit to p2p message listeners
      const event = new CustomEvent('hub:message', { detail: payload })
      window.dispatchEvent(event)
    }
  })

  activeChannel.on('broadcast', { event: 'call-invite' }, ({ payload }) => {
    if (myJoinVersion !== joinVersion) return
    const event = new CustomEvent('hub:call-invite', { detail: payload })
    window.dispatchEvent(event)
  })

  activeChannel.on('broadcast', { event: 'call-response' }, ({ payload }) => {
    if (myJoinVersion !== joinVersion) return
    const event = new CustomEvent('hub:call-response', { detail: payload })
    window.dispatchEvent(event)
  })

  activeChannel.on('broadcast', { event: 'call-participants' }, ({ payload }) => {
    if (myJoinVersion !== joinVersion) return
    const event = new CustomEvent('hub:call-participants', { detail: payload })
    window.dispatchEvent(event)
  })

  activeChannel.on('broadcast', { event: 'meeting-sync' }, ({ payload }) => {
    if (myJoinVersion !== joinVersion) return
    const event = new CustomEvent('hub:meeting-sync', { detail: payload })
    window.dispatchEvent(event)
  })

  activeChannel.on('broadcast', { event: 'meeting-update' }, ({ payload }) => {
    if (myJoinVersion !== joinVersion) return
    console.log('[Hub] meeting-update received:', payload)
    const event = new CustomEvent('hub:meeting-update', { detail: payload })
    window.dispatchEvent(event)
  })

  activeChannel.on('broadcast', { event: 'project-deleted' }, ({ payload }) => {
    if (myJoinVersion !== joinVersion) return
    const event = new CustomEvent('hub:project-deleted', { detail: payload })
    window.dispatchEvent(event)
  })

  // Subscribe and track presence
  await activeChannel.subscribe(async (status) => {
    if (myJoinVersion !== joinVersion || !activeChannel) return
    if (status === 'SUBSCRIBED') {
      const myPeerId = getPeerId()
      await activeChannel.track({
        userId,
        userEmail,
        peerId: myPeerId,
        joinedAt: new Date().toISOString(),
      })
      console.log('[Hub] Joined project channel:', channelName)
    }
  })

  return activeChannel
}

export async function leaveProjectHub() {
  if (activeChannel) {
    await supabase.removeChannel(activeChannel)
    activeChannel = null
  }
  connectAttemptAt.clear()
  currentProjectId = null
  currentUserId = null
  currentUserEmail = null
}

export async function broadcastProjectDeleted(projectId) {
  if (!activeChannel) return
  await activeChannel.send({
    type: 'broadcast',
    event: 'project-deleted',
    payload: { projectId },
  })
  console.log('[Hub] broadcast project deleted:', projectId)
}

export async function broadcastMessage(message) {
  if (!activeChannel) return
  await activeChannel.send({
    type: 'broadcast',
    event: 'message',
    payload: {
      ...message,
      senderId: currentUserId,
      senderEmail: currentUserEmail,
      projectId: currentProjectId,
    },
  })
}

export async function broadcastCallInvite(
  projectId,
  callerEmail,
  callerPeerId,
  existingParticipants,
) {
  if (!activeChannel) return
  const participants =
    Array.isArray(existingParticipants) && existingParticipants.length > 0
      ? existingParticipants
      : [callerPeerId]
  await activeChannel.send({
    type: 'broadcast',
    event: 'call-invite',
    payload: {
      projectId,
      callerEmail,
      callerPeerId,
      existingParticipants: participants,
      timestamp: Date.now(),
    },
  })
   
  console.log('[Hub] broadcast call invite')
}

export async function broadcastCallResponse(accepted, responderPeerId, callerPeerId) {
  if (!activeChannel) return
  await activeChannel.send({
    type: 'broadcast',
    event: 'call-response',
    payload: { accepted, responderPeerId, callerPeerId, timestamp: Date.now() },
  })
}

export async function broadcastCallParticipants(participants) {
  if (!activeChannel) return
  await activeChannel.send({
    type: 'broadcast',
    event: 'call-participants',
    payload: { participants, timestamp: Date.now() },
  })
}

export async function broadcastMeeting(meeting) {
  if (!activeChannel) return
  await activeChannel.send({
    type: 'broadcast',
    event: 'meeting-sync',
    payload: { meeting, action: 'upsert' },
  })
  console.log('[Hub] broadcast meeting:', meeting.id)
}

export async function broadcastMeetingDelete(meetingId) {
  if (!activeChannel) return
  await activeChannel.send({
    type: 'broadcast',
    event: 'meeting-sync',
    payload: { meetingId, action: 'delete' },
  })
  console.log('[Hub] broadcast meeting delete:', meetingId)
}

export async function broadcastTaskSync(tasks, projectId) {
  if (!activeChannel) return
  await activeChannel.send({
    type: 'broadcast',
    event: 'message',
    payload: {
      action: 'task-sync',
      tasks,
      projectId,
      senderId: currentUserId,
    },
  })
  console.log('[Hub] broadcast task sync:', tasks.length)
}

export async function broadcastMeetingSync(meeting, action, projectId) {
  if (!activeChannel) return
  await activeChannel.send({
    type: 'broadcast',
    event: 'message',
    payload: {
      action: 'meeting-sync',
      meeting,
      meetingId: meeting?.id,
      meetingAction: action,
      projectId,
      senderId: currentUserId,
    },
  })
  console.log('[Hub] broadcast meeting sync:', action)
}

export async function broadcastMeetingUpdate(meeting, meetingAction, projectId) {
  if (!activeChannel) return
  await activeChannel.send({
    type: 'broadcast',
    event: 'meeting-update',
    payload: {
      meeting,
      meetingId: meeting?.id,
      meetingAction,
      projectId,
    },
  })
  console.log('[Hub] sent meeting-update:', meetingAction, meeting?.id)
}

export function getOnlineMembers() {
  if (!activeChannel) return []
  const state = activeChannel.presenceState()
  return Object.values(state).flat()
}
