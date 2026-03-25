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

/** @type {Record<string, Set<Function>>} */
const listeners = {}

/** @type {Map<string, import('peerjs').DataConnection>} */
const connections = new Map()

function emit(event, payload) {
  // Temporary debug logging
  // eslint-disable-next-line no-console
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

  basePeerId = await getOrCreatePeerId()
  // Make each tab/session unique while keeping a stable base id.
  const sessionSuffix =
    (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(16).slice(2, 10)
  sessionPeerId = `${basePeerId}-${sessionSuffix}`

  setStatus(STATUS.CONNECTING)

  // eslint-disable-next-line no-console
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
    // eslint-disable-next-line no-console
    console.log('[p2pManager] peer open', sessionPeerId)
    setStatus(STATUS.ONLINE)
  })

  peer.on('connection', (conn) => {
    // eslint-disable-next-line no-console
    console.log('[p2pManager] incoming connection from', conn.peer)
    setupConnection(conn)
  })

  peer.on('call', (mediaCall) => {
    // eslint-disable-next-line no-console
    console.log('[p2pManager] incoming media call from', mediaCall.peer)
    emit(EVENTS.INCOMING_CALL, mediaCall)
  })

  peer.on('disconnected', () => {
    // eslint-disable-next-line no-console
    console.log('[p2pManager] peer disconnected')
    setStatus(STATUS.OFFLINE)
  })

  peer.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[p2pManager] peer error', err)
    emit(EVENTS.ERROR, err)
    setStatus(STATUS.OFFLINE)
  })

  peer.on('close', () => {
    // eslint-disable-next-line no-console
    console.log('[p2pManager] peer closed')
    setStatus(STATUS.OFFLINE)
    connections.clear()
  })

  return peer
}

function setupConnection(conn) {
  const { peer: remoteId } = conn
  // eslint-disable-next-line no-console
  console.log('[p2pManager] setupConnection', remoteId, {
    open: conn.open,
  })
  connections.set(remoteId, conn)

  const announceConnected = () => {
    emit(EVENTS.PEER_CONNECTED, { peerId: remoteId })
  }
  if (conn.open) {
    announceConnected()
  } else {
    conn.on('open', announceConnected)
  }

  conn.on('data', (data) => {
    // eslint-disable-next-line no-console
    console.log('[p2pManager] data from', remoteId, data)
    emit(EVENTS.MESSAGE, { from: remoteId, data })
  })

  conn.on('close', () => {
    // eslint-disable-next-line no-console
    console.log('[p2pManager] connection closed', remoteId)
    connections.delete(remoteId)
    emit(EVENTS.PEER_DISCONNECTED, { peerId: remoteId })
  })

  conn.on('error', (err) => {
    // eslint-disable-next-line no-console
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
  if (existing) {
    // eslint-disable-next-line no-console
    console.log('[p2pManager] reusing existing connection', remotePeerId, {
      open: existing.open,
    })
    return existing
  }

  // eslint-disable-next-line no-console
  console.log('[p2pManager] connecting to remote peer', remotePeerId)
  const conn = peer.connect(remotePeerId)
  setupConnection(conn)

  // Wait for the data channel to open before returning.
  await new Promise((resolve) => {
    if (conn.open) {
      resolve()
      return
    }
    conn.on('open', () => {
      // eslint-disable-next-line no-console
      console.log('[p2pManager] connection open', remotePeerId)
      resolve()
    })
  })

  return conn
}

export function sendToAllPeers(payload) {
  if (!payload) return
  // eslint-disable-next-line no-console
  console.log('[p2pManager] sendToAllPeers payload', payload, {
    peerCount: connections.size,
  })
  for (const [id, conn] of connections.entries()) {
    if (!conn.open) {
      // eslint-disable-next-line no-console
      console.log('[p2pManager] skip send, connection not open', id)
      continue
    }
    try {
      // eslint-disable-next-line no-console
      console.log('[p2pManager] sending to', id)
      conn.send(payload)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[p2pManager] send error', id, err)
    }
  }
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

export const P2P_STATUS = STATUS
export const P2P_EVENTS = EVENTS

