import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { loadMeetings } from '../utils/meetingStorage.js'
import { useWorkspace } from '../utils/WorkspaceContext.jsx'
import { useAuth } from '../utils/AuthContext.jsx'
import { useMeetingSession } from '../utils/MeetingSessionContext.jsx'
import { getMeetingLifecycle } from '../utils/meetingLifecycle.js'

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
  const { user } = useAuth()
  const ownerUserId = user?.id ?? null
  const { memberProjectIds = [] } = useWorkspace()
  const [meeting, setMeeting] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [showChatPanel, setShowChatPanel] = useState(true)
  const [roomChatInput, setRoomChatInput] = useState('')
  const {
    activeMeeting,
    sessionStatus,
    error: sessionError,
    localStream,
    remoteParticipantStreams,
    isMuted,
    isCameraOff,
    isSharingScreen,
    roomMessages,
    participants,
    participantCount,
    joinMeetingSession,
    leaveMeeting,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    sendRoomChatMessage,
    setIsMeetingPageOpen,
    maxRoomParticipants,
  } = useMeetingSession()

  useEffect(() => {
    if (!ownerUserId) {
      setPageError('Sign in to join meetings.')
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const meetings = await loadMeetings(ownerUserId)
      if (cancelled) return
      const found = (Array.isArray(meetings) ? meetings : []).find((m) => m.id === meetingId)
      if (!found) {
        setPageError('Meeting not found.')
        setLoading(false)
        return
      }
      setMeeting(found)
      const isAuthorized = !found.projectId || memberProjectIds.includes(found.projectId)
      if (!isAuthorized) {
        setLoading(false)
        return
      }
      await joinMeetingSession(found)
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [joinMeetingSession, meetingId, memberProjectIds, ownerUserId])

  useEffect(() => {
    setIsMeetingPageOpen(true)
    return () => {
      setIsMeetingPageOpen(false)
    }
  }, [setIsMeetingPageOpen])

  const isAuthorizedMeeting = !meeting?.projectId || memberProjectIds.includes(meeting.projectId)
  const isLive = !!activeMeeting && activeMeeting.meetingId === meetingId && sessionStatus !== 'idle'
  const lifecycle = getMeetingLifecycle(meeting)
  const isEndedMeeting = lifecycle.status === 'ended'

  const sendMessage = () => {
    const text = roomChatInput.trim()
    if (!text) return
    sendRoomChatMessage(text)
    setRoomChatInput('')
  }

  if (loading) {
    return <p className="text-sm text-[rgb(var(--zc-muted))]">Loading meeting...</p>
  }

  if (pageError) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-rose-300">{pageError}</p>
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
            {meeting?.date} {meeting?.time} • mode: p2p-small-room (max {maxRoomParticipants})
          </p>
          {meeting ? (
            <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
              Status: {lifecycle.status}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isLive ? (
            <button
              type="button"
              onClick={() => void joinMeetingSession(meeting)}
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
            onClick={() => {
              leaveMeeting({ reason: 'user-left' })
              navigate(-1)
            }}
            className="rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-500"
          >
            Leave
          </button>
        </div>
      </header>

      {isEndedMeeting ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          This meeting was scheduled for an earlier time. Access is still open for continued discussion and collaboration.
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <VideoTile stream={localStream} label="You" muted />
            {remoteParticipantStreams.map((entry) => {
              return <VideoTile key={entry.userKey} stream={entry.stream} label={entry.label} />
            })}
            {sessionError ? (
              <div className="rounded-xl border border-rose-500/50 bg-rose-500/10 p-3 text-xs text-rose-200">
                {sessionError}
              </div>
            ) : null}
          </div>

          {isLive ? (
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
          ) : (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Session is idle. Join to start media and participant exchange.
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.25)] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--zc-muted2))]">
              Participants ({participantCount})
            </p>
            <ul className="mt-2 space-y-1 text-xs text-[rgb(var(--zc-muted))]">
              {participants.map((entry) => (
                <li
                  key={entry.userKey}
                  className="truncate rounded bg-[rgb(var(--zc-border)/0.35)] px-2 py-1"
                >
                  {entry.isLocal ? 'You' : entry.label}
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
                    <span className="font-medium text-[rgb(var(--zc-text))]">
                      {msg.senderName || 'Participant'}:{' '}
                    </span>
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
                      sendMessage()
                    }
                  }}
                  className="flex-1 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 py-1 text-xs"
                  placeholder="Message..."
                />
                <button
                  type="button"
                  onClick={sendMessage}
                  className="rounded-md bg-indigo-500 px-2 py-1 text-xs text-white hover:bg-indigo-400"
                >
                  Send
                </button>
              </div>
            </div>
          ) : null}

          <p className="text-[11px] text-[rgb(var(--zc-subtle))]">
            Meeting session is managed globally and remains active across app navigation until you explicitly leave.
          </p>
        </aside>
      </div>
    </section>
  )
}
