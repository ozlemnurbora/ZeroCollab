import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  getPeerInstance,
  initP2P,
  on as onP2PEvent,
  sendToAllPeers,
  sendToPeer,
} from '../../utils/p2pManager.js'
import { CallButton } from '../call/CallButton.jsx'
import { VideoCall } from '../call/VideoCall.jsx'
import { useLanguage } from '../../utils/LanguageContext.jsx'

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID)
    return crypto.randomUUID()
  return `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function createTransferId(fileId, senderPeerId) {
  return `${senderPeerId || 'unknown'}:${fileId}`
}

function dmIdFromEmail(email) {
  const local = String(email || '').split('@')[0].trim().toLowerCase()
  if (!local) return ''
  return `dm:${local.replace(/\s+/g, '_')}`
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function onlineUserKey(presence) {
  const userId = String(presence?.userId || '').trim()
  if (userId) return `uid:${userId}`
  const email = normalizeEmail(presence?.userEmail)
  if (email) return `email:${email}`
  const peerId = String(presence?.peerId || '').trim()
  return peerId ? `peer:${peerId}` : ''
}

const DIRECT_MEDIA_BOUND = '__zcDirectMediaBound'

export function ChatShell() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const { user } = useAuth()
  const ownerUserId = user?.id ?? null
  const ownerUserIdRef = useRef(ownerUserId)
  const { activeProject, teams } = useWorkspace()
  const [onlineMembers, setOnlineMembers] = useState([])

  const memberNameFromAny = (member) =>
    typeof member === 'string'
      ? member
      : member?.name || member?.email || 'Unknown'

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
    return Array.from(members).map((member) => {
      const memberName = memberNameFromAny(member)
      const safeSlug = String(memberName || '')
        .toLowerCase()
        .replace(/\s+/g, '_')
      return {
        id: `dm:${safeSlug}`,
      type: 'dm',
        name: memberName,
      }
    })
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
  const isDirectConversation = activeId.startsWith('dm:')
  useEffect(() => {
    ownerUserIdRef.current = ownerUserId
  }, [ownerUserId])

  const uniqueOnlineUsers = useMemo(() => {
    const byUser = new Map()
    for (const presence of onlineMembers) {
      const key = onlineUserKey(presence)
      if (!key || !presence?.peerId) continue
      const prev = byUser.get(key)
      const nextTs = Date.parse(presence.joinedAt || '') || 0
      const prevTs = Date.parse(prev?.joinedAt || '') || 0
      if (!prev || nextTs >= prevTs) {
        byUser.set(key, presence)
      }
    }
    return Array.from(byUser.values())
  }, [onlineMembers])
  const activeDmPresence = useMemo(() => {
    if (!isDirectConversation) return null
    return (
      uniqueOnlineUsers.find((presence) => {
        const presenceDmId = dmIdFromEmail(presence?.userEmail || '')
        return (
          presenceDmId === activeId &&
          presence.peerId &&
          presence.peerId !== getPeerId()
        )
      }) ?? null
    )
  }, [activeId, isDirectConversation, uniqueOnlineUsers])
  const directTargetPeerId = activeDmPresence?.peerId ?? ''
  const [messages, setMessages] = useState([])
  const [myAvatarColor, setMyAvatarColor] = useState(null)
  const [isLoadingChat, setIsLoadingChat] = useState(true)
  const [hasLoadedChat, setHasLoadedChat] = useState(false)
  const [pendingFile, setPendingFile] = useState(null)
  const [fileUrls, setFileUrls] = useState({})
  const [fileTransfers, setFileTransfers] = useState({})
  const [isCallOpen, setIsCallOpen] = useState(false)
  const [incomingGroupCall, setIncomingGroupCall] = useState(null)
  const [remoteStreams, setRemoteStreams] = useState(() => new Map())
  const [remoteStream, setRemoteStream] = useState(null)
  const [localStream, setLocalStream] = useState(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)
  const [isSharingScreen, setIsSharingScreen] = useState(false)
  const [callPhase, setCallPhase] = useState('idle')
  const incomingFileChunksRef = useRef(new Map())
  const transferMetaRef = useRef(new Map())
  const incomingTransfersRef = useRef(new Map())
  const outgoingTransfersRef = useRef(new Map())
  const activeMediaCallsRef = useRef(new Map())
  const callStreamsRef = useRef(new Map())
  const fileTransfersRef = useRef({})
  const objectUrlsRef = useRef(new Set())
  const localStreamRef = useRef(null)
  const mountedRef = useRef(false)
  const isInCallRef = useRef(false)
  const participantPeerIdsRef = useRef([])
  const wireMediaCallRef = useRef(() => {})
  const teardownCallRef = useRef(() => {})
  const cameraTrackRef = useRef(null)
  const screenTrackRef = useRef(null)
  const seenInviteRef = useRef(new Set())
  const outgoingCallRef = useRef({
    targetPeerId: '',
    inviteSentAt: 0,
    responded: false,
  })
  /** PeerJS MediaConnection waiting for local media / accept (DM only) */
  const pendingDirectMediaCallRef = useRef(null)
  const tryAnswerOrQueueDirectCallRef = useRef(() => {})

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const updateTransferState = (id, partial) => {
    if (!mountedRef.current) return
    setFileTransfers((prev) => {
      const current = prev[id] ?? {}
      const next = { ...current, ...partial }
      return { ...prev, [id]: next }
    })
  }

  const replaceOutgoingVideoTrack = (track) => {
    for (const mc of activeMediaCallsRef.current.values()) {
      const senders = mc?.peerConnection?.getSenders?.() ?? []
      const videoSender = senders.find((sender) => sender?.track?.kind === 'video')
      if (videoSender) {
        void videoSender.replaceTrack(track)
      }
    }
  }

  const stopStream = (stream) => {
    stream?.getTracks?.().forEach((track) => track.stop())
  }

  const cleanupTransferRuntime = () => {
    const urls = objectUrlsRef.current
    const outgoingTransfers = outgoingTransfersRef.current
    const incomingTransfers = incomingTransfersRef.current
    for (const url of urls) {
      URL.revokeObjectURL(url)
    }
    urls.clear()
    for (const [transferId, transfer] of outgoingTransfers.entries()) {
      transfer.cancelled = true
      sendToAllPeers({
        type: 'file-transfer-cancel',
        payload: {
          id: transferId.split(':').slice(1).join(':'),
          senderPeerId: transfer.senderPeerId,
          reason: 'sender-disconnected',
        },
      })
    }
    outgoingTransfers.clear()
    incomingTransfers.clear()
  }

  useEffect(() => {
    return cleanupTransferRuntime
  }, [])

  useEffect(() => {
    localStreamRef.current = localStream
  }, [localStream])

  useEffect(() => {
    fileTransfersRef.current = fileTransfers
  }, [fileTransfers])

  const cleanupRemotePeer = (remotePeerId) => {
    activeMediaCallsRef.current.delete(remotePeerId)
    callStreamsRef.current.delete(remotePeerId)
    setRemoteStreams((prev) => {
      const next = new Map(prev)
      next.delete(remotePeerId)
      const first = [...next.values()][0] ?? null
      setRemoteStream(first)
      return next
    })
  }

  /** @returns {() => void} flush — call after answer()/peer.call() to catch sync remoteStream */
  const wireMediaCall = (mediaCall, remotePeerId) => {
    const noop = () => {}
    if (!mediaCall || !remotePeerId) return noop
    if (mediaCall[DIRECT_MEDIA_BOUND]) return noop
    mediaCall[DIRECT_MEDIA_BOUND] = true

    const existing = activeMediaCallsRef.current.get(remotePeerId)
    if (existing && existing !== mediaCall) {
      try {
        existing.close()
      } catch {
        // ignore
      }
    }
    activeMediaCallsRef.current.set(remotePeerId, mediaCall)
    let streamDelivered = false
    const onStream = (rs) => {
      if (streamDelivered || !rs) return
      streamDelivered = true
      callStreamsRef.current.set(remotePeerId, rs)
      setRemoteStreams((prev) => new Map(prev).set(remotePeerId, rs))
      setRemoteStream(rs)
      setCallPhase('connected')
    }
    if (typeof mediaCall.once === 'function') {
      mediaCall.once('stream', onStream)
    } else {
      mediaCall.on('stream', onStream)
    }
    mediaCall.on('close', () => {
      cleanupRemotePeer(remotePeerId)
    })
    mediaCall.on('error', () => {
      cleanupRemotePeer(remotePeerId)
    })
    const flushRemoteIfNeeded = () => {
      const rs = mediaCall.remoteStream
      if (rs) onStream(rs)
    }
    return flushRemoteIfNeeded
  }

  const tryAnswerOrQueueDirectCall = (mediaCall) => {
    const remotePeerId = mediaCall?.peer
    if (!remotePeerId) {
      mediaCall?.close?.()
      return
    }
    if (mediaCall?.metadata?.callType && mediaCall.metadata.callType !== 'direct') {
      return
    }
    if (!isInCallRef.current || !localStreamRef.current) {
      if (pendingDirectMediaCallRef.current && pendingDirectMediaCallRef.current !== mediaCall) {
        try {
          pendingDirectMediaCallRef.current.close()
        } catch {
          // ignore
        }
      }
      pendingDirectMediaCallRef.current = mediaCall
      return
    }
    if (activeMediaCallsRef.current.has(remotePeerId)) {
      mediaCall?.close?.()
      return
    }
    const flush = wireMediaCallRef.current?.(mediaCall, remotePeerId) ?? (() => {})
    try {
      mediaCall.answer(localStreamRef.current)
    } catch (err) {
      console.error('[Call] answer failed:', err)
      mediaCall?.close?.()
      return
    }
    flush()
    queueMicrotask(flush)
  }

  const teardownCall = ({ broadcast = true } = {}) => {
    if (!isInCallRef.current && !isCallOpen) return
    if (broadcast) {
      sendToAllPeers({ type: 'call-ended', payload: {} })
    }
    for (const mc of [...activeMediaCallsRef.current.values()]) {
      try {
        mc?.close?.()
      } catch {
        // ignore
      }
    }
    activeMediaCallsRef.current.clear()
    callStreamsRef.current.clear()
    participantPeerIdsRef.current = []
    isInCallRef.current = false
    setIsCallOpen(false)
    setRemoteStreams(new Map())
    setRemoteStream(null)
    stopStream(localStreamRef.current)
    localStreamRef.current = null
    setLocalStream(null)
    cameraTrackRef.current = null
    screenTrackRef.current = null
    setIsMuted(false)
    setIsCameraOff(false)
    setIsSharingScreen(false)
    setCallPhase('idle')
    outgoingCallRef.current = {
      targetPeerId: '',
      inviteSentAt: 0,
      responded: false,
    }
    if (pendingDirectMediaCallRef.current) {
      try {
        pendingDirectMediaCallRef.current.close()
      } catch {
        // ignore
      }
      pendingDirectMediaCallRef.current = null
    }
  }

  const startLocalStream = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    })
    cameraTrackRef.current = stream.getVideoTracks()[0] ?? null
    // Keep ref in sync immediately — effects run too late for answer()/peer.call() in the same tick.
    localStreamRef.current = stream
    setLocalStream(stream)
    setIsMuted(false)
    setIsCameraOff(false)
    return stream
  }

  useEffect(() => {
    wireMediaCallRef.current = wireMediaCall
    teardownCallRef.current = teardownCall
    tryAnswerOrQueueDirectCallRef.current = tryAnswerOrQueueDirectCall
  })

  const handleCallClick = async () => {
    if (isInCallRef.current || incomingGroupCall || !isDirectConversation) return
    if (!directTargetPeerId) {
      alert(t('chat_peer_initializing'))
      return
    }
    try {
      await startLocalStream()
      if (!localStreamRef.current) {
        setCallPhase('idle')
        return
      }
      setCallPhase('outgoing_invite')
      await connectToPeer(directTargetPeerId)
      const myId = getPeerId()
      isInCallRef.current = true
      setIsCallOpen(true)
      participantPeerIdsRef.current = [myId, directTargetPeerId]
      outgoingCallRef.current = {
        targetPeerId: directTargetPeerId,
        inviteSentAt: Date.now(),
        responded: false,
      }
      await broadcastCallInvite(activeProject?.id, me, myId, [myId], {
        callType: 'direct',
        targetPeerId: directTargetPeerId,
      })
    } catch (err) {
      console.error('[Call] start failed:', err)
      isInCallRef.current = false
      setIsCallOpen(false)
      setCallPhase('failed')
      window.setTimeout(() => setCallPhase('idle'), 0)
    }
  }

  const handleAcceptCall = async () => {
    if (!incomingGroupCall || isInCallRef.current) return
    const invite = incomingGroupCall
    try {
      setIncomingGroupCall(null)
      setCallPhase('acquiring_local_media')
      const stream = await startLocalStream()
      if (!stream || !localStreamRef.current) {
        setCallPhase('failed')
        window.setTimeout(() => setCallPhase('idle'), 0)
        return
      }
      const myPeerId = getPeerId()
      isInCallRef.current = true
      setIsCallOpen(true)
      setCallPhase('connecting')
      participantPeerIdsRef.current = [myPeerId, invite.callerPeerId]

      await connectToPeer(invite.callerPeerId)

      await broadcastCallResponse(true, myPeerId, invite.callerPeerId, {
        callType: 'direct',
        targetPeerId: myPeerId,
      })

      const pending = pendingDirectMediaCallRef.current
      if (
        pending &&
        pending.peer === invite.callerPeerId
      ) {
        pendingDirectMediaCallRef.current = null
        tryAnswerOrQueueDirectCall(pending)
      }
    } catch (err) {
      console.error('[Call] accept failed:', err)
      teardownCallRef.current({ broadcast: false })
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      const outgoing = outgoingCallRef.current
      if (!isInCallRef.current || !outgoing.targetPeerId || outgoing.responded) return
      if (Date.now() - outgoing.inviteSentAt < 20000) return
      alert('Call timed out. Please try again.')
      setCallPhase('failed')
      teardownCallRef.current({ broadcast: true })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!isCallOpen || remoteStream || (callPhase !== 'connecting' && callPhase !== 'outgoing_invite'))
      return undefined
    const started = Date.now()
    const timer = window.setInterval(() => {
      if (!isInCallRef.current) {
        window.clearInterval(timer)
        return
      }
      if (Date.now() - started < 30000) return
      window.clearInterval(timer)
      alert('Could not receive remote video. The call will end.')
      setCallPhase('failed')
      teardownCallRef.current({ broadcast: true })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [isCallOpen, remoteStream, callPhase])

  useEffect(() => {
    if (!hasLoadedChat || !ownerUserId) return
    void saveActiveChannelId(activeId, ownerUserId)
  }, [activeId, hasLoadedChat, ownerUserId])

  useEffect(() => {
    if (!hasLoadedChat || !ownerUserId) return
    void saveMessages(messages, ownerUserId)
  }, [messages, hasLoadedChat, ownerUserId])

  useEffect(() => {
    if (!ownerUserId) {
      setMessages([])
      setHasLoadedChat(false)
      setIsLoadingChat(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setIsLoadingChat(true)
      const [ch, msgs, s] = await Promise.all([
        loadActiveChannelId(ownerUserId),
        loadMessages(ownerUserId),
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
  }, [ownerUserId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await initP2P()
      if (cancelled) return
    })()

    const offConnected = onP2PEvent(P2P_EVENTS.PEER_CONNECTED, (info) => {
      console.log('[ChatShell] P2P: connection established', info)
      const allPeers = getConnectedPeers()
      if (allPeers.length > 1) {
        sendToAllPeers({
          type: 'peer-list',
          payload: { peers: allPeers },
        })
      }
    })
    const offDisconnected = onP2PEvent(P2P_EVENTS.PEER_DISCONNECTED, (info) => {
      console.log('[ChatShell] P2P: connection closed', info)
    })
    const offMessage = onP2PEvent(P2P_EVENTS.MESSAGE, ({ from, data }) => {
      console.log('[ChatShell] P2P: received message...', { from, data })
      if (!data || !data.type) return
      if (data.type === 'chat-message') {
        const incoming = data.payload
        if (!incoming || !incoming.id) return
        const uid = ownerUserIdRef.current
        const stamped = uid ? { ...incoming, ownerUserId: uid } : incoming
        setMessages((prev) => {
          if (prev.some((m) => m.id === stamped.id)) return prev
          return [...prev, stamped]
        })
      } else if (data.type === 'file-meta') {
        const meta = data.payload
        if (!meta || !meta.id) return
        const senderPeerId = meta.senderPeerId || from
        const transferId = createTransferId(meta.id, senderPeerId)
        const totalChunks = Number.isFinite(meta.totalChunks) ? meta.totalChunks : 0
        const transferMeta = {
          ...meta,
          senderPeerId,
          transferId,
          totalChunks,
        }
        transferMetaRef.current.set(transferId, transferMeta)
        incomingFileChunksRef.current.set(transferId, new Array(totalChunks))
        incomingTransfersRef.current.set(transferId, {
          transferId,
          senderPeerId,
          totalChunks,
          receivedIndices: new Set(),
          lastChunkAt: performance.now(),
          retries: 0,
          completed: false,
          cancelled: false,
        })
        updateTransferState(transferId, {
          direction: 'download',
          totalBytes: meta.size,
          transferredBytes: 0,
          totalChunks,
          completedChunks: 0,
          percent: 0,
          speedLabel: '',
          startedAt: performance.now(),
          senderPeerId,
        })
      } else if (data.type === 'file-chunk') {
        const payload = data.payload
        if (!payload || !payload.id || !payload.chunk) return
        const senderPeerId = payload.senderPeerId || from
        const transferId = createTransferId(payload.id, senderPeerId)
        const meta = transferMetaRef.current.get(transferId)
        if (!meta) return
        const transferState = incomingTransfersRef.current.get(transferId)
        if (!transferState || transferState.completed || transferState.cancelled) return
        if (payload.index < 0 || payload.index >= meta.totalChunks) return
        const chunks = incomingFileChunksRef.current.get(transferId) ?? []
        chunks[payload.index] = payload.chunk
        incomingFileChunksRef.current.set(transferId, chunks)
        transferState.receivedIndices.add(payload.index)
        transferState.lastChunkAt = performance.now()

        const transferredBytes = chunks.reduce(
          (sum, c) => sum + (c ? c.length : 0),
          0,
        )
        const existingTransfer = fileTransfersRef.current[transferId]
        const startedAt = existingTransfer?.startedAt ?? performance.now()
        const elapsedMs = Math.max(1, performance.now() - startedAt)
        const bytesPerSecond = (transferredBytes / elapsedMs) * 1000
        const kbPerSecond = bytesPerSecond / 1024

        updateTransferState(transferId, {
          transferredBytes,
          completedChunks: transferState.receivedIndices.size,
          percent: Math.round((transferredBytes / meta.size) * 100),
          speedLabel: `${kbPerSecond.toFixed(1)} KB/s`,
          startedAt,
        })

        if (
          transferState.receivedIndices.size >= meta.totalChunks &&
          transferredBytes >= meta.size
        ) {
          transferState.completed = true
          const blob = new Blob(chunks, { type: meta.type || 'application/octet-stream' })
          const url = URL.createObjectURL(blob)
          objectUrlsRef.current.add(url)
          setFileUrls((prev) => ({ ...prev, [transferId]: url }))
          const uid = ownerUserIdRef.current
          const message = {
            id: transferId,
            originalTransferId: meta.id,
            channelId: meta.channelId,
            projectId: meta.projectId ?? null,
            sender: meta.sender ?? from,
            createdAt: meta.createdAt ?? Date.now(),
            kind: 'file',
            ...(uid ? { ownerUserId: uid } : {}),
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
          updateTransferState(transferId, {
            percent: 100,
          })
          transferMetaRef.current.delete(transferId)
          incomingFileChunksRef.current.delete(transferId)
          incomingTransfersRef.current.delete(transferId)
        }
      } else if (data.type === 'file-chunk-request') {
        const payload = data.payload
        if (!payload?.id || !Array.isArray(payload.indices)) return
        const requesterPeerId = payload.requesterPeerId || from
        if (!requesterPeerId) return
        const outgoing = outgoingTransfersRef.current.get(payload.id)
        if (!outgoing || outgoing.cancelled) return
        for (const index of payload.indices) {
          const chunk = outgoing.chunks[index]
          if (!chunk) continue
          sendToPeer(requesterPeerId, {
            type: 'file-chunk',
            payload: {
              id: payload.id,
              index,
              total: outgoing.totalChunks,
              chunk,
              senderPeerId: outgoing.senderPeerId,
            },
          })
        }
      } else if (data.type === 'file-transfer-cancel') {
        const payload = data.payload
        if (!payload?.id) return
        const senderPeerId = payload.senderPeerId || from
        const transferId = createTransferId(payload.id, senderPeerId)
        const transferState = incomingTransfersRef.current.get(transferId)
        if (!transferState) return
        transferState.cancelled = true
        incomingTransfersRef.current.delete(transferId)
        transferMetaRef.current.delete(transferId)
        incomingFileChunksRef.current.delete(transferId)
        updateTransferState(transferId, {
          status: 'cancelled',
          speedLabel: '',
        })
      } else if (data.type === 'call-ended') {
        if (!isInCallRef.current) return
        teardownCallRef.current({ broadcast: false })
      } else if (data.type === 'peer-introduce') {
        const newPeerId = data.payload?.peerId
        if (newPeerId && newPeerId !== getPeerId()) {
          console.log('[ChatShell] auto-connecting to introduced peer:', newPeerId)
          void connectToPeer(newPeerId)
        }
      } else if (data.type === 'peer-list') {
        const peers = data.payload?.peers ?? []
        for (const remoteId of peers) {
          if (remoteId && remoteId !== getPeerId()) {
            void connectToPeer(remoteId)
          }
        }
      }
    })
    const offIncomingCall = onP2PEvent(P2P_EVENTS.INCOMING_CALL, (mediaCall) => {
      if (mediaCall?.metadata?.callType && mediaCall.metadata.callType !== 'direct') {
        return
      }
      tryAnswerOrQueueDirectCallRef.current?.(mediaCall)
    })

    return () => {
      cancelled = true
      offConnected()
      offDisconnected()
      offMessage()
      offIncomingCall()
      teardownCallRef.current({ broadcast: false })
    }
  }, [])

  useEffect(() => {
    const stopOnUnload = () => {
      teardownCallRef.current({ broadcast: false })
    }
    window.addEventListener('beforeunload', stopOnUnload)
    return () => {
      window.removeEventListener('beforeunload', stopOnUnload)
      stopOnUnload()
    }
  }, [])

  useEffect(() => {
    const retryTimer = window.setInterval(() => {
      const myPeerId = getPeerId()
      for (const [transferId, transfer] of incomingTransfersRef.current.entries()) {
        if (transfer.completed || transfer.cancelled) continue
        if (!transfer.senderPeerId) continue
        const elapsed = performance.now() - transfer.lastChunkAt
        if (elapsed < 2500 || transfer.retries >= 3) continue
        const missing = []
        for (let idx = 0; idx < transfer.totalChunks; idx++) {
          if (!transfer.receivedIndices.has(idx)) {
            missing.push(idx)
            if (missing.length >= 32) break
          }
        }
        if (missing.length === 0) continue
        transfer.retries += 1
        transfer.lastChunkAt = performance.now()
        sendToPeer(transfer.senderPeerId, {
          type: 'file-chunk-request',
          payload: {
            id: transferId.split(':').slice(1).join(':'),
            requesterPeerId: myPeerId,
            indices: missing,
          },
        })
      }
    }, 1500)
    return () => window.clearInterval(retryTimer)
  }, [])

  useEffect(() => {
    const onDbChange = (e) => {
      const detail = e?.detail
      console.log('[ChatShell] zerocollab:idb event', detail)
      if (!detail?.store) return
      // For now, only react to settings changes so that local
      // message state is not overridden right after sending.
      if (detail.store === 'settings') {
        const uid = ownerUserIdRef.current
        if (uid) void loadActiveChannelId(uid).then(setActiveId)
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
      const resetTimer = window.setTimeout(() => {
        setActiveId('general')
      }, 0)
      return () => window.clearTimeout(resetTimer)
    }
    return undefined
  }, [allConversations, activeId])

  useEffect(() => {
    const handleHubMessage = (e) => {
      const msg = e.detail
      if (!msg || msg.action === 'task-sync' || msg.action === 'task-delete') return
      const uid = ownerUserIdRef.current
      const stamped = uid ? { ...msg, ownerUserId: uid } : msg
      setMessages((prev) => {
        if (prev.find((m) => m.id === stamped.id)) return prev
        return [...prev, stamped]
      })
    }

    const handleCallInvite = (e) => {
      if (isInCallRef.current) return
      const {
        callerEmail,
        callerPeerId,
        projectId,
        existingParticipants,
        callType,
        targetPeerId,
      } = e.detail ?? {}
      if (callType && callType !== 'direct') return
      const myPeer = getPeerId()
      if (!targetPeerId || targetPeerId !== myPeer) return
      if (!callerPeerId || callerPeerId === getPeerId()) return
      if (projectId && activeProject?.id && projectId !== activeProject.id) return
      const inviteKey = `${callerPeerId}:${e.detail?.timestamp ?? 'none'}`
      if (seenInviteRef.current.has(inviteKey)) return
      seenInviteRef.current.add(inviteKey)
      window.setTimeout(() => {
        seenInviteRef.current.delete(inviteKey)
      }, 10000)
      const existing =
        Array.isArray(existingParticipants) && existingParticipants.length > 0
          ? existingParticipants
          : [callerPeerId]
      setIncomingGroupCall({ callerEmail, callerPeerId, existingParticipants: existing })
      setCallPhase('incoming_invite')
    }

    window.addEventListener('hub:message', handleHubMessage)
    window.addEventListener('hub:call-invite', handleCallInvite)

    return () => {
      setIncomingGroupCall(null)
      window.removeEventListener('hub:message', handleHubMessage)
      window.removeEventListener('hub:call-invite', handleCallInvite)
    }
  }, [activeProject, ownerUserId])

  useEffect(() => {
    const updateOnlineMembers = () => {
      const raw = getOnlineMembers()
      const byUser = new Map()
      for (const presence of raw) {
        const key = onlineUserKey(presence)
        if (!key || !presence?.peerId) continue
        const prev = byUser.get(key)
        const nextTs = Date.parse(presence.joinedAt || '') || 0
        const prevTs = Date.parse(prev?.joinedAt || '') || 0
        if (!prev || nextTs >= prevTs) {
          byUser.set(key, presence)
        }
      }

      const allowedDmIds = new Set(dmList.map((dm) => dm.id))
      const selfDmId = dmIdFromEmail(user?.email || '')
      if (selfDmId) allowedDmIds.add(selfDmId)
      const filtered = Array.from(byUser.values()).filter((presence) => {
        if (!activeProject) return true
        const dmId = dmIdFromEmail(presence?.userEmail || '')
        return allowedDmIds.has(dmId)
      })
      setOnlineMembers(filtered)
    }
    updateOnlineMembers()
    window.addEventListener('hub:peer-joined', updateOnlineMembers)
    window.addEventListener('hub:peer-left', updateOnlineMembers)
    window.addEventListener('hub:presence-sync', updateOnlineMembers)
    return () => {
      window.removeEventListener('hub:peer-joined', updateOnlineMembers)
      window.removeEventListener('hub:peer-left', updateOnlineMembers)
      window.removeEventListener('hub:presence-sync', updateOnlineMembers)
    }
  }, [activeProject, dmList, user?.email])

  useEffect(() => {
    const handleHubCallResponse = async (e) => {
      const { accepted, responderPeerId, callerPeerId, callType, targetPeerId } = e.detail ?? {}
      if (callType && callType !== 'direct') return
      if (callerPeerId && callerPeerId !== getPeerId()) return
      if (!responderPeerId || responderPeerId === getPeerId()) return
      if (!isInCallRef.current) return
      if (targetPeerId && targetPeerId !== responderPeerId) return
      const expectedTarget = outgoingCallRef.current.targetPeerId
      if (expectedTarget && expectedTarget !== responderPeerId) return

      outgoingCallRef.current = {
        ...outgoingCallRef.current,
        responded: true,
      }
      if (!accepted) {
        alert('Call was declined.')
        teardownCallRef.current({ broadcast: false })
        return
      }
      const outboundStream = localStreamRef.current
      if (!outboundStream) return

      if (!participantPeerIdsRef.current.includes(responderPeerId)) {
        participantPeerIdsRef.current = [...participantPeerIdsRef.current, responderPeerId]
      }
      if (activeMediaCallsRef.current.has(responderPeerId)) return
      setCallPhase('connecting')

      console.log('[Call] new participant joined, calling them:', responderPeerId)
      const peerInstance = getPeerInstance()
      if (!peerInstance) return

      let mediaCall
      try {
        mediaCall = peerInstance.call(responderPeerId, outboundStream, {
          metadata: { callType: 'direct' },
        })
      } catch (err) {
        console.error('[Call] outbound to joiner failed:', responderPeerId, err)
        alert('Could not start the call. Check your connection and try again.')
        teardownCallRef.current({ broadcast: true })
        return
      }
      if (!mediaCall) return
      const flush = wireMediaCallRef.current(mediaCall, responderPeerId)
      flush?.()
      queueMicrotask(() => flush?.())
    }

    window.addEventListener('hub:call-response', handleHubCallResponse)

    return () => {
      window.removeEventListener('hub:call-response', handleHubCallResponse)
    }
  }, [])

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
    console.log('[ChatShell] sendMessage', { text, activeId, me })
    const now = Date.now()
    const next = {
      id: createId(),
      channelId: activeId,
      projectId: activeProject?.id || null,
      sender: me,
      text,
      createdAt: now,
      ...(ownerUserId ? { ownerUserId } : {}),
    }
    setMessages((prev) => {
      const updated = [...prev, next]
      console.log('[ChatShell] messages after local append', updated.length)
      return updated
    })
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

  const handleSendFile = async () => {
    if (!pendingFile) return
    const file = pendingFile.file
    const id = createId()
    const senderPeerId = getPeerId()
    const now = Date.now()
    const channelId = activeId
    const projectId = activeProject?.id || null
    const sender = me
    const maxSize = 50 * 1024 * 1024
    if (file.size > maxSize) {
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
      ...(ownerUserId ? { ownerUserId } : {}),
      file: {
        name: file.name,
        size: file.size,
        type: file.type,
      },
    }

    setMessages((prev) => [...prev, message])
    const localUrl = URL.createObjectURL(file)
    objectUrlsRef.current.add(localUrl)
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
      senderPeerId,
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
        senderPeerId,
      },
    })

    const buffer = await file.arrayBuffer()
    const view = new Uint8Array(buffer)
    const chunksForRetry = new Array(totalChunks)
    outgoingTransfersRef.current.set(id, {
      id,
      senderPeerId,
      totalChunks,
      chunks: chunksForRetry,
      cancelled: false,
    })

    for (let index = 0; index < totalChunks; index++) {
      const transfer = outgoingTransfersRef.current.get(id)
      if (!transfer || transfer.cancelled) break
      const start = index * CHUNK_SIZE
      const end = Math.min(start + CHUNK_SIZE, view.length)
      const chunk = view.slice(start, end)
      chunksForRetry[index] = chunk
      sendToAllPeers({
        type: 'file-chunk',
        payload: {
          id,
          index,
          total: totalChunks,
          chunk,
          senderPeerId,
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
    window.setTimeout(() => {
      outgoingTransfersRef.current.delete(id)
    }, 45000)
    handleCancelFile()
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
                {uniqueOnlineUsers.length} online
              </span>
              {isDirectConversation ? (
                <span className="text-[rgb(var(--zc-muted2))]">
                  Select a direct message to start a one-to-one call.
                </span>
              ) : (
                <span className="text-[rgb(var(--zc-muted2))]">
                  Direct calling is only available in private conversations. Use meetings for group calls.
                </span>
              )}
              {callPhase !== 'idle' ? (
                <span className="rounded border border-indigo-500/40 bg-indigo-500/10 px-2 py-0.5 text-[rgb(var(--zc-muted2))]">
                  Call status: {callPhase}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:shrink-0">
            {isDirectConversation ? (
              <CallButton onClick={handleCallClick} disabled={!directTargetPeerId} />
            ) : (
              <button
                type="button"
                onClick={() => navigate('/tasks')}
                className="h-9 rounded-md bg-indigo-500/90 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-indigo-400"
              >
                Create Meeting
              </button>
            )}
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
            📞 {incomingGroupCall.callerEmail || incomingGroupCall.callerPeerId} is calling...
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void handleAcceptCall()}
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
                  {
                    callType: 'direct',
                    targetPeerId: getPeerId(),
                  },
                )
                setIncomingGroupCall(null)
                setCallPhase('idle')
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
        remoteStream={
          remoteStreams.size > 0 ? [...remoteStreams.values()][0] : remoteStream
        }
        remotePeerId={
          remoteStreams.size > 0 ? [...remoteStreams.keys()][0] : ''
        }
        isMuted={isMuted}
        isCameraOff={isCameraOff}
        isSharingScreen={isSharingScreen}
        onToggleMute={handleToggleMute}
        onToggleCamera={handleToggleCamera}
        onToggleScreenShare={handleToggleScreenShare}
        onEndCall={() => teardownCall({ broadcast: true })}
        incomingCallFrom=""
        onAcceptIncoming={() => {}}
        onDeclineIncoming={() => {}}
      />
    </div>
  )
}

