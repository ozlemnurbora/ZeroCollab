import { supabase } from './supabase.js'
import { connectToPeer, getPeerId } from './p2pManager.js'

let activeChannel = null
let currentProjectId = null
let currentUserId = null
let currentUserEmail = null

export async function joinProjectHub(projectId, userId, userEmail) {
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
    const state = activeChannel.presenceState()
    console.log('[Hub] presence sync:', Object.keys(state))

    // Auto-connect to peers who are online in same project
    Object.values(state).forEach((presences) => {
      presences.forEach((presence) => {
        const remotePeerId = presence.peerId
        const remoteUserId = presence.userId
        if (remotePeerId && remoteUserId !== userId && remotePeerId !== getPeerId()) {
          console.log('[Hub] Auto-connecting to peer:', remotePeerId)
          connectToPeer(remotePeerId).catch((err) =>
            console.error('[Hub] Auto-connect failed:', err),
          )
        }
      })
    })
  })

  // When someone joins, connect to them
  activeChannel.on('presence', { event: 'join' }, ({ newPresences }) => {
    newPresences.forEach((presence) => {
      const remotePeerId = presence.peerId
      const remoteUserId = presence.userId
      if (remotePeerId && remoteUserId !== userId) {
        console.log('[Hub] New peer joined:', remotePeerId)
        connectToPeer(remotePeerId).catch((err) => console.error('[Hub] Connect failed:', err))
      }
    })
  })

  // Broadcast messages through hub
  activeChannel.on('broadcast', { event: 'message' }, ({ payload }) => {
    if (payload.senderId !== userId) {
      // Emit to p2p message listeners
      const event = new CustomEvent('hub:message', { detail: payload })
      window.dispatchEvent(event)
    }
  })

  activeChannel.on('broadcast', { event: 'call-invite' }, ({ payload }) => {
    const event = new CustomEvent('hub:call-invite', { detail: payload })
    window.dispatchEvent(event)
  })

  activeChannel.on('broadcast', { event: 'call-response' }, ({ payload }) => {
    const event = new CustomEvent('hub:call-response', { detail: payload })
    window.dispatchEvent(event)
  })

  activeChannel.on('broadcast', { event: 'call-participants' }, ({ payload }) => {
    const event = new CustomEvent('hub:call-participants', { detail: payload })
    window.dispatchEvent(event)
  })

  activeChannel.on('broadcast', { event: 'meeting-sync' }, ({ payload }) => {
    const event = new CustomEvent('hub:meeting-sync', { detail: payload })
    window.dispatchEvent(event)
  })

  // Subscribe and track presence
  await activeChannel.subscribe(async (status) => {
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
  // eslint-disable-next-line no-console
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

export function getOnlineMembers() {
  if (!activeChannel) return []
  const state = activeChannel.presenceState()
  return Object.values(state).flat()
}
