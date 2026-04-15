import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  P2P_EVENTS,
  getConnectedPeers,
  getPeerId,
  getPeerInstance,
  initP2P,
  on as onP2PEvent,
  sendToAllPeers,
} from '../utils/p2pManager.js'
import { loadMeetings } from '../utils/meetingStorage.js'
import { useWorkspace } from '../utils/WorkspaceContext.jsx'

const MAX_ROOM_P2P_PARTICIPANTS = 6
const ROOM_TRANSPORT_MODE = 'p2p-small-room'

function VideoTile({ stream, label, muted = false }) {
  const ref = useRef(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream ?? null
    }
  }, [stream])

  return (
    <div className="relative overflow-hidden rounded-xl border border-[rgb(var(--zc-border))] bg-black">
      <video ref={ref} autoPlay playsInline muted={muted} className="h-full w-full object-cover" />
      <p className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-1 text-xs text-white">
        {label}
      </p>
    </div>
  )
}

export function MeetingRoomPage() {
  const { meetingId } = useParams()
  const navigate = useNavigate()
  const { memberProjectIds = [] } = useWorkspace()
  const [meeting, setMeeting] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [localStream, setLocalStream] = useState(null)
  const [remoteStreams, setRemoteStreams] = useState(() => new Map())
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)
  const [isSharingScreen, setIsSharingScreen] = useState(false)
  const [inRoom, setInRoom] = useState(false)
  const [showChatPanel, setShowChatPanel] = useState(true)
  const [roomChatInput, setRoomChatInput] = useState('')
  const [roomMessages, setRoomMessages] = useState([])
  const activeCallsRef = useRef(new Map())
  const localStreamRef = useRef(null)
  const inRoomRef = useRef(false)
  const screenTrackRef = useRef(null)
  const cameraTrackRef = useRef(null)

  useEffect(() => {
    localStreamRef.current = localStream
  }, [localStream])

  useEffect(() => {
    inRoomRef.current = inRoom
  }, [inRoom])

  const isAuthorizedMeeting = useMemo(() => {
    if (!meeting?.projectId) return true
    return memberProjectIds.includes(meeting.projectId)
  }, [meeting, memberProjectIds])

  const participantIds = useMemo(() => {
    const ids = [getPeerId(), ...remoteStreams.keys()]
    return ids.filter(Boolean)
  }, [remoteStreams])

  const cleanupCallForPeer = useCallback((peerId) => {
    activeCallsRef.current.delete(peerId)
    setRemoteStreams((prev) => {
      const next = new Map(prev)
      next.delete(peerId)
      return next
    })
  }, [])

  const wireMediaCall = useCallback((mediaCall, peerId) => {
    if (!mediaCall || !peerId) return
    activeCallsRef.current.set(peerId, mediaCall)
    mediaCall.on('stream', (stream) => {
      setRemoteStreams((prev) => new Map(prev).set(peerId, stream))
    })
    mediaCall.on('close', () => cleanupCallForPeer(peerId))
    mediaCall.on('error', () => cleanupCallForPeer(peerId))
  }, [cleanupCallForPeer])

  const placeRoomCall = useCallback((peerId) => {
    const peer = getPeerInstance()
    if (!peer || !peerId || !localStreamRef.current) return
    if (activeCallsRef.current.has(peerId)) return
    if (activeCallsRef.current.size >= MAX_ROOM_P2P_PARTICIPANTS - 1) return
    let mediaCall
    try {
      mediaCall = peer.call(peerId, localStreamRef.current, {
        metadata: { callType: 'room', roomId: meetingId, mode: ROOM_TRANSPORT_MODE },
      })
    } catch {
      return
    }
    if (!mediaCall) return
    wireMediaCall(mediaCall, peerId)
  }, [meetingId, wireMediaCall])

  const leaveRoom = useCallback(({ navigateBack = false } = {}) => {
    for (const call of activeCallsRef.current.values()) {
      try {
        call.close()
      } catch {
        // ignore
      }
    }
    activeCallsRef.current.clear()
    setRemoteStreams(new Map())
    localStreamRef.current?.getTracks?.().forEach((track) => track.stop())
    localStreamRef.current = null
    setLocalStream(null)
    setInRoom(false)
    setIsMuted(false)
    setIsCameraOff(false)
    setIsSharingScreen(false)
    screenTrackRef.current = null
    cameraTrackRef.current = null
    if (navigateBack) navigate(-1)
  }, [navigate])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const meetings = await loadMeetings()
      if (cancelled) return
      const found = (Array.isArray(meetings) ? meetings : []).find((m) => m.id === meetingId)
      if (!found) {
        setError('Meeting not found.')
      } else {
        setMeeting(found)
      }
      await initP2P()
      setLoading(false)
    })()
    return () => {
      cancelled = true
      leaveRoom()
    }
  }, [meetingId, leaveRoom])

  useEffect(() => {
    const offDisconnected = onP2PEvent(P2P_EVENTS.PEER_DISCONNECTED, ({ peerId }) => {
      if (peerId) cleanupCallForPeer(peerId)
    })
    const offIncomingCall = onP2PEvent(P2P_EVENTS.INCOMING_CALL, (mediaCall) => {
      if (!inRoomRef.current || !localStreamRef.current) {
        mediaCall?.close?.()
        return
      }
      const metadata = mediaCall?.metadata ?? {}
      if (metadata.callType !== 'room' || metadata.roomId !== meetingId) {
        return
      }
      const peerId = mediaCall.peer
      mediaCall.answer(localStreamRef.current)
      wireMediaCall(mediaCall, peerId)
    })
    const offMessage = onP2PEvent(P2P_EVENTS.MESSAGE, ({ from, data }) => {
      if (!data || data.roomId !== meetingId) return
      if (data.type === 'room-join' && inRoomRef.current) {
        placeRoomCall(from)
      } else if (data.type === 'room-chat') {
        setRoomMessages((prev) => [...prev, data.message])
      }
    })
    return () => {
      offDisconnected()
      offIncomingCall()
      offMessage()
    }
  }, [cleanupCallForPeer, meetingId, placeRoomCall, wireMediaCall])

  const joinRoom = async () => {
    if (inRoomRef.current) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      cameraTrackRef.current = stream.getVideoTracks()[0] ?? null
      setLocalStream(stream)
      setInRoom(true)
      const peers = getConnectedPeers().slice(0, MAX_ROOM_P2P_PARTICIPANTS - 1)
      peers.forEach((peerId) => placeRoomCall(peerId))
      sendToAllPeers({
        type: 'room-join',
        roomId: meetingId,
        peerId: getPeerId(),
        mode: ROOM_TRANSPORT_MODE,
      })
    } catch {
      setError('Unable to access camera/microphone.')
    }
  }

  const toggleMute = () => {
    if (!localStreamRef.current) return
    const next = !isMuted
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !next
    })
    setIsMuted(next)
  }

  const toggleCamera = () => {
    if (!localStreamRef.current) return
    const next = !isCameraOff
    localStreamRef.current.getVideoTracks().forEach((track) => {
      track.enabled = !next
    })
    setIsCameraOff(next)
  }

  const toggleScreenShare = async () => {
    if (!localStreamRef.current) return
    if (!isSharingScreen) {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
      const screenTrack = screenStream.getVideoTracks()[0]
      if (!screenTrack) return
      screenTrackRef.current = screenTrack
      setIsSharingScreen(true)
      screenTrack.onended = () => {
        screenTrackRef.current = null
        setIsSharingScreen(false)
      }
      return
    }
    screenTrackRef.current?.stop?.()
    screenTrackRef.current = null
    setIsSharingScreen(false)
  }

  const sendRoomMessage = () => {
    const text = roomChatInput.trim()
    if (!text) return
    const message = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      sender: getPeerId() || 'me',
      text,
    }
    setRoomMessages((prev) => [...prev, message])
    setRoomChatInput('')
    sendToAllPeers({
      type: 'room-chat',
      roomId: meetingId,
      message,
    })
  }

  if (loading) {
    return <p className="text-sm text-[rgb(var(--zc-muted))]">Loading meeting...</p>
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-rose-300">{error}</p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-md bg-[rgb(var(--zc-border))] px-3 py-2 text-sm"
        >
          Go Back
        </button>
      </div>
    )
  }

  if (!isAuthorizedMeeting) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-rose-300">You are not authorized for this meeting room.</p>
        <button
          type="button"
          onClick={() => navigate('/calendar')}
          className="rounded-md bg-[rgb(var(--zc-border))] px-3 py-2 text-sm"
        >
          Back to Calendar
        </button>
      </div>
    )
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[rgb(var(--zc-text))]">{meeting?.title || 'Meeting Room'}</h1>
          <p className="text-xs text-[rgb(var(--zc-subtle))]">
            {meeting?.date} {meeting?.time} • mode: {ROOM_TRANSPORT_MODE}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!inRoom ? (
            <button
              type="button"
              onClick={() => void joinRoom()}
              className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400"
            >
              Join Meeting
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setShowChatPanel((prev) => !prev)}
            className="rounded-md border border-[rgb(var(--zc-border))] px-3 py-2 text-sm"
          >
            {showChatPanel ? 'Hide Chat' : 'Show Chat'}
          </button>
          <button
            type="button"
            onClick={() => leaveRoom({ navigateBack: true })}
            className="rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-500"
          >
            Leave
          </button>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <VideoTile stream={localStream} label="You" muted />
            {[...remoteStreams.entries()].map(([peerId, stream]) => (
              <VideoTile key={peerId} stream={stream} label={peerId} />
            ))}
          </div>

          {inRoom ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggleMute}
                className="rounded-full border border-[rgb(var(--zc-border))] px-4 py-2 text-xs"
              >
                {isMuted ? 'Unmute' : 'Mute'}
              </button>
              <button
                type="button"
                onClick={toggleCamera}
                className="rounded-full border border-[rgb(var(--zc-border))] px-4 py-2 text-xs"
              >
                {isCameraOff ? 'Camera On' : 'Camera Off'}
              </button>
              <button
                type="button"
                onClick={() => void toggleScreenShare()}
                className="rounded-full border border-[rgb(var(--zc-border))] px-4 py-2 text-xs"
              >
                {isSharingScreen ? 'Stop Share' : 'Share Screen'}
              </button>
            </div>
          ) : null}
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.25)] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--zc-muted2))]">
              Participants ({participantIds.length})
            </p>
            <ul className="mt-2 space-y-1 text-xs text-[rgb(var(--zc-muted))]">
              {participantIds.map((id) => (
                <li key={id} className="truncate rounded bg-[rgb(var(--zc-border)/0.35)] px-2 py-1">
                  {id}
                </li>
              ))}
            </ul>
          </div>

          {showChatPanel ? (
            <div className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.25)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--zc-muted2))]">
                Side Chat
              </p>
              <div className="mt-2 max-h-60 space-y-1 overflow-y-auto text-xs">
                {roomMessages.map((msg) => (
                  <div key={msg.id} className="rounded bg-[rgb(var(--zc-border)/0.35)] px-2 py-1">
                    <span className="font-medium text-[rgb(var(--zc-text))]">{msg.sender}: </span>
                    <span className="text-[rgb(var(--zc-muted))]">{msg.text}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-1">
                <input
                  value={roomChatInput}
                  onChange={(e) => setRoomChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      sendRoomMessage()
                    }
                  }}
                  className="flex-1 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 py-1 text-xs"
                  placeholder="Message..."
                />
                <button
                  type="button"
                  onClick={sendRoomMessage}
                  className="rounded-md bg-indigo-500 px-2 py-1 text-xs text-white hover:bg-indigo-400"
                >
                  Send
                </button>
              </div>
            </div>
          ) : null}

          <p className="text-[11px] text-[rgb(var(--zc-subtle))]">
            This room uses small-group P2P mode and is structured to allow future SFU integration.
          </p>
        </aside>
      </div>
    </section>
  )
}
