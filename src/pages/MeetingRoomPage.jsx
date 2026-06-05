import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { loadMeetings } from '../utils/meetingStorage.js'
import { useWorkspace } from '../utils/WorkspaceContext.jsx'
import { useAuth } from '../utils/AuthContext.jsx'
import { useMeetingSession } from '../utils/MeetingSessionContext.jsx'
import { getMeetingLifecycle } from '../utils/meetingLifecycle.js'

function MicOffIcon({ className = '' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      <path d="M4 4l16 16" />
    </svg>
  )
}

function VideoTile({
  stream,
  label,
  muted = false,
  audioMuted = false,
  cameraOff = false,
  initial = '',
}) {
  const ref = useRef(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream ?? null
    }
  }, [stream])

  return (
    <div className="relative aspect-video overflow-hidden rounded-xl border border-[rgb(var(--zc-border))] bg-black shadow-sm">
      <video ref={ref} autoPlay playsInline muted={muted} className="h-full w-full object-cover" />
      {cameraOff ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[rgb(var(--zc-bg))]">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500/25 text-xl font-bold text-indigo-200">
            {initial || '🙂'}
          </span>
        </div>
      ) : null}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-xs text-white backdrop-blur-sm">
        {audioMuted ? <MicOffIcon className="h-3.5 w-3.5 text-rose-400" /> : null}
        <span className="max-w-[140px] truncate">{label}</span>
      </div>
      {audioMuted ? (
        <div
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-rose-600/90 text-white shadow"
          title="Microphone muted"
        >
          <MicOffIcon className="h-4 w-4" />
        </div>
      ) : null}
    </div>
  )
}

const controlBtnBase =
  'inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-medium transition'

