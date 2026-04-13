import { useEffect, useMemo, useRef, useState } from 'react'
import { ConversationList } from './ConversationList.jsx'
import { MessageList } from './MessageList.jsx'
import { MessageComposer } from './MessageComposer.jsx'
import { DEFAULT_CHANNELS } from './chatConstants.js'
import {
  loadActiveChannelId,
  loadMessages,
  saveActiveChannelId,
  saveMessages,
} from './chatStorage.js'
import { loadSettings } from '../settings/settingsStorage.js'
import { useWorkspace } from '../../utils/WorkspaceContext.jsx'
import { useAuth } from '../../utils/AuthContext.jsx'
import {
  joinProjectHub,
  leaveProjectHub,
  broadcastMessage,
  getOnlineMembers,
  broadcastCallInvite,
  broadcastCallResponse,
} from '../../utils/hubManager.js'
import {
  P2P_EVENTS,
  connectToPeer,
  getConnectedPeers,
  getPeerId,
  initP2P,
  on as onP2PEvent,
  placeCall,
  sendToAllPeers,
} from '../../utils/p2pManager.js'
import { CallButton } from '../call/CallButton.jsx'
import { VideoCall } from '../call/VideoCall.jsx'
import { useLanguage } from '../../utils/LanguageContext.jsx'

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID)
    return crypto.randomUUID()
  return `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function ChatShell() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const { activeProject, teams } = useWorkspace()
  const [onlineMembers, setOnlineMembers] = useState([])
  const [hubConnected, setHubConnected] = useState(false)

  const dynamicChannels = useMemo(() => {
    const channels = [...DEFAULT_CHANNELS]

    if (activeProject && activeProject.teamIds && activeProject.teamIds.length > 0) {
      const projectTeams = (teams || []).filter((team) =>
        activeProject.teamIds.includes(team.id),
      )
      projectTeams.forEach((team) => {
        channels.push({
          id: `team:${team.id}`,
          type: 'channel',
          name: team.name,
          teamId: team.id,
        })
      })
    } else if (!activeProject) {
      ;(teams || []).forEach((team) => {
        channels.push({
          id: `team:${team.id}`,
          type: 'channel',
          name: team.name,
          teamId: team.id,
        })
      })
    }

    return channels
  }, [teams, activeProject])

  const dmList = useMemo(() => {
    if (!activeProject || !teams) return []
    const projectTeamIds = activeProject.teamIds || []
    const projectTeams = teams.filter((team) => projectTeamIds.includes(team.id))
    const members = new Set()
    projectTeams.forEach((team) => {
      ;(team.members || []).forEach((member) => members.add(member))
    })
    return Array.from(members).map((member) => ({
      id: `dm:${member.toLowerCase().replace(/\s+/g, '_')}`,
      type: 'dm',
      name: member,
    }))
  }, [activeProject, teams])

  const allConversations = useMemo(
    () => [...dynamicChannels, ...dmList],
    [dynamicChannels, dmList],
  )

  const channelLabel = (id) => {
    const found = allConversations.find((c) => c.id === id)
    if (found) return found.name
    return id
  }

  const me = useMemo(() => {
    if (user?.email) {
      return user.email.split('@')[0]
    }
    return t('chat_anonymous')
  }, [user, t])
  const [activeId, setActiveId] = useState('general')
  const [messages, setMessages] = useState([])
  const [myAvatarColor, setMyAvatarColor] = useState(null)
  const [isLoadingChat, setIsLoadingChat] = useState(true)
  const [hasLoadedChat, setHasLoadedChat] = useState(false)
  const [peerId, setPeerId] = useState('')
  const [connectedPeers, setConnectedPeers] = useState([])
  const [pendingFile, setPendingFile] = useState(null)
  const [fileUrls, setFileUrls] = useState({})
  const [fileTransfers, setFileTransfers] = useState({})
  const [isCallOpen, setIsCallOpen] = useState(false)
  const [incomingGroupCall, setIncomingGroupCall] = useState(null)
  const [groupCallParticipants, setGroupCallParticipants] = useState([])
  const [incomingMediaCall, setIncomingMediaCall] = useState(null)
  const [incomingCallFrom, setIncomingCallFrom] = useState('')
  const [activeCallPeerId, setActiveCallPeerId] = useState('')
  const [localStream, setLocalStream] = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)
  const [isSharingScreen, setIsSharingScreen] = useState(false)
  const incomingFileChunksRef = useRef(new Map())
  const transferMetaRef = useRef(new Map())
  const activeCallRef = useRef(null)
  const localStreamRef = useRef(null)
  const activeCallPeerIdRef = useRef('')
  const cameraTrackRef = useRef(null)
  const screenTrackRef = useRef(null)
  const bindMediaCallRef = useRef(() => {})

  const replaceOutgoingVideoTrack = (track) => {
    const senders = activeCallRef.current?.peerConnection?.getSenders?.() ?? []
    const videoSender = senders.find((sender) => sender?.track?.kind === 'video')
    if (videoSender) {
      void videoSender.replaceTrack(track)
    }
  }

  const stopStream = (stream) => {
    stream?.getTracks?.().forEach((track) => track.stop())
  }

  useEffect(() => {
    localStreamRef.current = localStream
  }, [localStream])

  useEffect(() => {
    activeCallPeerIdRef.current = activeCallPeerId
  }, [activeCallPeerId])

  const resetCallState = () => {
    activeCallRef.current = null
    screenTrackRef.current = null
    setIsCallOpen(false)
    setActiveCallPeerId('')
    setRemoteStream(null)
    setIsMuted(false)
    setIsCameraOff(false)
    setIsSharingScreen(false)
    setGroupCallParticipants([])
  }

  const teardownCall = ({ stopLocal = true, notifyPeer = false } = {}) => {
    const targetPeerId = activeCallPeerIdRef.current
    if (notifyPeer && targetPeerId) {
      sendToAllPeers({
        type: 'call-ended',
        payload: { to: targetPeerId },
      })
    }
    try {
      activeCallRef.current?.close?.()
    } catch {
      // ignore
    }
    if (stopLocal) {
      stopStream(localStreamRef.current)
      setLocalStream(null)
      localStreamRef.current = null
      cameraTrackRef.current = null
    }
    resetCallState()
  }

  const startLocalStream = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    })
    cameraTrackRef.current = stream.getVideoTracks()[0] ?? null
    setLocalStream(stream)
    setIsMuted(false)
    setIsCameraOff(false)
    return stream
  }

  const bindMediaCall = (mediaCall) => {
    if (!mediaCall) return
    activeCallRef.current = mediaCall
    setActiveCallPeerId(mediaCall.peer ?? '')
    setIsCallOpen(true)
    mediaCall.on('stream', (stream) => {
      setRemoteStream(stream)
    })
    mediaCall.on('close', () => {
      teardownCall({ stopLocal: true, notifyPeer: false })
    })
    mediaCall.on('error', () => {
      teardownCall({ stopLocal: true, notifyPeer: false })
    })
  }

  bindMediaCallRef.current = bindMediaCall

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
      const [ch, msgs, s] = await Promise.all([
        loadActiveChannelId(),
        loadMessages(),
        loadSettings(),
      ])
      if (cancelled) return
      const p = s?.profile
      setActiveId(ch)
      setMessages(Array.isArray(msgs) ? msgs : [])
      setMyAvatarColor(p?.avatarColor || null)
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
        setConnectedPeers(getConnectedPeers())
      }
    })()

    const offConnected = onP2PEvent(P2P_EVENTS.PEER_CONNECTED, (info) => {
      // eslint-disable-next-line no-console
      console.log('[ChatShell] P2P: connection established', info)
      setConnectedPeers(getConnectedPeers())
      const allPeers = getConnectedPeers()
      if (allPeers.length > 1) {
        sendToAllPeers({
          type: 'peer-list',
          payload: { peers: allPeers },
        })
      }
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
            projectId: meta.projectId ?? null,
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
      } else if (data.type === 'call-ended') {
        const targetId = data?.payload?.to
        const myId = getPeerId()
        if (targetId && myId && targetId !== myId) return
        if (from === activeCallPeerIdRef.current || activeCallRef.current) {
          teardownCall({ stopLocal: true, notifyPeer: false })
        }
      } else if (data.type === 'peer-introduce') {
        const newPeerId = data.payload?.peerId
        if (newPeerId && newPeerId !== getPeerId()) {
          // eslint-disable-next-line no-console
          console.log('[ChatShell] auto-connecting to introduced peer:', newPeerId)
          void connectToPeer(newPeerId).then(() => {
            setConnectedPeers(getConnectedPeers())
          })
        }
      } else if (data.type === 'peer-list') {
        const peers = data.payload?.peers ?? []
        for (const remoteId of peers) {
          if (remoteId && remoteId !== getPeerId()) {
            void connectToPeer(remoteId).then(() => setConnectedPeers(getConnectedPeers()))
          }
        }
      }
    })
    const offIncomingCall = onP2PEvent(P2P_EVENTS.INCOMING_CALL, (mediaCall) => {
      setIncomingMediaCall(mediaCall)
      setIncomingCallFrom(mediaCall?.peer ?? '')
    })

    return () => {
      cancelled = true
      offConnected()
      offDisconnected()
      offMessage()
      offIncomingCall()
      teardownCall({ stopLocal: true, notifyPeer: false })
    }
  }, [])

  useEffect(() => {
    const stopOnUnload = () => {
      teardownCall({ stopLocal: true, notifyPeer: false })
    }
    window.addEventListener('beforeunload', stopOnUnload)
    return () => {
      window.removeEventListener('beforeunload', stopOnUnload)
      stopOnUnload()
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
        void loadActiveChannelId().then(setActiveId)
        void loadSettings().then((s) => {
          const p = s?.profile
          setMyAvatarColor(p?.avatarColor || null)
        })
      }
    }
    window.addEventListener('zerocollab:idb', onDbChange)
    return () => window.removeEventListener('zerocollab:idb', onDbChange)
  }, [])

  useEffect(() => {
    const ids = new Set(allConversations.map((c) => c.id))
    if (ids.size > 0 && !ids.has(activeId)) {
      setActiveId('general')
    }
  }, [allConversations, activeId])

  useEffect(() => {
    console.log('[Hub] useEffect triggered, activeProject:', activeProject?.id, 'user:', user?.id)
    if (!activeProject || !user) {
      console.log('[Hub] skipping - no project or user')
      return
    }

    joinProjectHub(activeProject.id, user.id, user.email).then(() => {
      setOnlineMembers(getOnlineMembers())
      setHubConnected(true)
    })

    const handleHubMessage = (e) => {
      const msg = e.detail
      setMessages((prev) => {
        if (prev.find((m) => m.id === msg.id)) return prev
        return [...prev, msg]
      })
    }

    const handleCallInvite = (e) => {
      const { callerEmail, callerPeerId, projectId } = e.detail ?? {}
      if (!callerPeerId || callerPeerId === getPeerId()) return
      if (projectId && activeProject?.id && projectId !== activeProject.id) return
      setIncomingGroupCall({ callerEmail, callerPeerId })
    }

    const handleCallResponse = (e) => {
      const { accepted, responderPeerId, callerPeerId } = e.detail ?? {}
      if (!accepted || !responderPeerId || !callerPeerId) return
      if (getPeerId() !== callerPeerId) return
      if (responderPeerId === getPeerId()) return
      const stream = localStreamRef.current
      if (!stream) return
      setGroupCallParticipants((prev) =>
        prev.includes(responderPeerId) ? prev : [...prev, responderPeerId],
      )
      void placeCall(responderPeerId, stream).then((mediaCall) => {
        if (mediaCall) bindMediaCallRef.current(mediaCall)
      })
    }

    window.addEventListener('hub:message', handleHubMessage)
    window.addEventListener('hub:call-invite', handleCallInvite)
    window.addEventListener('hub:call-response', handleCallResponse)

    return () => {
      leaveProjectHub()
      setHubConnected(false)
      setIncomingGroupCall(null)
      setGroupCallParticipants([])
      window.removeEventListener('hub:message', handleHubMessage)
      window.removeEventListener('hub:call-invite', handleCallInvite)
      window.removeEventListener('hub:call-response', handleCallResponse)
    }
  }, [activeProject, user])

  const activeMessages = useMemo(
    () =>
      messages.filter(
        (m) =>
          m.channelId === activeId &&
          (m.projectId === activeProject?.id ||
            (!m.projectId && !activeProject)),
      ),
    [messages, activeId, activeProject],
  )

  const sendMessage = (text) => {
    // eslint-disable-next-line no-console
    console.log('[ChatShell] sendMessage', { text, activeId, me })
    const now = Date.now()
    const next = {
      id: createId(),
      channelId: activeId,
      projectId: activeProject?.id || null,
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
    void broadcastMessage(next).catch((err) =>
      console.error('[ChatShell] hub broadcast failed:', err),
    )
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
    const projectId = activeProject?.id || null
    const sender = me
    const maxSize = 50 * 1024 * 1024
    if (file.size > maxSize) {
      // eslint-disable-next-line no-alert
      alert(t('composer_file_too_large'))
      return
    }

    const CHUNK_SIZE = 64 * 1024
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE)

    const message = {
      id,
      channelId,
      projectId,
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
        projectId,
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

  const handleCallClick = async () => {
    try {
      await startLocalStream()
      setIsCallOpen(true)
      void broadcastCallInvite(activeProject?.id, me, getPeerId())
      // eslint-disable-next-line no-console
      console.log('[Call] sent group call invite to all members')
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Call] failed to start:', err)
    }
  }

  const handleAcceptIncomingCall = async () => {
    if (!incomingMediaCall) return
    const stream = await startLocalStream()
    incomingMediaCall.answer(stream)
    bindMediaCall(incomingMediaCall)
    setIncomingMediaCall(null)
    setIncomingCallFrom('')
  }

  const handleDeclineIncomingCall = () => {
    incomingMediaCall?.close?.()
    setIncomingMediaCall(null)
    setIncomingCallFrom('')
  }

  const handleToggleMute = () => {
    if (!localStream) return
    const nextMuted = !isMuted
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted
    })
    setIsMuted(nextMuted)
  }

  const handleToggleCamera = () => {
    if (!localStream) return
    const nextCameraOff = !isCameraOff
    localStream.getVideoTracks().forEach((track) => {
      track.enabled = !nextCameraOff
    })
    setIsCameraOff(nextCameraOff)
  }

  const handleToggleScreenShare = async () => {
    if (!localStream) return
    if (!isSharingScreen) {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
      const screenTrack = screenStream.getVideoTracks()[0]
      if (!screenTrack) return
      screenTrackRef.current = screenTrack
      replaceOutgoingVideoTrack(screenTrack)
      const mixed = new MediaStream([...localStream.getAudioTracks(), screenTrack])
      setLocalStream(mixed)
      setIsSharingScreen(true)
      screenTrack.onended = () => {
        if (!screenTrackRef.current) return
        const cameraTrack = cameraTrackRef.current
        if (cameraTrack) {
          replaceOutgoingVideoTrack(cameraTrack)
          const restored = new MediaStream([...localStream.getAudioTracks(), cameraTrack])
          setLocalStream(restored)
        }
        screenTrackRef.current = null
        setIsSharingScreen(false)
      }
      return
    }
    const cameraTrack = cameraTrackRef.current
    if (cameraTrack) {
      replaceOutgoingVideoTrack(cameraTrack)
      const restored = new MediaStream([...localStream.getAudioTracks(), cameraTrack])
      setLocalStream(restored)
    }
    screenTrackRef.current?.stop?.()
    screenTrackRef.current = null
    setIsSharingScreen(false)
  }

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="lg:sticky lg:top-6 lg:h-[calc(100vh-11rem)]">
        <ConversationList
          conversations={allConversations}
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
              {t('chat_messages_p2p')}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.6)] px-2 py-0.5 text-[rgb(var(--zc-muted2))]">
                {t('chat_peer_id')}:{' '}
                <span className="font-mono text-[rgb(var(--zc-text))]">
                  {peerId || t('chat_peer_initializing')}
                </span>
              </span>
              <span
                className={[
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
                  hubConnected
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                    : 'border-amber-500/50 bg-amber-500/10 text-amber-300',
                ].join(' ')}
              >
                <span
                  className={[
                    'h-2 w-2 rounded-full',
                    hubConnected ? 'bg-emerald-400' : 'bg-amber-400',
                  ].join(' ')}
                />
                <span>{hubConnected ? 'Connected' : 'Connecting...'}</span>
              </span>
              {onlineMembers.length > 0 && (
                <span className="text-xs text-[rgb(var(--zc-muted2))]">
                  {onlineMembers.length} online
                </span>
              )}
              {connectedPeers.length > 0 && (
                <span className="text-[rgb(var(--zc-muted2))]">
                  {t('chat_peers_label')}:{' '}
                  <span className="font-mono">
                    {connectedPeers.join(', ')}
                  </span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:shrink-0">
            <CallButton onClick={handleCallClick} />
          </div>
        </header>

        {isLoadingChat ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="rounded-lg border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-4 text-sm text-[rgb(var(--zc-muted2))]">
              {t('chat_loading')}
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
          placeholder={`${t('chat_message_placeholder')} ${activeId.startsWith('dm:') ? channelLabel(activeId) : '# ' + channelLabel(activeId)}`}
        />
      </section>
      {incomingGroupCall && (
        <div className="fixed bottom-4 right-4 z-50 rounded-xl border border-indigo-500/40 bg-[rgb(var(--zc-panel))] p-4 shadow-xl">
          <p className="text-sm font-semibold text-[rgb(var(--zc-text))]">
            📞 {incomingGroupCall.callerEmail} is calling...
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  const stream = await startLocalStream()
                  setIsCallOpen(true)
                  await broadcastCallResponse(
                    true,
                    getPeerId(),
                    incomingGroupCall.callerPeerId,
                  )
                  const mediaCall = await placeCall(
                    incomingGroupCall.callerPeerId,
                    stream,
                  )
                  if (mediaCall) bindMediaCall(mediaCall)
                  setIncomingGroupCall(null)
                } catch (err) {
                  // eslint-disable-next-line no-console
                  console.error('[Call] accept failed:', err)
                }
              }}
              className="flex-1 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-400"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={async () => {
                await broadcastCallResponse(
                  false,
                  getPeerId(),
                  incomingGroupCall.callerPeerId,
                )
                setIncomingGroupCall(null)
              }}
              className="flex-1 rounded-lg bg-rose-500 px-3 py-2 text-sm font-medium text-white hover:bg-rose-400"
            >
              Decline
            </button>
          </div>
        </div>
      )}
      <VideoCall
        isOpen={isCallOpen}
        localStream={localStream}
        remoteStream={remoteStream}
        remotePeerId={activeCallPeerId}
        isMuted={isMuted}
        isCameraOff={isCameraOff}
        isSharingScreen={isSharingScreen}
        onToggleMute={handleToggleMute}
        onToggleCamera={handleToggleCamera}
        onToggleScreenShare={handleToggleScreenShare}
        onEndCall={() => teardownCall({ stopLocal: true, notifyPeer: true })}
        incomingCallFrom={incomingCallFrom}
        onAcceptIncoming={handleAcceptIncomingCall}
        onDeclineIncoming={handleDeclineIncomingCall}
      />
    </div>
  )
}

