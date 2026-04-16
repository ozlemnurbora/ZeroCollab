import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { loadSettings } from '../components/settings/settingsStorage.js'
import { useAuth } from './AuthContext.jsx'
import {
  P2P_EVENTS,
  connectToPeer,
  getConnectedPeers,
  getPeerId,
  getPeerInstance,
  initP2P,
  on as onP2PEvent,
  sendToAllPeers,
  sendToPeer,
} from './p2pManager.js'
import { getMeetingLifecycle } from './meetingLifecycle.js'

const MAX_ROOM_P2P_PARTICIPANTS = 6
const DEFAULT_STATUS = 'idle'
/** Prevent duplicate listeners / duplicate tiles for the same PeerJS MediaConnection */
const MEDIA_CALL_BOUND = '__zcMeetingMediaBound'

const MeetingSessionContext = createContext(null)

function shortenPeerId(peerId) {
  const id = String(peerId || '')
  if (!id) return 'Unknown'
  if (id.length <= 12) return id
  return `${id.slice(0, 6)}...${id.slice(-4)}`
}

function normalizeEmail(email) {
  const v = String(email || '').trim().toLowerCase()
  return v || ''
}

function usernameFromEmail(email) {
  const local = normalizeEmail(email).split('@')[0]
  return local || ''
}

function getStableUserKey(identity = {}) {
  const userId = String(identity.userId || '').trim()
  if (userId) return `uid:${userId}`
  const email = normalizeEmail(identity.email)
  if (email) return `email:${email}`
  const username = String(identity.username || '').trim().toLowerCase()
  if (username) return `uname:${username}`
  return ''
}

function getUserKey(identity = {}, peerId = '') {
  const userId = String(identity.userId || '').trim()
  if (userId) return `uid:${userId}`
  const email = normalizeEmail(identity.email)
  if (email) return `email:${email}`
  const username = String(identity.username || '').trim().toLowerCase()
  if (username) return `uname:${username}`
  return `peer:${peerId || 'unknown'}`
}

function displayNameFromIdentity(identity = {}, fallbackPeerId = '') {
  return (
    identity.displayName ||
    identity.username ||
    identity.email ||
    shortenPeerId(fallbackPeerId)
  )
}

function createParticipant(userKey, identity = {}, options = {}) {
  const now = Date.now()
  return {
    userKey,
    userId: identity.userId || '',
    email: normalizeEmail(identity.email),
    username: identity.username || '',
    displayName: identity.displayName || '',
    peerSessions: options.peerId ? [options.peerId] : [],
    hasActiveStream: Boolean(options.hasActiveStream),
    isLocal: Boolean(options.isLocal),
    joinedAt: options.joinedAt || now,
    lastSeenAt: now,
    activeInRoom: true,
  }
}

