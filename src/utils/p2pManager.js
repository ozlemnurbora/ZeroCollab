import { Peer } from 'peerjs'
import { getOrCreatePeerId } from '../components/settings/settingsStorage.js'

const STATUS = {
  OFFLINE: 'offline',
  CONNECTING: 'connecting',
  ONLINE: 'online',
}

const EVENTS = {
  STATUS_CHANGE: 'status-change',
  PEER_CONNECTED: 'peer-connected',
  PEER_DISCONNECTED: 'peer-disconnected',
  MESSAGE: 'message',
  INCOMING_CALL: 'incoming-call',
  ERROR: 'error',
}

let peer = null
let status = STATUS.OFFLINE
let basePeerId = null
let sessionPeerId = null
let isInitializing = false
let initPromise = null
let reconnectTimer = null
let reconnectAttempts = 0
let manuallyClosed = false

/** @type {Record<string, Set<Function>>} */
const listeners = {}

/** @type {Map<string, import('peerjs').DataConnection>} */
const connections = new Map()
/** @type {Map<string, Promise<import('peerjs').DataConnection|null>>} */
const pendingConnections = new Map()
const CONNECTION_BIND_MARK = '__zcBoundListeners'

function emit(event, payload) {
  // Temporary debug logging
   
  console.log('[p2pManager] emit', event, payload)
  const set = listeners[event]
  if (!set) return
  for (const cb of set) {
    try {
      cb(payload)
    } catch {
      // ignore listener errors
    }
  }
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function cleanupConnection(remoteId) {
  const existing = connections.get(remoteId)
  if (!existing) return
  connections.delete(remoteId)
  pendingConnections.delete(remoteId)
  try {
    existing.close()
  } catch {
    // ignore
  }
}

function scheduleReconnect() {
  if (!peer || peer.destroyed || manuallyClosed) return
  clearReconnectTimer()
  const delay = Math.min(10000, 750 * 2 ** reconnectAttempts)
  reconnectAttempts += 1
  reconnectTimer = setTimeout(() => {
    if (!peer || peer.destroyed || manuallyClosed) return
    try {
      peer.reconnect()
    } catch (err) {
      console.error('[p2pManager] reconnect failed', err)
      setStatus(STATUS.OFFLINE)
      scheduleReconnect()
    }
  }, delay)
}

function setStatus(next) {
  if (status === next) return
  status = next
  emit(EVENTS.STATUS_CHANGE, status)
}

function ensureBrowserEnv() {
  return typeof window !== 'undefined'
}

async function createPeerInstance() {
  if (!ensureBrowserEnv()) return null

  manuallyClosed = false
  clearReconnectTimer()
  reconnectAttempts = 0
  basePeerId = await getOrCreatePeerId()
  const sessionSuffix =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(16).slice(2, 10)
  sessionPeerId = `${basePeerId}-${sessionSuffix}`

  setStatus(STATUS.CONNECTING)

   
  console.log('[p2pManager] creating Peer with id', sessionPeerId)
  peer = new Peer(sessionPeerId, {
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        {
          urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turn:openrelay.metered.ca:443?transport=tcp',
          ],
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
      ],
      iceCandidatePoolSize: 10,
    },
  })

  peer.on('open', () => {
     
    console.log('[p2pManager] peer open', sessionPeerId)
    reconnectAttempts = 0
    clearReconnectTimer()
    setStatus(STATUS.ONLINE)
  })

  peer.on('connection', (conn) => {
     
    console.log('[p2pManager] incoming connection from', conn.peer)
    setupConnection(conn)
  })

  peer.on('call', (mediaCall) => {
     
    console.log('[p2pManager] incoming media call from', mediaCall.peer)
    emit(EVENTS.INCOMING_CALL, mediaCall)
  })

  peer.on('disconnected', () => {
     
    console.log('[p2pManager] peer disconnected, attempting reconnect...')
    setStatus(STATUS.CONNECTING)
    scheduleReconnect()
  })

  peer.on('error', (err) => {
     
    console.error('[p2pManager] peer error', err)
    emit(EVENTS.ERROR, err)
    setStatus(peer && !peer.destroyed ? STATUS.CONNECTING : STATUS.OFFLINE)
    if (peer && !peer.destroyed) {
      scheduleReconnect()
    }
  })

  peer.on('close', () => {
     
    console.log('[p2pManager] peer closed')
    clearReconnectTimer()
    setStatus(STATUS.OFFLINE)
    pendingConnections.clear()
    connections.clear()
  })

  return peer
}

function setupConnection(conn) {
  const { peer: remoteId } = conn
  if (!remoteId) return
  if (conn[CONNECTION_BIND_MARK]) {
    if (!connections.has(remoteId)) {
      connections.set(remoteId, conn)
    }
    return
  }
  conn[CONNECTION_BIND_MARK] = true

  const existing = connections.get(remoteId)
  if (existing && existing !== conn) {
    cleanupConnection(remoteId)
  }
   
  console.log('[p2pManager] setupConnection', remoteId, {
    open: conn.open,
  })
  connections.set(remoteId, conn)

  if (typeof sessionStorage !== 'undefined') {
    try {
      const raw = sessionStorage.getItem('zc-connected-peers')
      const saved = raw ? JSON.parse(raw) : []
      if (Array.isArray(saved) && !saved.includes(remoteId)) {
        saved.push(remoteId)
        sessionStorage.setItem('zc-connected-peers', JSON.stringify(saved))
      }
    } catch {
      // ignore corrupt storage
    }
  }

  const announceConnected = () => {
    emit(EVENTS.PEER_CONNECTED, { peerId: remoteId })
  }
  if (conn.open) {
    announceConnected()
  } else {
    conn.on('open', announceConnected)
  }

  conn.on('data', (data) => {
     
    console.log('[p2pManager] data from', remoteId, data)
    emit(EVENTS.MESSAGE, { from: remoteId, data })
  })

  conn.on('close', () => {
     
    console.log('[p2pManager] connection closed', remoteId)
    connections.delete(remoteId)
    pendingConnections.delete(remoteId)
    if (typeof sessionStorage !== 'undefined') {
      try {
        const raw = sessionStorage.getItem('zc-connected-peers')
        const saved = raw ? JSON.parse(raw) : []
        if (Array.isArray(saved)) {
          sessionStorage.setItem(
            'zc-connected-peers',
            JSON.stringify(saved.filter((id) => id !== remoteId)),
          )
        }
      } catch {
        // ignore corrupt storage
      }
    }
    emit(EVENTS.PEER_DISCONNECTED, { peerId: remoteId })
  })

  conn.on('error', (err) => {
     
    console.error('[p2pManager] connection error', remoteId, err)
    emit(EVENTS.ERROR, err)
  })
}

