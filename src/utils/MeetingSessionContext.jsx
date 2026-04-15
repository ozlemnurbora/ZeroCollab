import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { loadSettings } from '../components/settings/settingsStorage.js'
import { useAuth } from './AuthContext.jsx'
import {
  P2P_EVENTS,
  getConnectedPeers,
  getPeerId,
  getPeerInstance,
  initP2P,
  on as onP2PEvent,
  sendToAllPeers,
} from './p2pManager.js'

const MAX_ROOM_P2P_PARTICIPANTS = 6
const DEFAULT_STATUS = 'idle'

const MeetingSessionContext = createContext(null)

function shortenPeerId(peerId) {
  const id = String(peerId || '')
  if (!id) return 'Unknown'
  if (id.length <= 12) return id
  return `${id.slice(0, 6)}...${id.slice(-4)}`
}

function usernameFromEmail(email) {
  const local = String(email || '').trim().split('@')[0]
  return local || ''
}

function profileDisplayName(profile) {
  if (!profile) return ''
  return (
    profile.displayName ||
    profile.username ||
    profile.email ||
    shortenPeerId(profile.peerId)
  )
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
  const [participantProfiles, setParticipantProfiles] = useState({})
  const [localIdentity, setLocalIdentity] = useState({
    displayName: '',
    username: usernameFromEmail(user?.email),
    email: user?.email || '',
  })
  const activeCallsRef = useRef(new Map())
  const localStreamRef = useRef(null)
  const activeMeetingRef = useRef(null)
  const inSessionRef = useRef(false)
  const screenTrackRef = useRef(null)
  const cameraTrackRef = useRef(null)

  useEffect(() => {
    localStreamRef.current = localStream
  }, [localStream])

  useEffect(() => {
    activeMeetingRef.current = activeMeeting
  }, [activeMeeting])

  useEffect(() => {
    let cancelled = false
    void loadSettings().then((settings) => {
      if (cancelled) return
      const displayName = settings?.profile?.displayName?.trim?.() || ''
      setLocalIdentity({
        displayName,
        username: usernameFromEmail(user?.email),
        email: user?.email || '',
      })
    })
    return () => {
      cancelled = true
    }
  }, [user?.email])

  const registerParticipantProfile = useCallback((peerId, incomingProfile = {}) => {
    if (!peerId) return
    setParticipantProfiles((prev) => {
      const current = prev[peerId] || {}
      const next = {
        ...current,
        peerId,
        displayName: incomingProfile.displayName || current.displayName || '',
        username: incomingProfile.username || current.username || '',
        email: incomingProfile.email || current.email || '',
      }
      if (
        next.displayName === current.displayName &&
        next.username === current.username &&
        next.email === current.email
      ) {
        return prev
      }
      return { ...prev, [peerId]: next }
    })
  }, [])

  const removeParticipant = useCallback((peerId) => {
    activeCallsRef.current.delete(peerId)
    setRemoteStreams((prev) => {
      const next = new Map(prev)
      next.delete(peerId)
      return next
    })
  }, [])

  const replaceOutgoingVideoTrack = useCallback((track) => {
    for (const mc of activeCallsRef.current.values()) {
      const senders = mc?.peerConnection?.getSenders?.() ?? []
      const videoSender = senders.find((sender) => sender?.track?.kind === 'video')
      if (videoSender) {
        void videoSender.replaceTrack(track)
      }
    }
  }, [])

  const wireMediaCall = useCallback((mediaCall, peerId) => {
    if (!mediaCall || !peerId) return
    activeCallsRef.current.set(peerId, mediaCall)
    mediaCall.on('stream', (stream) => {
      setRemoteStreams((prev) => new Map(prev).set(peerId, stream))
    })
    mediaCall.on('close', () => removeParticipant(peerId))
    mediaCall.on('error', () => removeParticipant(peerId))
  }, [removeParticipant])

  const placeRoomCall = useCallback((peerId) => {
    const meeting = activeMeetingRef.current
    if (!meeting || !peerId || !localStreamRef.current) return
    if (activeCallsRef.current.has(peerId)) return
    if (activeCallsRef.current.size >= MAX_ROOM_P2P_PARTICIPANTS - 1) return
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
    if (!mediaCall) return
    wireMediaCall(mediaCall, peerId)
  }, [wireMediaCall])

  const clearSessionState = useCallback(() => {
    setSessionStatus(DEFAULT_STATUS)
    setError('')
    setActiveMeeting(null)
    setRemoteStreams(new Map())
    setRoomMessages([])
    setIsMuted(false)
    setIsCameraOff(false)
    setIsSharingScreen(false)
  }, [])

  const leaveMeeting = useCallback((options = {}) => {
    const { reason = 'user-left' } = options
    if (inSessionRef.current && activeMeetingRef.current) {
      sendToAllPeers({
        type: 'room-leave',
        roomId: activeMeetingRef.current.roomId,
        meetingId: activeMeetingRef.current.meetingId,
        peerId: getPeerId(),
        reason,
      })
    }
    for (const call of activeCallsRef.current.values()) {
      try {
        call.close()
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
  }, [clearSessionState])

  const joinMeetingSession = useCallback(async (meeting) => {
    if (!meeting?.id) {
      setError('Meeting metadata is missing.')
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
    }
    setActiveMeeting(nextMeeting)
    inSessionRef.current = true
    setSessionStatus('live')

    const peers = getConnectedPeers().slice(0, MAX_ROOM_P2P_PARTICIPANTS - 1)
    peers.forEach((peerId) => placeRoomCall(peerId))

    sendToAllPeers({
      type: 'room-join',
      roomId: nextMeeting.roomId,
      meetingId: nextMeeting.meetingId,
      peerId: getPeerId(),
      senderProfile: {
        displayName: localIdentity.displayName || '',
        username: localIdentity.username || '',
        email: localIdentity.email || '',
      },
    })
    return true
  }, [leaveMeeting, localIdentity.displayName, localIdentity.email, localIdentity.username, placeRoomCall])

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
    if (!messageText || !activeMeetingRef.current) return
    const msg = {
      id: `m_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      peerId: getPeerId(),
      senderName: localIdentity.displayName || localIdentity.username || localIdentity.email || shortenPeerId(getPeerId()),
      text: messageText,
      createdAt: Date.now(),
    }
    setRoomMessages((prev) => [...prev, msg])
    sendToAllPeers({
      type: 'room-chat',
      roomId: activeMeetingRef.current.roomId,
      meetingId: activeMeetingRef.current.meetingId,
      message: msg,
    })
  }, [localIdentity.displayName, localIdentity.email, localIdentity.username])

  useEffect(() => {
    const offConnected = onP2PEvent(P2P_EVENTS.PEER_CONNECTED, ({ peerId }) => {
      if (inSessionRef.current && peerId) {
        placeRoomCall(peerId)
      }
    })
    const offDisconnected = onP2PEvent(P2P_EVENTS.PEER_DISCONNECTED, ({ peerId }) => {
      if (peerId) {
        removeParticipant(peerId)
      }
    })
    const offIncomingCall = onP2PEvent(P2P_EVENTS.INCOMING_CALL, (mediaCall) => {
      const metadata = mediaCall?.metadata || {}
      const meeting = activeMeetingRef.current
      if (!meeting || !inSessionRef.current || !localStreamRef.current) {
        mediaCall?.close?.()
        return
      }
      if (metadata.callType !== 'room' || metadata.roomId !== meeting.roomId) {
        return
      }
      const peerId = mediaCall.peer
      mediaCall.answer(localStreamRef.current)
      wireMediaCall(mediaCall, peerId)
    })
    const offMessage = onP2PEvent(P2P_EVENTS.MESSAGE, ({ from, data }) => {
      const meeting = activeMeetingRef.current
      if (!meeting || !data || data.roomId !== meeting.roomId) return
      if (data.type === 'room-join') {
        const senderProfile = data.senderProfile || {}
        registerParticipantProfile(from, {
          displayName: senderProfile.displayName,
          username: senderProfile.username,
          email: senderProfile.email,
        })
        if (inSessionRef.current) {
          placeRoomCall(from)
        }
      } else if (data.type === 'room-chat' && data.message) {
        const incoming = data.message
        setRoomMessages((prev) => {
          if (prev.some((m) => m.id === incoming.id)) return prev
          return [...prev, incoming]
        })
      } else if (data.type === 'room-leave') {
        removeParticipant(from)
      }
    })

    const onPresenceSync = (event) => {
      const state = event.detail || {}
      Object.values(state).forEach((presences) => {
        ;(presences || []).forEach((presence) => {
          if (!presence?.peerId) return
          registerParticipantProfile(presence.peerId, {
            displayName: presence.displayName || '',
            username: usernameFromEmail(presence.userEmail),
            email: presence.userEmail || '',
          })
        })
      })
    }
    window.addEventListener('hub:presence-sync', onPresenceSync)

    return () => {
      offConnected()
      offDisconnected()
      offIncomingCall()
      offMessage()
      window.removeEventListener('hub:presence-sync', onPresenceSync)
    }
  }, [placeRoomCall, registerParticipantProfile, removeParticipant, wireMediaCall])

  useEffect(() => {
    const handleBeforeUnload = () => {
      leaveMeeting({ reason: 'page-unload' })
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [leaveMeeting])

  const participantList = useMemo(() => {
    const localPeerId = getPeerId()
    const ids = new Set([
      ...(localPeerId ? [localPeerId] : []),
      ...remoteStreams.keys(),
      ...Object.keys(participantProfiles),
    ])
    const participants = Array.from(ids).map((peerId) => {
      const profile =
        peerId === localPeerId
          ? {
              peerId,
              displayName: localIdentity.displayName,
              username: localIdentity.username,
              email: localIdentity.email,
            }
          : participantProfiles[peerId]
      return {
        peerId,
        label: profileDisplayName({ ...profile, peerId }),
        isLocal: peerId === localPeerId,
        hasStream: peerId === localPeerId ? !!localStream : remoteStreams.has(peerId),
      }
    })
    return participants
  }, [localIdentity.displayName, localIdentity.email, localIdentity.username, localStream, participantProfiles, remoteStreams])

  const value = useMemo(
    () => ({
      activeMeeting,
      sessionStatus,
      error,
      isMeetingPageOpen,
      setIsMeetingPageOpen,
      localStream,
      remoteStreams,
      isMuted,
      isCameraOff,
      isSharingScreen,
      roomMessages,
      participants: participantList,
      participantCount: participantList.length,
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
      participantList,
      remoteStreams,
      roomMessages,
      sessionStatus,
      toggleCamera,
      toggleMute,
      toggleScreenShare,
      sendRoomChatMessage,
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
