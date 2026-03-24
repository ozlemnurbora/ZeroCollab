import { useEffect, useRef } from 'react'
import { CHAT_USERS } from './chatConstants.js'
import { formatTimestamp, formatTimestampLong } from './timeUtils.js'
import { useLanguage } from '../../utils/LanguageContext.jsx'

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

export function MessageList({
  messages,
  currentUser,
  currentUserAvatarColor,
  fileUrls = {},
  fileTransfers = {},
}) {
  const { t, locale } = useLanguage()
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length])

  if (!messages.length) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="rounded-lg border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] p-4 text-sm text-[rgb(var(--zc-muted2))]">
          {t('chat_no_messages')}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="space-y-4">
        {messages.map((m) => {
          const mine = m.sender === currentUser
          const isFile = m.kind === 'file' && m.file
          const transfer = fileTransfers[m.id]
          return (
            <div key={m.id} className="flex gap-3">
              <div
                className={[
                  'mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg ring-1 ring-inset',
                  mine ? 'text-white ring-white/25' : avatarColor(m.sender),
                ].join(' ')}
                style={
                  mine && currentUserAvatarColor
                    ? { backgroundColor: currentUserAvatarColor }
                    : undefined
                }
                aria-hidden="true"
              >
                <span className="text-xs font-bold">{initials(m.sender)}</span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <p className="text-sm font-semibold text-[rgb(var(--zc-text))]">
                    {m.sender || t('chat_unknown')}
                  </p>
                  <time
                    className="text-xs text-[rgb(var(--zc-subtle))]"
                    title={formatTimestampLong(m.createdAt, locale)}
                    dateTime={new Date(m.createdAt).toISOString()}
                  >
                    {formatTimestamp(m.createdAt, locale)}
                  </time>
                  {mine ? (
                    <span className="rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-200 ring-1 ring-inset ring-indigo-500/20">
                      {t('chat_you_badge')}
                    </span>
                  ) : null}
                </div>

                {isFile ? (
                  <div className="mt-1 rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.4)] px-3 py-3 text-sm text-[rgb(var(--zc-text))]">
                    <div className="flex items-center gap-3">
                      {m.file.type?.startsWith('image/') && fileUrls[m.id] ? (
                        <img
                          src={fileUrls[m.id]}
                          alt={m.file.name}
                          className="max-h-40 w-auto rounded-md object-contain ring-1 ring-inset ring-[rgb(var(--zc-border))]"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-indigo-500/20 text-xs font-semibold text-indigo-200 ring-1 ring-inset ring-indigo-500/40">
                          {m.file.name?.split('.').pop()?.toUpperCase() || t('file_label')}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[rgb(var(--zc-text))]">
                          {m.file.name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[rgb(var(--zc-subtle))]">
                          {(m.file.size / (1024 * 1024)).toFixed(2)} MB •{' '}
                          {m.file.type || t('chat_unknown_type')}
                        </p>
                        {fileUrls[m.id] ? (
                          <a
                            href={fileUrls[m.id]}
                            download={m.file.name}
                            className="mt-1 inline-flex items-center gap-1 rounded-md bg-[rgb(var(--zc-bg)/0.9)] px-2 py-1 text-[11px] font-medium text-[rgb(var(--zc-muted))] ring-1 ring-inset ring-[rgb(var(--zc-border))] hover:bg-[rgb(var(--zc-panel)/0.9)]"
                          >
                            {t('chat_download')}
                          </a>
                        ) : (
                          <p className="mt-1 text-[11px] text-[rgb(var(--zc-subtle))]">
                            {t('chat_waiting_transfer')}
                          </p>
                        )}
                      </div>
                    </div>
                    {transfer ? (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-[11px] text-[rgb(var(--zc-subtle))]">
                          <span>
                            {transfer.direction === 'upload'
                              ? t('chat_uploading')
                              : t('chat_downloading')}{' '}
                            {transfer.percent}%
                          </span>
                          <span>{transfer.speedLabel}</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[rgb(var(--zc-panel))] ring-1 ring-inset ring-[rgb(var(--zc-border))]">
                          <div
                            className="h-full rounded-full bg-indigo-500/80"
                            style={{ width: `${transfer.percent}%` }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-1 rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.4)] px-3 py-2 text-sm text-[rgb(var(--zc-text))]">
                    <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