export async function initP2P() {
  if (!ensureBrowserEnv()) {
    return { peerId: null, status: STATUS.OFFLINE }
  }
  if (peer && !peer.destroyed) {
    return { peerId: sessionPeerId, status }
  }
  if (isInitializing && initPromise) {
    return initPromise
  }

  isInitializing = true
  initPromise = (async () => {
    await createPeerInstance()
    isInitializing = false
    return { peerId: sessionPeerId, status }
  })()

  return initPromise
}

export function getPeerId() {
  return sessionPeerId
}

export function getPeerInstance() {
  return peer
}

export function getStatus() {
  return status
}

export function getConnectedPeers() {
  return Array.from(connections.keys())
}

export async function connectToPeer(remotePeerId) {
  if (!remotePeerId || !ensureBrowserEnv()) return null

  await initP2P()

  if (!peer || peer.destroyed) return null

  const existing = connections.get(remotePeerId)
  if (existing?.open) {
     
    console.log('[p2pManager] reusing existing connection', remotePeerId, {
      open: existing.open,
    })
    return existing
  }
  if (pendingConnections.has(remotePeerId)) {
    return pendingConnections.get(remotePeerId)
  }

  if (existing && !existing.open) {
    cleanupConnection(remotePeerId)
  }

   
  console.log('[p2pManager] connecting to remote peer', remotePeerId)
  const conn = peer.connect(remotePeerId, { reliable: true })
  setupConnection(conn)

  // Wait for the data channel to open before returning.
  const openPromise = new Promise((resolve) => {
    let settled = false
    const done = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const timer = setTimeout(() => {
      done(null)
    }, 10000)
    const clear = () => clearTimeout(timer)

    if (conn.open) {
      clear()
      done(conn)
      return
    }
    conn.on('open', () => {
      clear()
      console.log('[p2pManager] connection open', remotePeerId)
      done(conn)
    })
    conn.on('error', () => {
      clear()
      done(null)
    })
    conn.on('close', () => {
      clear()
      done(null)
    })
  })
  pendingConnections.set(remotePeerId, openPromise)
  const openedConn = await openPromise
  pendingConnections.delete(remotePeerId)
  if (!openedConn) {
    cleanupConnection(remotePeerId)
    return null
  }

  return openedConn
}

export function sendToAllPeers(payload) {
  if (!payload) return
   
  console.log('[p2pManager] sendToAllPeers payload', payload, {
    peerCount: connections.size,
  })
  for (const [id, conn] of connections.entries()) {
    if (!conn || !conn.open) {
       
      console.log('[p2pManager] skip send, connection not open', id)
      if (conn?.destroyed || !conn) {
        connections.delete(id)
      }
      continue
    }
    try {
       
      console.log('[p2pManager] sending to', id)
      conn.send(payload)
    } catch (err) {
       
      console.error('[p2pManager] send error', id, err)
    }
  }
}

export function sendToPeer(remotePeerId, payload) {
  if (!remotePeerId || !payload) return false
  const conn = connections.get(remotePeerId)
  if (!conn || !conn.open) return false
  try {
    conn.send(payload)
    return true
  } catch (err) {
    console.error('[p2pManager] sendToPeer error', remotePeerId, err)
    return false
  }
}

export function disconnectPeer(remotePeerId) {
  if (!remotePeerId) return
  cleanupConnection(remotePeerId)
}

export async function placeCall(remotePeerId, stream) {
  if (!remotePeerId || !stream || !ensureBrowserEnv()) return null
  await initP2P()
  if (!peer || peer.destroyed) return null
  try {
    const mediaCall = peer.call(remotePeerId, stream)
    return mediaCall ?? null
  } catch (err) {
    emit(EVENTS.ERROR, err)
    return null
  }
}

export function on(event, callback) {
  // Allow subscribing by event string (e.g. 'status-change') or by constant
  // value (P2P_EVENTS.STATUS_CHANGE which is also a string).
  if (!event || typeof callback !== 'function') return () => {}
  if (!listeners[event]) listeners[event] = new Set()
  listeners[event].add(callback)
  return () => {
    listeners[event].delete(callback)
  }
}

export function destroyP2P() {
  manuallyClosed = true
  clearReconnectTimer()
  pendingConnections.clear()
  for (const [id] of connections.entries()) {
    cleanupConnection(id)
  }
  connections.clear()
  if (peer && !peer.destroyed) {
    try {
      peer.destroy()
    } catch {
      // ignore
    }
  }
  peer = null
  setStatus(STATUS.OFFLINE)
}

export const P2P_STATUS = STATUS
export const P2P_EVENTS = EVENTS

