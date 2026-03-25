const { WebSocketServer } = require('ws')

const PORT = process.env.PORT || 3001
const wss = new WebSocketServer({ port: PORT })

// rooms: Map<roomCode, Map<peerId, ws>>
const rooms = new Map()

function broadcastRoomPeers(roomCode) {
  const room = rooms.get(roomCode)
  if (!room) return
  const peerIds = Array.from(room.keys())
  for (const [, ws] of room.entries()) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'room-peers', peers: peerIds }))
    }
  }
}

wss.on('connection', (ws) => {
  let currentRoom = null
  let currentPeerId = null

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw)

      if (msg.type === 'join-room') {
        const { roomCode, peerId } = msg
        if (!roomCode || !peerId) return

        currentRoom = roomCode
        currentPeerId = peerId

        if (!rooms.has(roomCode)) rooms.set(roomCode, new Map())
        rooms.get(roomCode).set(peerId, ws)

        console.log(`[signal] ${peerId} joined room ${roomCode} (${rooms.get(roomCode).size} peers)`)
        broadcastRoomPeers(roomCode)
      }
    } catch (err) {
      console.error('[signal] parse error', err)
    }
  })

  ws.on('close', () => {
    if (currentRoom && currentPeerId) {
      const room = rooms.get(currentRoom)
      if (room) {
        room.delete(currentPeerId)
        console.log(`[signal] ${currentPeerId} left room ${currentRoom}`)
        if (room.size === 0) {
          rooms.delete(currentRoom)
        } else {
          broadcastRoomPeers(currentRoom)
        }
      }
    }
  })
})

console.log(`[signal] WebSocket signaling server running on port ${PORT}`)