export function MeetingRoomPage() {
  const { meetingId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const ownerUserId = user?.id ?? null
  const { memberProjectIds = [] } = useWorkspace()
  const [meeting, setMeeting] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [showChatPanel, setShowChatPanel] = useState(false)
  const [roomChatInput, setRoomChatInput] = useState('')

  // Pre-join (lobby) state — camera preview + device choices before entering.
  const [previewStream, setPreviewStream] = useState(null)
  const [previewError, setPreviewError] = useState('')
  const [previewCamOn, setPreviewCamOn] = useState(true)
  const [previewMicOn, setPreviewMicOn] = useState(true)
  const [permissionRequested, setPermissionRequested] = useState(false)
  // True once the browser permission prompt has been responded to (granted OR denied).
  // Gates the "Join Now" button so entry is impossible before consent is resolved.
  const [permissionResolved, setPermissionResolved] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const previewStreamRef = useRef(null)
  const previewConsumedRef = useRef(false)
  const previewVideoRef = useRef(null)

  const {
    activeMeeting,
    sessionStatus,
    error: sessionError,
    localStream,
    remoteParticipantStreams,
    isMuted,
    isCameraOff,
    isSharingScreen,
    screenShareOwnerKey,
    screenShareStream,
    localUserKey,
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
  } = useMeetingSession()

  const isAuthorizedMeeting = !meeting?.projectId || memberProjectIds.includes(meeting.projectId)
  const isLive = !!activeMeeting && activeMeeting.meetingId === meetingId && sessionStatus !== 'idle'
  const lifecycle = getMeetingLifecycle(meeting)
  const isEndedMeeting = lifecycle.status === 'ended'

  // Load the meeting metadata. We DO NOT auto-join here anymore — joining happens
  // from the pre-join lobby once the user confirms their devices. This also avoids
  // the shimmer/flicker that came from media/streams mounting during the initial load.
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
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [meetingId, memberProjectIds, ownerUserId])

  useEffect(() => {
    setIsMeetingPageOpen(true)
    return () => {
      setIsMeetingPageOpen(false)
    }
  }, [setIsMeetingPageOpen])

  // Bind the preview stream to the lobby <video>.
  useEffect(() => {
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = previewStream ?? null
    }
  }, [previewStream])

  // Stop the preview stream on unmount unless it was handed off to the session.
  useEffect(() => {
    return () => {
      if (!previewConsumedRef.current) {
        previewStreamRef.current?.getTracks?.().forEach((track) => track.stop())
        previewStreamRef.current = null
      }
    }
  }, [])

  const togglePreviewCam = () => {
    const s = previewStreamRef.current
    const next = !previewCamOn
    if (s) s.getVideoTracks().forEach((track) => (track.enabled = next))
    setPreviewCamOn(next)
  }

  const togglePreviewMic = () => {
    const s = previewStreamRef.current
    const next = !previewMicOn
    if (s) s.getAudioTracks().forEach((track) => (track.enabled = next))
    setPreviewMicOn(next)
  }

  // Only ever called from an explicit user click — never auto-run on mount.
  const requestPermissions = async () => {
    setPermissionRequested(true)
    setPreviewError('')
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      previewStreamRef.current = s
      setPreviewStream(s)
      setPreviewCamOn(true)
      setPreviewMicOn(true)
    } catch {
      // Denied: keep an empty stream so the user can still join WITHOUT triggering
      // a second permission prompt during join.
      previewStreamRef.current = new MediaStream()
      setPreviewStream(null)
      setPreviewError('Camera and microphone access denied. You can join without video/audio.')
    } finally {
      // Permission prompt has been responded to (granted or denied) — allow joining.
      setPermissionResolved(true)
    }
  }

  const handleJoinNow = async () => {
    // Hard gate: cannot join until the permission prompt has been responded to.
    if (!meeting || isJoining || !permissionResolved) return
    setIsJoining(true)
    // Reuse the stream already obtained on the pre-join screen — never call
    // getUserMedia again here (avoids a double permission prompt).
    const s = previewStreamRef.current
    const hasVideo = Boolean(s && s.getVideoTracks().some((track) => track.readyState === 'live'))
    const hasAudio = Boolean(s && s.getAudioTracks().length > 0)
    previewConsumedRef.current = true
    const ok = await joinMeetingSession(meeting, {
      initialStream: s || undefined,
      startMuted: !previewMicOn || !hasAudio,
      startCameraOff: !previewCamOn || !hasVideo,
    })
    previewStreamRef.current = null
    setPreviewStream(null)
    setIsJoining(false)
    if (!ok) {
      // Join failed — allow another attempt from the lobby.
      previewConsumedRef.current = false
    }
  }

  const sendMessage = () => {
    const text = roomChatInput.trim()
    if (!text) return
    sendRoomChatMessage(text)
    setRoomChatInput('')
  }

  const localInitial = (
    user?.email?.[0] ||
    'Y'
  ).toUpperCase()

  // Spotlight (screen-share) resolution.
  const spotlight = useMemo(() => {
    if (!screenShareOwnerKey) return null
    const sharerIsLocal = screenShareOwnerKey === localUserKey
    if (sharerIsLocal) {
      return { stream: screenShareStream || localStream, label: 'You — sharing screen', muted: true }
    }
    const sharer = remoteParticipantStreams.find((e) => e.userKey === screenShareOwnerKey)
    return {
      stream: sharer?.stream ?? null,
      label: `${sharer?.label || 'Participant'} — sharing screen`,
      muted: false,
    }
  }, [screenShareOwnerKey, localUserKey, screenShareStream, localStream, remoteParticipantStreams])

  const isSpotlightActive = Boolean(spotlight && spotlight.stream)

  // Hold the entire UI behind a single static loading state until meeting data is
  // confirmed loaded from storage. No animated/intermediate elements render here,
  // which prevents the shimmer/flicker on reload.
  if (loading) {
    return (
      <section className="space-y-6">
        <div className="h-8 w-48 rounded-md bg-[rgb(var(--zc-border)/0.4)]" />
        <div className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)] p-8 text-center text-sm text-[rgb(var(--zc-muted))]">
          Loading meeting…
        </div>
      </section>
    )
  }

  if (pageError) {
    return (
      <section className="space-y-4">
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {pageError}
        </div>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-lg border border-[rgb(var(--zc-border))] px-4 py-2 text-sm text-[rgb(var(--zc-muted2))] hover:bg-[rgb(var(--zc-border)/0.45)]"
        >
          Go Back
        </button>
      </section>
    )
  }

  if (!isAuthorizedMeeting) {
    return (
      <section className="space-y-4">
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          You are not authorized for this meeting room.
        </div>
        <button
          type="button"
          onClick={() => navigate('/calendar')}
          className="rounded-lg border border-[rgb(var(--zc-border))] px-4 py-2 text-sm text-[rgb(var(--zc-muted2))] hover:bg-[rgb(var(--zc-border)/0.45)]"
        >
          Back to Calendar
        </button>
      </section>
    )
  }

  // ── Pre-join lobby ─────────────────────────────────────────────────────────
  if (!isLive) {
    return (
      <section className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-600">
              {meeting?.title || 'Meeting Room'}
            </span>
          </h1>
          <p className="mt-1 text-sm text-[rgb(var(--zc-muted2))]">
            Check your camera and microphone, then join when you’re ready.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="rounded-xl border border-l-4 border-[rgb(var(--zc-border))] border-l-fuchsia-500 bg-[rgb(var(--zc-bg)/0.3)] p-5">
            <h3 className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-500 to-purple-600">
              🎥 Camera Preview
            </h3>
            <div className="relative mt-4 aspect-video overflow-hidden rounded-xl border border-[rgb(var(--zc-border))] bg-black">
              <video
                ref={previewVideoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
              {!permissionRequested ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[rgb(var(--zc-bg))] px-6 text-center">
                  <span className="text-3xl">🎥</span>
                  <button
                    type="button"
                    onClick={requestPermissions}
                    className="rounded-lg bg-gradient-to-r from-fuchsia-500 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:from-fuchsia-600 hover:to-indigo-700"
                  >
                    Allow Camera &amp; Microphone
                  </button>
                  <span className="text-xs text-[rgb(var(--zc-subtle))]">
                    We’ll ask your browser for camera and microphone access.
                  </span>
                </div>
              ) : previewError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[rgb(var(--zc-bg))] px-6 text-center">
                  <span className="text-2xl">🚫</span>
                  <span className="text-xs text-[rgb(var(--zc-muted2))]">
                    Camera and microphone access denied. You can join without video/audio.
                  </span>
                  <button
                    type="button"
                    onClick={requestPermissions}
                    className="text-xs font-semibold text-indigo-300 underline underline-offset-2"
                  >
                    Try again
                  </button>
                </div>
              ) : !previewCamOn ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[rgb(var(--zc-bg))] text-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/25 text-2xl font-bold text-indigo-200">
                    {localInitial}
                  </span>
                  <span className="text-xs text-[rgb(var(--zc-subtle))]">Camera is off</span>
                </div>
              ) : null}
            </div>

            {permissionRequested && previewStream ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={togglePreviewMic}
                  className={`${controlBtnBase} ${
                    previewMicOn
                      ? 'border-[rgb(var(--zc-border))] text-[rgb(var(--zc-muted2))] hover:bg-[rgb(var(--zc-border)/0.45)]'
                      : 'border-rose-500/50 bg-rose-500/15 text-rose-200'
                  }`}
                >
                  {previewMicOn ? '🎙️ Mic On' : '🔇 Mic Off'}
                </button>
                <button
                  type="button"
                  onClick={togglePreviewCam}
                  className={`${controlBtnBase} ${
                    previewCamOn
                      ? 'border-[rgb(var(--zc-border))] text-[rgb(var(--zc-muted2))] hover:bg-[rgb(var(--zc-border)/0.45)]'
                      : 'border-amber-500/50 bg-amber-500/15 text-amber-200'
                  }`}
                >
                  {previewCamOn ? '📹 Camera On' : '🚫 Camera Off'}
                </button>
              </div>
            ) : null}
          </div>

          <aside className="rounded-xl border border-l-4 border-[rgb(var(--zc-border))] border-l-indigo-500 bg-[rgb(var(--zc-bg)/0.3)] p-5">
            <h3 className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-cyan-600">
              📋 Meeting Details
            </h3>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2">
                <dt className="text-[rgb(var(--zc-muted))]">Date</dt>
                <dd className="text-[rgb(var(--zc-text))]">{meeting?.date || '—'}</dd>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2">
                <dt className="text-[rgb(var(--zc-muted))]">Time</dt>
                <dd className="text-[rgb(var(--zc-text))]">{meeting?.time || '—'}</dd>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-3 py-2">
                <dt className="text-[rgb(var(--zc-muted))]">Status</dt>
                <dd className="capitalize text-[rgb(var(--zc-text))]">{lifecycle.status}</dd>
              </div>
            </dl>

            {isEndedMeeting ? (
              <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                This meeting was scheduled earlier. Access stays open for continued collaboration.
              </p>
            ) : null}

            <button
              type="button"
              onClick={handleJoinNow}
              disabled={!permissionResolved || isJoining}
              className={`mt-5 w-full rounded-lg px-4 py-2.5 text-sm font-semibold shadow-lg transition ${
                permissionResolved
                  ? 'bg-gradient-to-r from-fuchsia-500 to-indigo-600 text-white shadow-indigo-500/25 hover:from-fuchsia-600 hover:to-indigo-700'
                  : 'cursor-not-allowed bg-[rgb(var(--zc-border)/0.5)] text-[rgb(var(--zc-subtle))] shadow-none'
              } ${isJoining ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              {isJoining ? 'Joining…' : 'Join Now'}
            </button>
            {!permissionResolved ? (
              <p className="mt-2 text-center text-[11px] text-[rgb(var(--zc-subtle))]">
                Allow camera &amp; microphone access to enable joining.
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="mt-2 w-full rounded-lg border border-[rgb(var(--zc-border))] px-4 py-2 text-sm text-[rgb(var(--zc-muted2))] transition hover:bg-[rgb(var(--zc-border)/0.45)]"
            >
              Cancel
            </button>
          </aside>
        </div>
      </section>
    )
  }

  // ── Live meeting room ──────────────────────────────────────────────────────
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-600">
              {meeting?.title || 'Meeting Room'}
            </span>
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[rgb(var(--zc-subtle))]">
            <span>
              {meeting?.date} {meeting?.time}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live
            </span>
            <span className="capitalize">• {lifecycle.status}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowChatPanel((prev) => !prev)}
            className={`${controlBtnBase} border-[rgb(var(--zc-border))] text-[rgb(var(--zc-muted2))] hover:bg-[rgb(var(--zc-border)/0.45)]`}
          >
            {showChatPanel ? '💬 Hide Chat' : '💬 Show Chat'}
          </button>
          <button
            type="button"
            onClick={() => {
              leaveMeeting({ reason: 'user-left' })
              navigate(-1)
            }}
            className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-500"
          >
            Leave
          </button>
        </div>
      </header>

      {isEndedMeeting ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          This meeting was scheduled for an earlier time. Access is still open for continued discussion
          and collaboration.
        </div>
      ) : null}

      <div className={`grid gap-6 ${showChatPanel ? 'xl:grid-cols-[1fr_300px]' : 'xl:grid-cols-[1fr_220px]'}`}>
        <div className="space-y-4">
          <div className="rounded-xl border border-l-4 border-[rgb(var(--zc-border))] border-l-fuchsia-500 bg-[rgb(var(--zc-bg)/0.3)] p-5">
            <h3 className="mb-4 text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-500 to-purple-600">
              {isSpotlightActive ? '🖥️ Screen Share' : '🎥 Participants'}
            </h3>

            {isSpotlightActive ? (
              <div className="grid gap-3 lg:grid-cols-[1fr_200px]">
                <VideoTile
                  stream={spotlight.stream}
                  label={spotlight.label}
                  muted={spotlight.muted}
                />
                <div className="flex gap-3 overflow-x-auto lg:max-h-[60vh] lg:flex-col lg:overflow-y-auto">
                  <div className="w-40 shrink-0 lg:w-full">
                    <VideoTile
                      stream={localStream}
                      label="You"
                      muted
                      audioMuted={isMuted}
                      cameraOff={isCameraOff}
                      initial={localInitial}
                    />
                  </div>
                  {remoteParticipantStreams.map((entry) => (
                    <div key={entry.userKey} className="w-40 shrink-0 lg:w-full">
                      <VideoTile stream={entry.stream} label={entry.label} audioMuted={entry.audioMuted} />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <VideoTile
                  stream={localStream}
                  label="You"
                  muted
                  audioMuted={isMuted}
                  cameraOff={isCameraOff}
                  initial={localInitial}
                />
                {remoteParticipantStreams.map((entry) => (
                  <VideoTile
                    key={entry.userKey}
                    stream={entry.stream}
                    label={entry.label}
                    audioMuted={entry.audioMuted}
                  />
                ))}
              </div>
            )}

            {sessionError ? (
              <div className="mt-3 rounded-lg border border-rose-500/50 bg-rose-500/10 p-3 text-xs text-rose-200">
                {sessionError}
              </div>
            ) : null}
          </div>

          {/* ── Control bar ── */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)] p-3">
            <button
              type="button"
              onClick={toggleMute}
              className={`${controlBtnBase} ${
                isMuted
                  ? 'border-rose-500/50 bg-rose-500/15 text-rose-200'
                  : 'border-[rgb(var(--zc-border))] text-[rgb(var(--zc-muted2))] hover:bg-[rgb(var(--zc-border)/0.45)]'
              }`}
            >
              {isMuted ? '🔇 Unmute' : '🎙️ Mute'}
            </button>
            <button
              type="button"
              onClick={toggleCamera}
              className={`${controlBtnBase} ${
                isCameraOff
                  ? 'border-amber-500/50 bg-amber-500/15 text-amber-200'
                  : 'border-[rgb(var(--zc-border))] text-[rgb(var(--zc-muted2))] hover:bg-[rgb(var(--zc-border)/0.45)]'
              }`}
            >
              {isCameraOff ? '🚫 Camera On' : '📹 Camera Off'}
            </button>
            <button
              type="button"
              onClick={() => void toggleScreenShare()}
              className={`${controlBtnBase} ${
                isSharingScreen
                  ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-200'
                  : 'border-[rgb(var(--zc-border))] text-[rgb(var(--zc-muted2))] hover:bg-[rgb(var(--zc-border)/0.45)]'
              }`}
            >
              {isSharingScreen ? '🖥️ Stop Share' : '🖥️ Share Screen'}
            </button>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-l-4 border-[rgb(var(--zc-border))] border-l-indigo-500 bg-[rgb(var(--zc-bg)/0.3)] p-4">
            <h3 className="text-sm font-semibold text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-cyan-600">
              Participants ({participantCount})
            </h3>
            <ul className="mt-3 space-y-1.5 text-xs">
              {participants.map((entry) => {
                const muted = entry.isLocal ? isMuted : Boolean(remoteParticipantStreams.find((e) => e.userKey === entry.userKey)?.audioMuted)
                return (
                  <li
                    key={entry.userKey}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-2.5 py-1.5"
                  >
                    <span className="truncate text-[rgb(var(--zc-text))]">
                      {entry.isLocal ? 'You' : entry.label}
                    </span>
                    {muted ? <MicOffIcon className="h-3.5 w-3.5 shrink-0 text-rose-400" /> : null}
                  </li>
                )
              })}
            </ul>
          </div>

          {showChatPanel ? (
            <div className="rounded-xl border border-l-4 border-[rgb(var(--zc-border))] border-l-purple-500 bg-[rgb(var(--zc-bg)/0.3)] p-4">
              <h3 className="text-sm font-semibold text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-fuchsia-600">
                Side Chat
              </h3>
              <div className="mt-3 max-h-60 space-y-1 overflow-y-auto text-xs">
                {roomMessages.map((msg) => (
                  <div key={msg.id} className="rounded-lg bg-[rgb(var(--zc-panel)/0.45)] px-2 py-1">
                    <span className="font-medium text-[rgb(var(--zc-text))]">
                      {msg.senderName || 'Participant'}:{' '}
                    </span>
                    <span className="text-[rgb(var(--zc-muted))]">{msg.text}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-1.5">
                <input
                  value={roomChatInput}
                  onChange={(e) => setRoomChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                  className="flex-1 rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 py-1.5 text-xs text-[rgb(var(--zc-text))] focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                  placeholder="Message..."
                />
                <button
                  type="button"
                  onClick={sendMessage}
                  className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-400"
                >
                  Send
                </button>
              </div>
            </div>
          ) : null}

          <p className="px-1 text-[11px] text-[rgb(var(--zc-subtle))]">
            Meeting session is managed globally and remains active across app navigation until you
            explicitly leave.
          </p>
        </aside>
      </div>
    </section>
  )
}
