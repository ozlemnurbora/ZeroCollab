import { useEffect, useRef } from 'react'

export function VideoCall({
  isOpen,
  localStream,
  remoteStream,
  remotePeerId,
  isMuted,
  isCameraOff,
  isSharingScreen,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onEndCall,
  incomingCallFrom,
  onAcceptIncoming,
  onDeclineIncoming,
}) {
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream ?? null
    }
  }, [localStream])

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream ?? null
    }
  }, [remoteStream])

  return (
    <>
      {incomingCallFrom && !isOpen && (
        <div className="fixed bottom-4 right-4 z-[100] w-[min(92vw,360px)] rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.96)] p-4 shadow-2xl backdrop-blur">
          <p className="text-sm font-semibold text-[rgb(var(--zc-text))]">
            Incoming call
          </p>
          <p className="mt-1 text-xs text-[rgb(var(--zc-muted2))]">
            {incomingCallFrom}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onAcceptIncoming}
              className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-400"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={onDeclineIncoming}
              className="rounded-md bg-rose-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-400"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[90] bg-slate-950">
          <div className="flex h-full w-full flex-col">
            <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-white">
                  Video Call
                </p>
                <p className="text-xs text-slate-300">
                  {remotePeerId ? `Connected with ${remotePeerId}` : 'Connecting...'}
                </p>
              </div>
              <button
                type="button"
                onClick={onEndCall}
                className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"
              >
                Close
              </button>
            </header>

            <div className="relative flex-1 overflow-hidden">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="h-full w-full bg-black object-cover"
              />
              {!remoteStream && (
                <div className="absolute inset-0 grid place-items-center text-sm text-slate-300">
                  Waiting for remote video...
                </div>
              )}

              <div className="absolute bottom-4 right-4 h-40 w-64 overflow-hidden rounded-lg border border-white/20 bg-black shadow-xl">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="h-full w-full object-cover"
                />
              </div>
            </div>

            <footer className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 px-4 py-4">
              <button
                type="button"
                onClick={onToggleMute}
                className="rounded-full border border-white/20 bg-slate-900/80 px-4 py-2 text-xs text-white hover:bg-slate-800"
              >
                {isMuted ? 'Unmute Mic' : 'Mute Mic'}
              </button>
              <button
                type="button"
                onClick={onToggleCamera}
                className="rounded-full border border-white/20 bg-slate-900/80 px-4 py-2 text-xs text-white hover:bg-slate-800"
              >
                {isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
              </button>
              <button
                type="button"
                onClick={onToggleScreenShare}
                className="rounded-full border border-white/20 bg-slate-900/80 px-4 py-2 text-xs text-white hover:bg-slate-800"
              >
                {isSharingScreen ? 'Stop Sharing' : 'Share Screen'}
              </button>
              <button
                type="button"
                onClick={onEndCall}
                className="rounded-full bg-rose-600 px-4 py-2 text-xs font-medium text-white hover:bg-rose-500"
              >
                End Call
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  )
}
