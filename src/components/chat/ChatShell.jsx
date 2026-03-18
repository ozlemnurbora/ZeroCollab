import { useEffect, useMemo, useState } from 'react'
import { ConversationList } from './ConversationList.jsx'
import { MessageList } from './MessageList.jsx'
import { MessageComposer } from './MessageComposer.jsx'
import { CHAT_CHANNELS, CHAT_USERS } from './chatConstants.js'
import {
  loadActiveChannelId,
  loadChatUser,
  loadMessages,
  saveActiveChannelId,
  saveChatUser,
  saveMessages,
} from './chatStorage.js'

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID)
    return crypto.randomUUID()
  return `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function channelLabel(id) {
  const found = CHAT_CHANNELS.find((c) => c.id === id)
  return found?.name ?? 'Conversation'
}

export function ChatShell() {
  const [me, setMe] = useState(() => loadChatUser() ?? CHAT_USERS[0])
  const [activeId, setActiveId] = useState(() => loadActiveChannelId())
  const [messages, setMessages] = useState(() => loadMessages())

  useEffect(() => {
    saveChatUser(me)
  }, [me])

  useEffect(() => {
    saveActiveChannelId(activeId)
  }, [activeId])

  useEffect(() => {
    saveMessages(messages)
  }, [messages])

  useEffect(() => {
    const onStorage = (e) => {
      if (!e.key) return
      if (e.key === 'zerocollab.chat.messages.v1') setMessages(loadMessages())
      if (e.key === 'zerocollab.chat.user.v1') setMe(loadChatUser() ?? CHAT_USERS[0])
      if (e.key === 'zerocollab.chat.channel.v1') setActiveId(loadActiveChannelId())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const activeMessages = useMemo(
    () => messages.filter((m) => m.channelId === activeId),
    [messages, activeId],
  )

  const sendMessage = (text) => {
    const now = Date.now()
    const next = {
      id: createId(),
      channelId: activeId,
      sender: me,
      text,
      createdAt: now,
    }
    setMessages((prev) => [...prev, next])
  }

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="lg:sticky lg:top-6 lg:h-[calc(100vh-11rem)]">
        <ConversationList
          activeId={activeId}
          onSelect={(id) => setActiveId(id)}
        />
      </div>

      <section className="flex min-h-[520px] flex-col overflow-hidden rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)] lg:h-[calc(100vh-11rem)]">
        <header className="flex flex-col gap-3 border-b border-[rgb(var(--zc-border))] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[rgb(var(--zc-text))]">
              {channelLabel(activeId)}
            </p>
            <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
              Messages are stored locally for now.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-[rgb(var(--zc-muted2))]">
              You
            </label>
            <select
              className="h-9 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              value={me}
              onChange={(e) => setMe(e.target.value)}
            >
              {CHAT_USERS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </header>

        <MessageList messages={activeMessages} currentUser={me} />

        <MessageComposer
          onSend={sendMessage}
          placeholder={`Message ${activeId.startsWith('dm:') ? channelLabel(activeId) : '# ' + channelLabel(activeId)}`}
        />
      </section>
    </div>
  )
}

