import { useLocation, useNavigate } from 'react-router-dom'
import { useMeetingSession } from '../../utils/MeetingSessionContext.jsx'

export function MiniMeetingDock() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    activeMeeting,
    sessionStatus,
    participantCount,
    isMuted,
    isCameraOff,
    toggleMute,
    toggleCamera,
    leaveMeeting,
  } = useMeetingSession()

  if (!activeMeeting) return null

  // Hide the floating dock when the user is already on the meeting room page
  // (/meetings/:id). It only acts as a "return to meeting" affordance elsewhere.
  const onMeetingRoomRoute = /^\/meetings\/[^/]+/.test(location.pathname)
  if (onMeetingRoomRoute) return null

  const statusLabel =
    sessionStatus === 'live'
      ? 'Live'
      : sessionStatus === 'joining'
        ? 'Joining'
        : sessionStatus === 'reconnecting'
          ? 'Reconnecting'
          : 'Active'

  return (
    <div className="fixed bottom-4 right-4 z-[95] w-[min(92vw,360px)] rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.96)] p-3 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[rgb(var(--zc-text))]">
            {activeMeeting.title}
          </p>
          <p className="mt-0.5 text-xs text-[rgb(var(--zc-subtle))]">
            {statusLabel} • {participantCount} participants
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/meetings/${activeMeeting.meetingId}`)}
          className="rounded-md bg-indigo-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-400"
        >
          Return
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={toggleMute}
          className="rounded-md border border-[rgb(var(--zc-border))] px-2.5 py-1 text-xs text-[rgb(var(--zc-muted2))] hover:bg-[rgb(var(--zc-border)/0.45)]"
        >
          {isMuted ? 'Unmute' : 'Mute'}
        </button>
        <button
          type="button"
          onClick={toggleCamera}
          className="rounded-md border border-[rgb(var(--zc-border))] px-2.5 py-1 text-xs text-[rgb(var(--zc-muted2))] hover:bg-[rgb(var(--zc-border)/0.45)]"
        >
          {isCameraOff ? 'Camera On' : 'Camera Off'}
        </button>
        <button
          type="button"
          onClick={() => leaveMeeting({ reason: 'user-left' })}
          className="ml-auto rounded-md bg-rose-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-500"
        >
          Leave
        </button>
      </div>
    </div>
  )
}
