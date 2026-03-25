const SIGNAL_URL =
  import.meta.env.VITE_SIGNAL_URL || 'wss://zerocollab-production.up.railway.app'

let ws = null
let currentRoom = null
let currentPeerId = null
let onPeersCallback = null
let reconnectTimer = null
let heartbeatInterval = null

function clearHeartbeat() {
  if (heartbeatInterval != null) {
    clearInterval(heartbeatInterval)
    heartbeatInterval = null
  }
}

function startHeartbeat() {
  clearHeartbeat()
  heartbeatInterval = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN && currentRoom && currentPeerId) {
      ws.send(
        JSON.stringify({
          type: 'join-room',
          roomCode: currentRoom,
          peerId: currentPeerId,
        }),
      )
    }
  }, 30000)
}

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return

  ws = new WebSocket(SIGNAL_URL)

  ws.onopen = () => {
    // eslint-disable-next-line no-console
    console.log('[signal] connected')
    if (currentRoom && currentPeerId) {
      joinRoom(currentRoom, currentPeerId)
    }
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      if (msg.type === 'room-peers') {
        // eslint-disable-next-line no-console
        console.log('[signal] room peers:', msg.peers)
        onPeersCallback?.(msg.peers)
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[signal] parse error', err)
    }
  }

  ws.onclose = () => {
    clearHeartbeat()
    // eslint-disable-next-line no-console
    console.log('[signal] disconnected, reconnecting in 3s...')
    clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(connect, 3000)
  }

  ws.onerror = (err) => {
    // eslint-disable-next-line no-console
    console.error('[signal] error', err)
  }
}

export function joinRoom(roomCode, peerId, onPeers) {
  currentRoom = roomCode
  currentPeerId = peerId
  if (onPeers) onPeersCallback = onPeers

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    connect()
    return
  }

  ws.send(JSON.stringify({ type: 'join-room', roomCode, peerId }))
  startHeartbeat()
}

export function initSignaling() {
  connect()
}