export function MeetingSessionProvider({ children }) {
  const { user } = useAuth()
  const [activeMeeting, setActiveMeeting] = useState(null)
  const [sessionStatus, setSessionStatus] = useState(DEFAULT_STATUS)
  const [error, setError] = useState('')
  const [isMeetingPageOpen, setIsMeetingPageOpen] = useState(false)
  const [localStream, setLocalStream] = useState(null)
  const [remoteStreams, setRemoteStreams] = useState(() => new Map())
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)
  const [isSharingScreen, setIsSharingScreen] = useState(false)
  const [roomMessages, setRoomMessages] = useState([])
  const [participantRegistry, setParticipantRegistry] = useState({})
  const [localIdentity, setLocalIdentity] = useState({
    userId: user?.id || '',
    displayName: '',
    username: usernameFromEmail(user?.email),
    email: normalizeEmail(user?.email),
  })

  const activeCallsRef = useRef(new Map())
  const localStreamRef = useRef(null)
  const activeMeetingRef = useRef(null)
  const inSessionRef = useRef(false)
  const screenTrackRef = useRef(null)
  const cameraTrackRef = useRef(null)
  const roomMessagesRef = useRef([])
  const roomMessageIdsRef = useRef(new Set())
  const participantByPeerRef = useRef(new Map())
  const roomPeerIdsRef = useRef(new Set())

  useEffect(() => {
    localStreamRef.current = localStream
  }, [localStream])

  useEffect(() => {
    activeMeetingRef.current = activeMeeting
  }, [activeMeeting])

  useEffect(() => {
    roomMessagesRef.current = roomMessages
  }, [roomMessages])

  useEffect(() => {
    let cancelled = false
    void loadSettings().then((settings) => {
      if (cancelled) return
      const displayName = settings?.profile?.displayName?.trim?.() || ''
      setLocalIdentity({
        userId: user?.id || '',
        displayName,
        username: usernameFromEmail(user?.email),
        email: normalizeEmail(user?.email),
      })
    })
    return () => {
      cancelled = true
    }
  }, [user?.email, user?.id])

  const upsertParticipant = useCallback((identity = {}, options = {}) => {
    const peerId = options.peerId || ''
    const normalizedIdentity = {
      userId: identity.userId || '',
      email: normalizeEmail(identity.email),
      username: identity.username || '',
      displayName: identity.displayName || '',
    }
    const stableKey = getStableUserKey(normalizedIdentity)

    setParticipantRegistry((prev) => {
      let next = { ...prev }
      const prevKeyForPeer = peerId ? participantByPeerRef.current.get(peerId) : null

      // Never create visible remote participants from raw peer/session identity.
      // If we have no stable identity yet, only update an already-mapped participant (if any).
      if (!options.isLocal && !stableKey) {
        if (peerId && prevKeyForPeer && next[prevKeyForPeer]) {
          const existing = next[prevKeyForPeer]
          const mergedPeerSessions = new Set(existing.peerSessions || [])
          mergedPeerSessions.add(peerId)
          next[prevKeyForPeer] = {
            ...existing,
            peerSessions: Array.from(mergedPeerSessions),
            hasActiveStream:
              options.hasActiveStream !== undefined
                ? options.hasActiveStream
                : existing.hasActiveStream,
            activeInRoom:
              options.activeInRoom !== undefined ? options.activeInRoom : existing.activeInRoom,
            lastSeenAt: Date.now(),
          }
          participantByPeerRef.current.set(peerId, prevKeyForPeer)
          return next
        }
        return prev
      }

      const userKey = stableKey || getUserKey(normalizedIdentity, peerId)

      // Same peer session upgraded identity (e.g. peer:… → email:…): merge into one canonical row
      if (peerId && prevKeyForPeer && prevKeyForPeer !== userKey) {
        const stale = next[prevKeyForPeer]
        if (stale) {
          const mergedBase = next[userKey] || createParticipant(userKey, normalizedIdentity, options)
          const sessions = new Set([
            ...(stale.peerSessions || []),
            ...(mergedBase.peerSessions || []),
            peerId,
          ])
          next[userKey] = {
            ...mergedBase,
            ...stale,
            userKey,
            userId: normalizedIdentity.userId || stale.userId || mergedBase.userId || '',
            email: normalizedIdentity.email || stale.email || mergedBase.email || '',
            username: normalizedIdentity.username || stale.username || mergedBase.username || '',
            displayName:
              normalizedIdentity.displayName ||
              stale.displayName ||
              mergedBase.displayName ||
              '',
            peerSessions: Array.from(sessions),
            isLocal: Boolean(stale.isLocal || mergedBase.isLocal || options.isLocal),
            activeInRoom: true,
            lastSeenAt: Date.now(),
          }
          delete next[prevKeyForPeer]
          for (const p of stale.peerSessions || []) {
            if (p) participantByPeerRef.current.set(p, userKey)
          }
        }
      }

      const existing = next[userKey] || createParticipant(userKey, normalizedIdentity, options)
      const mergedPeerSessions = new Set(existing.peerSessions || [])
      if (peerId) mergedPeerSessions.add(peerId)
      const nextEntry = {
        ...existing,
        userId: normalizedIdentity.userId || existing.userId || '',
        email: normalizedIdentity.email || existing.email || '',
        username: normalizedIdentity.username || existing.username || '',
        displayName: normalizedIdentity.displayName || existing.displayName || '',
        peerSessions: Array.from(mergedPeerSessions),
        hasActiveStream:
          options.hasActiveStream !== undefined
            ? options.hasActiveStream
            : existing.hasActiveStream,
        activeInRoom:
          options.activeInRoom !== undefined ? options.activeInRoom : true,
        isLocal: existing.isLocal || Boolean(options.isLocal),
        joinedAt: existing.joinedAt || options.joinedAt || Date.now(),
        lastSeenAt: Date.now(),
      }
      if (peerId) {
        participantByPeerRef.current.set(peerId, userKey)
      }
      return { ...next, [userKey]: nextEntry }
    })
  }, [])

  const markPeerStreamActive = useCallback((peerId, active) => {
    if (!peerId) return
    const userKey = participantByPeerRef.current.get(peerId)
    if (!userKey) return
    setParticipantRegistry((prev) => {
      const existing = prev[userKey]
      if (!existing) return prev
      if (existing.hasActiveStream === Boolean(active)) return prev
      return {
        ...prev,
        [userKey]: {
          ...existing,
          hasActiveStream: Boolean(active),
          lastSeenAt: Date.now(),
        },
      }
    })
  }, [])

  const removePeerSession = useCallback((peerId) => {
    if (!peerId) return
    activeCallsRef.current.delete(peerId)
    setRemoteStreams((prev) => {
      const next = new Map(prev)
      next.delete(peerId)
      return next
    })
    setParticipantRegistry((prev) => {
      const userKey = participantByPeerRef.current.get(peerId)
      if (!userKey || !prev[userKey]) return prev
      const nextEntry = { ...prev[userKey] }
      nextEntry.peerSessions = (nextEntry.peerSessions || []).filter((id) => id !== peerId)
      nextEntry.lastSeenAt = Date.now()
      participantByPeerRef.current.delete(peerId)

      if (!nextEntry.isLocal && nextEntry.peerSessions.length === 0) {
        const rest = { ...prev }
        delete rest[userKey]
        return rest
      }
      // If they no longer have any active session with a stream, clear the streaming flag.
      const stillStreaming = (nextEntry.peerSessions || []).some((id) => remoteStreams.has(id))
      nextEntry.hasActiveStream = Boolean(nextEntry.isLocal ? localStream : stillStreaming)
      return { ...prev, [userKey]: nextEntry }
    })
  }, [localStream, remoteStreams])

  const replaceOutgoingVideoTrack = useCallback((track) => {
    for (const mediaCall of activeCallsRef.current.values()) {
      const senders = mediaCall?.peerConnection?.getSenders?.() ?? []
      const videoSender = senders.find((sender) => sender?.track?.kind === 'video')
      if (videoSender) {
        void videoSender.replaceTrack(track)
      }
    }
  }, [])

  const wireMediaCall = useCallback((mediaCall, peerId) => {
    if (!mediaCall || !peerId) return
    if (mediaCall[MEDIA_CALL_BOUND]) return
    mediaCall[MEDIA_CALL_BOUND] = true

    const existingMc = activeCallsRef.current.get(peerId)
    if (existingMc && existingMc !== mediaCall) {
      try {
        existingMc.close()
      } catch {
        // ignore
      }
    }
    activeCallsRef.current.set(peerId, mediaCall)

    mediaCall.on('stream', (stream) => {
      setRemoteStreams((prev) => new Map(prev).set(peerId, stream))
      // Streams do not create visible participants. Only identity-bearing events may.
      // If we already know who this peer belongs to, mark their canonical participant as streaming.
      markPeerStreamActive(peerId, true)
    })
    mediaCall.on('close', () => removePeerSession(peerId))
    mediaCall.on('error', () => removePeerSession(peerId))
  }, [markPeerStreamActive, removePeerSession])

  const placeRoomCall = useCallback((peerId) => {
    const meeting = activeMeetingRef.current
    if (!meeting || !peerId || !localStreamRef.current) return
    if (activeCallsRef.current.has(peerId)) return
    if (activeCallsRef.current.size >= MAX_ROOM_P2P_PARTICIPANTS - 1) return
    // Glare avoidance: only the lexicographically smaller peer initiates outbound media;
    // the other answers a single incoming call. Prevents duplicate calls/streams per pair.
    const localId = getPeerId()
    if (localId && peerId && localId.localeCompare(peerId) >= 0) return
    const peer = getPeerInstance()
    if (!peer) return
    let mediaCall
    try {
      mediaCall = peer.call(peerId, localStreamRef.current, {
        metadata: {
          callType: 'room',
          roomId: meeting.roomId,
          meetingId: meeting.meetingId,
        },
      })
    } catch {
      return
    }
    if (mediaCall) {
      wireMediaCall(mediaCall, peerId)
    }
  }, [wireMediaCall])

  const appendRoomMessage = useCallback((message) => {
    const id = String(message?.id || '')
    if (!id) return false
    if (roomMessageIdsRef.current.has(id)) return false
    roomMessageIdsRef.current.add(id)
    setRoomMessages((prev) => [...prev, message])
    return true
  }, [])

  const clearSessionState = useCallback(() => {
    setSessionStatus(DEFAULT_STATUS)
    setError('')
    setActiveMeeting(null)
    setRemoteStreams(new Map())
    setRoomMessages([])
    setIsMuted(false)
    setIsCameraOff(false)
    setIsSharingScreen(false)
    setParticipantRegistry({})
    participantByPeerRef.current.clear()
    roomPeerIdsRef.current.clear()
    roomMessageIdsRef.current.clear()
  }, [])

  const leaveMeeting = useCallback((options = {}) => {
    const { reason = 'user-left' } = options
    const meeting = activeMeetingRef.current
    if (inSessionRef.current && meeting) {
      sendToAllPeers({
        type: 'room-leave',
        roomId: meeting.roomId,
        meetingId: meeting.meetingId,
        peerId: getPeerId(),
        userId: localIdentity.userId,
        userEmail: localIdentity.email,
        reason,
      })
    }

    for (const mediaCall of activeCallsRef.current.values()) {
      try {
        mediaCall.close()
      } catch {
        // ignore
      }
    }
    activeCallsRef.current.clear()
    localStreamRef.current?.getTracks?.().forEach((track) => track.stop())
    localStreamRef.current = null
    setLocalStream(null)
    inSessionRef.current = false
    screenTrackRef.current = null
    cameraTrackRef.current = null
    clearSessionState()
  }, [clearSessionState, localIdentity.email, localIdentity.userId])

  const joinMeetingSession = useCallback(async (meeting) => {
    if (!meeting?.id) {
      setError('Meeting metadata is missing.')
      return false
    }

    const lifecycle = getMeetingLifecycle(meeting)
    if (!lifecycle.canJoin) {
      setSessionStatus('ended')
      setError('This meeting has already ended.')
      return false
    }

    if (inSessionRef.current && activeMeetingRef.current?.meetingId === meeting.id) {
      setSessionStatus('live')
      setError('')
      return true
    }
    if (inSessionRef.current && activeMeetingRef.current?.meetingId !== meeting.id) {
      leaveMeeting({ reason: 'switch-meeting' })
    }

    setSessionStatus('joining')
    setError('')
    await initP2P()

    let stream = localStreamRef.current
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      } catch {
        setSessionStatus('error')
        setError('Unable to access microphone/camera.')
        return false
      }
    }
    localStreamRef.current = stream
    cameraTrackRef.current = stream.getVideoTracks()[0] ?? null
    setLocalStream(stream)

    const nextMeeting = {
      meetingId: meeting.id,
      roomId: meeting.roomId || meeting.id,
      title: meeting.title || 'Meeting',
      projectId: meeting.projectId || null,
      transport: 'p2p-small-room',
      date: meeting.date,
      time: meeting.time,
      duration: Number(meeting.duration || 60),
      startAt: lifecycle.startAt,
      endAt: lifecycle.endAt,
    }
    setActiveMeeting(nextMeeting)
    inSessionRef.current = true
    setSessionStatus('live')

    const localPeerId = getPeerId()
    upsertParticipant(localIdentity, {
      peerId: localPeerId,
      isLocal: true,
      hasActiveStream: true,
      activeInRoom: true,
      joinedAt: Date.now(),
    })
    if (localPeerId) roomPeerIdsRef.current.add(localPeerId)

    const peers = getConnectedPeers().slice(0, MAX_ROOM_P2P_PARTICIPANTS - 1)
    peers.forEach((peerId) => {
      if (peerId) roomPeerIdsRef.current.add(peerId)
      placeRoomCall(peerId)
    })

    sendToAllPeers({
      type: 'room-join',
      roomId: nextMeeting.roomId,
      meetingId: nextMeeting.meetingId,
      peerId: localPeerId,
      userId: localIdentity.userId,
      senderProfile: {
        displayName: localIdentity.displayName || '',
        username: localIdentity.username || '',
        email: localIdentity.email || '',
      },
      joinedAt: Date.now(),
    })
    return true
  }, [leaveMeeting, localIdentity, placeRoomCall, upsertParticipant])

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return
    const nextMuted = !isMuted
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted
    })
    setIsMuted(nextMuted)
  }, [isMuted])

  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return
    const nextCameraOff = !isCameraOff
    localStreamRef.current.getVideoTracks().forEach((track) => {
      track.enabled = !nextCameraOff
    })
    setIsCameraOff(nextCameraOff)
  }, [isCameraOff])

  const toggleScreenShare = useCallback(async () => {
    if (!localStreamRef.current) return
    if (!isSharingScreen) {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
      const screenTrack = screenStream.getVideoTracks()[0]
      if (!screenTrack) return
      screenTrackRef.current = screenTrack
      replaceOutgoingVideoTrack(screenTrack)
      setIsSharingScreen(true)
      screenTrack.onended = () => {
        const cameraTrack = cameraTrackRef.current
        if (cameraTrack) {
          replaceOutgoingVideoTrack(cameraTrack)
        }
        screenTrackRef.current = null
        setIsSharingScreen(false)
      }
      return
    }
    screenTrackRef.current?.stop?.()
    screenTrackRef.current = null
    const cameraTrack = cameraTrackRef.current
    if (cameraTrack) {
      replaceOutgoingVideoTrack(cameraTrack)
    }
    setIsSharingScreen(false)
  }, [isSharingScreen, replaceOutgoingVideoTrack])

  const sendRoomChatMessage = useCallback((text) => {
    const messageText = String(text || '').trim()
    const meeting = activeMeetingRef.current
    if (!messageText || !meeting) return
    const senderProfile = {
      displayName: localIdentity.displayName || '',
      username: localIdentity.username || '',
      email: localIdentity.email || '',
    }
    const senderPeerId = getPeerId()
    const senderUserKey = getUserKey(localIdentity, senderPeerId)
    const message = {
      id: `m_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      roomId: meeting.roomId,
      meetingId: meeting.meetingId,
      peerId: senderPeerId,
      userId: localIdentity.userId || '',
      userKey: senderUserKey,
      senderUserKey,
      senderProfile,
      senderName: displayNameFromIdentity(localIdentity, ''),
      text: messageText,
      createdAt: Date.now(),
    }
    appendRoomMessage(message)
    sendToAllPeers({
      type: 'room-chat',
      roomId: meeting.roomId,
      meetingId: meeting.meetingId,
      message,
    })
  }, [appendRoomMessage, localIdentity])

  useEffect(() => {
    const publishRoomPeerList = (meeting) => {
      if (!meeting) return
      const peers = Array.from(roomPeerIdsRef.current).filter(Boolean)
      // Keep it small; meetings are capped anyway.
      const limited = peers.slice(0, MAX_ROOM_P2P_PARTICIPANTS)
      sendToAllPeers({
        type: 'room-peer-list',
        roomId: meeting.roomId,
        meetingId: meeting.meetingId,
        peers: limited,
      })
    }

    const offConnected = onP2PEvent(P2P_EVENTS.PEER_CONNECTED, ({ peerId }) => {
      if (inSessionRef.current && peerId) {
        roomPeerIdsRef.current.add(peerId)
        placeRoomCall(peerId)
        publishRoomPeerList(activeMeetingRef.current)
      }
    })
    const offDisconnected = onP2PEvent(P2P_EVENTS.PEER_DISCONNECTED, ({ peerId }) => {
      if (peerId) removePeerSession(peerId)
    })
    const offIncomingCall = onP2PEvent(P2P_EVENTS.INCOMING_CALL, (mediaCall) => {
      const metadata = mediaCall?.metadata || {}
      // Direct 1:1 calls are handled only by ChatShell. Never close them here — previously
      // `!activeMeeting` caused every DM incoming call to be destroyed on the Chat page.
      if (metadata.callType !== 'room') {
        return
      }
      const meeting = activeMeetingRef.current
      if (!meeting || !inSessionRef.current || !localStreamRef.current) {
        mediaCall?.close?.()
        return
      }
      if (metadata.roomId !== meeting.roomId) {
        mediaCall?.close?.()
        return
      }
      const peerId = mediaCall.peer
      if (activeCallsRef.current.has(peerId)) {
        mediaCall?.close?.()
        return
      }
      mediaCall.answer(localStreamRef.current)
      wireMediaCall(mediaCall, peerId)
    })
    const offMessage = onP2PEvent(P2P_EVENTS.MESSAGE, ({ from, data }) => {
      const meeting = activeMeetingRef.current
      if (!meeting || !data || data.roomId !== meeting.roomId) return

      if (from) {
        roomPeerIdsRef.current.add(from)
      }

      if (data.type === 'room-join') {
        // Ensure we have a direct data connection to the joiner, then gossip peer list
        if (from) void connectToPeer(from)
        const senderProfile = data.senderProfile || {}
        upsertParticipant(
          {
            userId: data.userId || '',
            email: senderProfile.email || '',
            username: senderProfile.username || usernameFromEmail(senderProfile.email),
            displayName: senderProfile.displayName || '',
          },
          { peerId: from, activeInRoom: true, joinedAt: data.joinedAt || Date.now() },
        )
        if (inSessionRef.current) {
          placeRoomCall(from)
        }
        publishRoomPeerList(meeting)
        sendToPeer(from, {
          type: 'room-presence',
          roomId: meeting.roomId,
          meetingId: meeting.meetingId,
          peerId: getPeerId(),
          userId: localIdentity.userId,
          senderProfile: {
            displayName: localIdentity.displayName || '',
            username: localIdentity.username || '',
            email: localIdentity.email || '',
          },
          joinedAt: Date.now(),
        })
        if (roomMessagesRef.current.length > 0) {
          sendToPeer(from, {
            type: 'room-chat-sync',
            roomId: meeting.roomId,
            meetingId: meeting.meetingId,
            messages: roomMessagesRef.current.slice(-100),
          })
        }
      } else if (data.type === 'room-presence') {
        if (from) void connectToPeer(from)
        const senderProfile = data.senderProfile || {}
        upsertParticipant(
          {
            userId: data.userId || '',
            email: senderProfile.email || '',
            username: senderProfile.username || usernameFromEmail(senderProfile.email),
            displayName: senderProfile.displayName || '',
          },
          { peerId: from, activeInRoom: true, joinedAt: data.joinedAt || Date.now() },
        )
        publishRoomPeerList(meeting)
      } else if (data.type === 'room-peer-list' && Array.isArray(data.peers)) {
        // Converge everyone to the same room peer set.
        for (const peerId of data.peers) {
          if (!peerId || peerId === getPeerId()) continue
          roomPeerIdsRef.current.add(peerId)
          void connectToPeer(peerId)
          if (inSessionRef.current) placeRoomCall(peerId)
        }
      } else if (data.type === 'room-chat' && data.message) {
        const msg = { ...data.message }
        // Ensure chat identity is derived from canonical participant registry, not raw peer/session IDs.
        if (!msg.senderUserKey) {
          msg.senderUserKey = participantByPeerRef.current.get(from) || msg.userKey || ''
        }
        if (!msg.userKey) {
          msg.userKey = msg.senderUserKey || ''
        }
        // Backfill participant metadata if provided (does not create a second participant entry).
        if (msg.senderProfile) {
          upsertParticipant(
            {
              userId: msg.userId || '',
              email: msg.senderProfile.email || '',
              username:
                msg.senderProfile.username || usernameFromEmail(msg.senderProfile.email),
              displayName: msg.senderProfile.displayName || '',
            },
            { peerId: from, activeInRoom: true, joinedAt: msg.createdAt || Date.now() },
          )
          msg.senderName = displayNameFromIdentity(msg.senderProfile, '')
        } else if (!msg.senderName && msg.senderUserKey) {
          const entry = participantRegistry[msg.senderUserKey]
          if (entry) msg.senderName = displayNameFromIdentity(entry, '')
        }
        appendRoomMessage(msg)
      } else if (data.type === 'room-chat-sync' && Array.isArray(data.messages)) {
        for (const message of data.messages) {
          const msg = { ...message }
          if (!msg.senderUserKey) {
            msg.senderUserKey = participantByPeerRef.current.get(from) || msg.userKey || ''
          }
          if (!msg.userKey) {
            msg.userKey = msg.senderUserKey || ''
          }
          if (!msg.senderName && msg.senderProfile) {
            msg.senderName = displayNameFromIdentity(msg.senderProfile, '')
          }
          appendRoomMessage(msg)
        }
      } else if (data.type === 'room-leave') {
        removePeerSession(from)
      }
    })

    return () => {
      offConnected()
      offDisconnected()
      offIncomingCall()
      offMessage()
    }
  }, [
    appendRoomMessage,
    localIdentity,
    participantRegistry,
    placeRoomCall,
    removePeerSession,
    upsertParticipant,
    wireMediaCall,
  ])

  useEffect(() => {
    if (!activeMeeting?.endAt || !inSessionRef.current) return undefined
    const timer = window.setInterval(() => {
      if (!inSessionRef.current || !activeMeetingRef.current?.endAt) return
      if (Date.now() >= activeMeetingRef.current.endAt) {
        setSessionStatus('ended')
        setError('Meeting duration has ended.')
        leaveMeeting({ reason: 'meeting-expired' })
      }
    }, 15000)
    return () => window.clearInterval(timer)
  }, [activeMeeting?.endAt, leaveMeeting])

  useEffect(() => {
    const handleBeforeUnload = () => {
      leaveMeeting({ reason: 'page-unload' })
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [leaveMeeting])

  const participants = useMemo(() => {
    const localPeerId = getPeerId()
    const registry = { ...participantRegistry }
    const localKey = getUserKey(localIdentity, localPeerId)
    if (localPeerId) {
      registry[localKey] = {
        ...(registry[localKey] || createParticipant(localKey, localIdentity, { isLocal: true })),
        userId: localIdentity.userId || registry[localKey]?.userId || '',
        email: localIdentity.email || registry[localKey]?.email || '',
        username: localIdentity.username || registry[localKey]?.username || '',
        displayName: localIdentity.displayName || registry[localKey]?.displayName || '',
        peerSessions: Array.from(
          new Set([...(registry[localKey]?.peerSessions || []), localPeerId]),
        ),
        isLocal: true,
        activeInRoom: Boolean(activeMeeting),
        hasActiveStream: Boolean(localStream),
      }
    }

    const items = Object.values(registry)
      .filter((entry) => entry.activeInRoom)
      .map((entry) => {
        const peerWithStream = (entry.peerSessions || []).find((peerId) => remoteStreams.has(peerId))
        return {
          userKey: entry.userKey,
          peerId: entry.isLocal ? localPeerId : (peerWithStream || entry.peerSessions[0] || ''),
          label: displayNameFromIdentity(entry, entry.peerSessions[0] || ''),
          isLocal: entry.isLocal,
          hasStream: entry.isLocal ? Boolean(localStream) : Boolean(peerWithStream),
          userId: entry.userId || '',
          email: entry.email || '',
        }
      })
    const sorted = items.sort((a, b) => {
      if (a.isLocal) return -1
      if (b.isLocal) return 1
      return a.label.localeCompare(b.label)
    })
    const byUserKey = new Map()
    for (const row of sorted) {
      if (!byUserKey.has(row.userKey)) byUserKey.set(row.userKey, row)
    }
    return Array.from(byUserKey.values())
  }, [activeMeeting, localIdentity, localStream, participantRegistry, remoteStreams])

  const remoteParticipantStreams = useMemo(() => {
    return participants
      .filter((entry) => !entry.isLocal)
      .map((entry) => ({
        ...entry,
        stream: entry.peerId ? remoteStreams.get(entry.peerId) ?? null : null,
      }))
      .filter((entry) => Boolean(entry.stream))
  }, [participants, remoteStreams])

  const value = useMemo(
    () => ({
      activeMeeting,
      sessionStatus,
      error,
      isMeetingPageOpen,
      setIsMeetingPageOpen,
      localStream,
      remoteStreams,
      remoteParticipantStreams,
      isMuted,
      isCameraOff,
      isSharingScreen,
      roomMessages,
      participants,
      participantCount: participants.length,
      joinMeetingSession,
      leaveMeeting,
      toggleMute,
      toggleCamera,
      toggleScreenShare,
      sendRoomChatMessage,
      maxRoomParticipants: MAX_ROOM_P2P_PARTICIPANTS,
    }),
    [
      activeMeeting,
      error,
      isCameraOff,
      isMeetingPageOpen,
      isMuted,
      isSharingScreen,
      joinMeetingSession,
      leaveMeeting,
      localStream,
      participants,
      remoteParticipantStreams,
      remoteStreams,
      roomMessages,
      sendRoomChatMessage,
      sessionStatus,
      toggleCamera,
      toggleMute,
      toggleScreenShare,
    ],
  )

  return (
    <MeetingSessionContext.Provider value={value}>
      {children}
    </MeetingSessionContext.Provider>
  )
}

export function useMeetingSession() {
  const ctx = useContext(MeetingSessionContext)
  if (!ctx) {
    throw new Error('useMeetingSession must be used within MeetingSessionProvider')
  }
  return ctx
}
