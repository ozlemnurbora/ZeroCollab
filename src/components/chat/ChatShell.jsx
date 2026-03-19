import { useEffect, useMemo, useRef, useState } from 'react'
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
import { loadSettings } from '../settings/settingsStorage.js'
import {
  P2P_EVENTS,
  P2P_STATUS,
  connectToPeer,
  getConnectedPeers,
  getPeerId,
  getStatus,
  initP2P,
  on as onP2PEvent,
  sendToAllPeers,
} from '../../utils/p2pManager.js'

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
  const [me, setMe] = useState(CHAT_USERS[0])
  const [activeId, setActiveId] = useState('general')
  const [messages, setMessages] = useState([])
  const [myAvatarColor, setMyAvatarColor] = useState(null)
  const [isLoadingChat, setIsLoadingChat] = useState(true)
  const [hasLoadedChat, setHasLoadedChat] = useState(false)
  const [peerId, setPeerId] = useState('')
  const [p2pStatus, setP2pStatus] = useState(P2P_STATUS.OFFLINE)
  const [connectPeerInput, setConnectPeerInput] = useState('')
  const [connectedPeers, setConnectedPeers] = useState([])
  const [pendingFile, setPendingFile] = useState(null)
  const [fileUrls, setFileUrls] = useState({})
  const [fileTransfers, setFileTransfers] = useState({})
  const incomingFileChunksRef = useRef(new Map())
  const transferMetaRef = useRef(new Map())

  useEffect(() => {
    if (!hasLoadedChat) return
    void saveChatUser(me)
  }, [me])

  useEffect(() => {
    if (!hasLoadedChat) return
    void saveActiveChannelId(activeId)
  }, [activeId])

  useEffect(() => {
    if (!hasLoadedChat) return
    void saveMessages(messages)
  }, [messages])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setIsLoadingChat(true)
      const [u, ch, msgs, s] = await Promise.all([
        loadChatUser(),
        loadActiveChannelId(),
        loadMessages(),
        loadSettings(),
      ])
      if (cancelled) return
      setMe(u ?? CHAT_USERS[0])
      setActiveId(ch)
      setMessages(Array.isArray(msgs) ? msgs : [])
      setMyAvatarColor(s?.profile?.avatarColor || null)
      setHasLoadedChat(true)
      setIsLoadingChat(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { peerId: id } = await initP2P()
      if (!cancelled) {
        setPeerId(id ?? '')
        setP2pStatus(getStatus())
        setConnectedPeers(getConnectedPeers())
      }
    })()

    const offStatus = onP2PEvent(P2P_EVENTS.STATUS_CHANGE, (s) => {
      // eslint-disable-next-line no-console
      console.log('[ChatShell] P2P status-change', s)
      setP2pStatus(s)
    })
    const offConnected = onP2PEvent(P2P_EVENTS.PEER_CONNECTED, (info) => {
      // eslint-disable-next-line no-console
      console.log('[ChatShell] P2P: connection established', info)
      setConnectedPeers(getConnectedPeers())
    })
    const offDisconnected = onP2PEvent(P2P_EVENTS.PEER_DISCONNECTED, (info) => {
      // eslint-disable-next-line no-console
      console.log('[ChatShell] P2P: connection closed', info)
      setConnectedPeers(getConnectedPeers())
    })
    const offMessage = onP2PEvent(P2P_EVENTS.MESSAGE, ({ from, data }) => {
      // eslint-disable-next-line no-console
      console.log('[ChatShell] P2P: received message...', { from, data })
      if (!data || !data.type) return
      if (data.type === 'chat-message') {
        const incoming = data.payload
        if (!incoming || !incoming.id) return
        setMessages((prev) => {
          if (prev.some((m) => m.id === incoming.id)) return prev
          return [...prev, incoming]
        })
      } else if (data.type === 'file-meta') {
        const meta = data.payload
        if (!meta || !meta.id) return
        transferMetaRef.current.set(meta.id, meta)
        incomingFileChunksRef.current.set(meta.id, [])
        updateTransferState(meta.id, {
          direction: 'download',
          totalBytes: meta.size,
          transferredBytes: 0,
          totalChunks: meta.totalChunks,
          completedChunks: 0,
          percent: 0,
          speedLabel: '',
          startedAt: performance.now(),
        })
      } else if (data.type === 'file-chunk') {
        const payload = data.payload
        if (!payload || !payload.id || !payload.chunk) return
        const meta = transferMetaRef.current.get(payload.id)
        if (!meta) return
        const chunks = incomingFileChunksRef.current.get(payload.id) ?? []
        chunks[payload.index] = payload.chunk
        incomingFileChunksRef.current.set(payload.id, chunks)

        const transferredBytes = chunks.reduce(
          (sum, c) => sum + (c ? c.length : 0),
          0,
        )
        const startedAt = fileTransfers[payload.id]?.startedAt ?? performance.now()
        const elapsedMs = Math.max(1, performance.now() - startedAt)
        const bytesPerSecond = (transferredBytes / elapsedMs) * 1000
        const kbPerSecond = bytesPerSecond / 1024

        updateTransferState(payload.id, {
          transferredBytes,
          completedChunks: (fileTransfers[payload.id]?.completedChunks ?? 0) + 1,
          percent: Math.round((transferredBytes / meta.size) * 100),
          speedLabel: `${kbPerSecond.toFixed(1)} KB/s`,
          startedAt,
        })

        if (transferredBytes >= meta.size) {
          const blob = new Blob(chunks, { type: meta.type || 'application/octet-stream' })
          const url = URL.createObjectURL(blob)
          setFileUrls((prev) => ({ ...prev, [meta.id]: url }))
          const message = {
            id: meta.id,
            channelId: meta.channelId,
            sender: meta.sender ?? from,
            createdAt: meta.createdAt ?? Date.now(),
            kind: 'file',
            file: {
              name: meta.name,
              size: meta.size,
              type: meta.type,
            },
          }
          setMessages((prev) => {
            if (prev.some((m) => m.id === message.id)) return prev
            return [...prev, message]
          })
          updateTransferState(payload.id, {
            percent: 100,
          })
          transferMetaRef.current.delete(payload.id)
          incomingFileChunksRef.current.delete(payload.id)
        }
      }
    })

    return () => {
      cancelled = true
      offStatus()
      offConnected()
      offDisconnected()
      offMessage()
    }
  }, [])

  useEffect(() => {
    const onDbChange = (e) => {
      const detail = e?.detail
      // eslint-disable-next-line no-console
      console.log('[ChatShell] zerocollab:idb event', detail)
      if (!detail?.store) return
      // For now, only react to settings changes so that local
      // message state is not overridden right after sending.
      if (detail.store === 'settings') {
        void loadChatUser().then((u) => setMe(u ?? CHAT_USERS[0]))
        void loadActiveChannelId().then(setActiveId)
        void loadSettings().then((s) => setMyAvatarColor(s?.profile?.avatarColor || null))
      }
    }
    window.addEventListener('zerocollab:idb', onDbChange)
    return () => window.removeEventListener('zerocollab:idb', onDbChange)
  }, [])

  const activeMessages = useMemo(
    () => messages.filter((m) => m.channelId === activeId),
    [messages, activeId],
  )

  const sendMessage = (text) => {
    // eslint-disable-next-line no-console
    console.log('[ChatShell] sendMessage', { text, activeId, me })
    const now = Date.now()
    const next = {
      id: createId(),
      channelId: activeId,
      sender: me,
      text,
      createdAt: now,
    }
    setMessages((prev) => {
      const updated = [...prev, next]
      // eslint-disable-next-line no-console
      console.log('[ChatShell] messages after local append', updated.length)
      return updated
    })
    // eslint-disable-next-line no-console
    console.log('[ChatShell] broadcasting over P2P', next)
    sendToAllPeers({ type: 'chat-message', payload: next })
  }

  const handleFileSelected = (file) => {
    if (!file) return
    const isImage = file.type.startsWith('image/')
    const previewUrl = URL.createObjectURL(file)
    setPendingFile({ file, isImage, previewUrl })
  }

  const handleCancelFile = () => {
    if (pendingFile?.previewUrl) {
      URL.revokeObjectURL(pendingFile.previewUrl)
    }
    setPendingFile(null)
  }

  const updateTransferState = (id, partial) => {
    setFileTransfers((prev) => {
      const current = prev[id] ?? {}
      const next = { ...current, ...partial }
      return { ...prev, [id]: next }
    })
  }

  const handleSendFile = async () => {
    if (!pendingFile) return
    const file = pendingFile.file
    const id = createId()
    const now = Date.now()
    const channelId = activeId
    const sender = me
    const maxSize = 50 * 1024 * 1024
    if (file.size > maxSize) {
      // eslint-disable-next-line no-alert
      alert('Maximum file size is 50MB.')
      return
    }

    const CHUNK_SIZE = 64 * 1024
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE)

    const message = {
      id,
      channelId,
      sender,
      createdAt: now,
      kind: 'file',
      file: {
        name: file.name,
        size: file.size,
        type: file.type,
      },
    }

    setMessages((prev) => [...prev, message])
    const localUrl = URL.createObjectURL(file)
    setFileUrls((prev) => ({ ...prev, [id]: localUrl }))

    const startTime = performance.now()
    updateTransferState(id, {
      direction: 'upload',
      totalBytes: file.size,
      transferredBytes: 0,
      totalChunks,
      completedChunks: 0,
      percent: 0,
      speedLabel: '',
    })

    sendToAllPeers({
      type: 'file-meta',
      payload: {
        id,
        channelId,
        sender,
        createdAt: now,
        name: file.name,
        size: file.size,
        type: file.type,
        totalChunks,
      },
    })

    const buffer = await file.arrayBuffer()
    const view = new Uint8Array(buffer)

    for (let index = 0; index < totalChunks; index++) {
      const start = index * CHUNK_SIZE
      const end = Math.min(start + CHUNK_SIZE, view.length)
      const chunk = view.slice(start, end)
      sendToAllPeers({
        type: 'file-chunk',
        payload: {
          id,
          index,
          total: totalChunks,
          chunk,
        },
      })

      const transferredBytes = end
      const elapsedMs = Math.max(1, performance.now() - startTime)
      const bytesPerSecond = (transferredBytes / elapsedMs) * 1000
      const kbPerSecond = bytesPerSecond / 1024
      updateTransferState(id, {
        transferredBytes,
        completedChunks: index + 1,
        percent: Math.round((transferredBytes / file.size) * 100),
        speedLabel: `${kbPerSecond.toFixed(1)} KB/s`,
      })
    }

    updateTransferState(id, {
      percent: 100,
    })
    handleCancelFile()
  }

  const handleConnectClick = async () => {
    const value = connectPeerInput.trim()
    if (!value || value === getPeerId()) return
    // eslint-disable-next-line no-console
    console.log('[ChatShell] connectToPeer clicked', value)
    await connectToPeer(value)
    setConnectedPeers(getConnectedPeers())
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
              Messages are stored in IndexedDB and mirrored via P2P (PeerJS).
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.6)] px-2 py-0.5 text-[rgb(var(--zc-muted2))]">
                Peer ID:{' '}
                <span className="font-mono text-[rgb(var(--zc-text))]">
                  {peerId || 'initializing…'}
                </span>
              </span>
              <span
                className={[
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
                  p2pStatus === P2P_STATUS.ONLINE
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                    : p2pStatus === P2P_STATUS.CONNECTING
                      ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                      : 'border-rose-500/50 bg-rose-500/10 text-rose-300',
                ].join(' ')}
              >
                <span
                  className={[
                    'h-2 w-2 rounded-full',
                    p2pStatus === P2P_STATUS.ONLINE
                      ? 'bg-emerald-400'
                      : p2pStatus === P2P_STATUS.CONNECTING
                        ? 'bg-amber-400'
                        : 'bg-rose-400',
                  ].join(' ')}
                />
                <span className="capitalize">
                  {p2pStatus === P2P_STATUS.ONLINE
                    ? 'Connected'
                    : p2pStatus === P2P_STATUS.CONNECTING
                      ? 'Connecting'
                      : 'Disconnected'}
                </span>
              </span>
              {connectedPeers.length > 0 && (
                <span className="text-[rgb(var(--zc-muted2))]">
                  Peers:{' '}
                  <span className="font-mono">
                    {connectedPeers.join(', ')}
                  </span>
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
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

            <div className="flex items-center gap-2">
              <input
                className="h-9 flex-1 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 text-xs text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                placeholder="Connect to peer ID…"
                value={connectPeerInput}
                onChange={(e) => setConnectPeerInput(e.target.value)}
              />
              <button
                type="button"
                className="h-9 rounded-md bg-indigo-500/90 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-indigo-500/40"
                onClick={handleConnectClick}
                disabled={!connectPeerInput.trim()}
              >
                Connect
              </button>
            </div>
          </div>
        </header>

        {isLoadingChat ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="rounded-lg border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-4 text-sm text-[rgb(var(--zc-muted2))]">
              Loading chat…
            </div>
          </div>
        ) : (
          <MessageList
            messages={activeMessages}
            currentUser={me}
            currentUserAvatarColor={myAvatarColor}
            fileUrls={fileUrls}
            fileTransfers={fileTransfers}
          />
        )}

        <MessageComposer
          onSend={sendMessage}
           onFileSelect={handleFileSelected}
           pendingFile={pendingFile}
           onSendFile={handleSendFile}
           onCancelFile={handleCancelFile}
          placeholder={`Message ${activeId.startsWith('dm:') ? channelLabel(activeId) : '# ' + channelLabel(activeId)}`}
        />
      </section>
    </div>
  )
}

