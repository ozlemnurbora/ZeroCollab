import { useEffect, useRef } from 'react'
import { CHAT_USERS } from './chatConstants.js'
import { formatTimestamp, formatTimestampLong } from './timeUtils.js'

function initials(name) {
  if (!name) return '?'
  const parts = name.split(' ').filter(Boolean)
  return (parts[0]?.[0] ?? '?').toUpperCase()
}

function avatarColor(name) {
  const idx = Math.max(0, CHAT_USERS.indexOf(name))
  const colors = [
    'bg-indigo-500/30 text-indigo-200 ring-indigo-500/30',
    'bg-emerald-500/20 text-emerald-200 ring-emerald-500/30',
    'bg-rose-500/20 text-rose-200 ring-rose-500/30',
  ]
  return colors[idx] ?? colors[0]
}

export function MessageList({ messages, currentUser }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length])

  if (!messages.length) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="rounded-lg border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] p-4 text-sm text-[rgb(var(--zc-muted2))]">
          No messages yet. Say hi.
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="space-y-4">
        {messages.map((m) => {
          const mine = m.sender === currentUser
          return (
            <div key={m.id} className="flex gap-3">
              <div
                className={[
                  'mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg ring-1 ring-inset',
                  avatarColor(m.sender),
                ].join(' ')}
                aria-hidden="true"
              >
                <span className="text-xs font-bold">{initials(m.sender)}</span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <p className="text-sm font-semibold text-[rgb(var(--zc-text))]">
                    {m.sender || 'Unknown'}
                  </p>
                  <time
                    className="text-xs text-[rgb(var(--zc-subtle))]"
                    title={formatTimestampLong(m.createdAt)}
                    dateTime={new Date(m.createdAt).toISOString()}
                  >
                    {formatTimestamp(m.createdAt)}
                  </time>
                  {mine ? (
                    <span className="rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-200 ring-1 ring-inset ring-indigo-500/20">
                      You
                    </span>
                  ) : null}
                </div>

                <div className="mt-1 rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.4)] px-3 py-2 text-sm text-[rgb(var(--zc-text))]">
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

