import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'

// ---- Hoisted PeerJS fakes (no real WebRTC/network) ----
const h = vi.hoisted(() => {
  class FakeConn {
    constructor() {
      this.peer = null
      this.open = false
      this.destroyed = false
      this.reliable = true
      this.handlers = new Map()
      this.send = vi.fn()
      this.close = vi.fn(() => {
        this.destroyed = true
      })
    }
    on(event, cb) {
      if (!this.handlers.has(event)) this.handlers.set(event, [])
      this.handlers.get(event).push(cb)
    }
    trigger(event, payload) {
      for (const cb of [...(this.handlers.get(event) || [])]) cb(payload)
    }
    flipOpen() {
      this.open = true
      this.trigger('open')
    }
  }

  class FakePeer {
    constructor(id, opts) {
      this.id = id
      this.opts = opts
      this.destroyed = false
      this.handlers = new Map()
      this.lastConn = null
      this.connect = vi.fn((rid) => {
        const c = new FakeConn()
        c.peer = rid
        this.lastConn = c
        return c
      })
      this.call = vi.fn()
      this.reconnect = vi.fn()
      this.destroy = vi.fn(() => {
        this.destroyed = true
      })
    }
    on(event, cb) {
      if (!this.handlers.has(event)) this.handlers.set(event, [])
      this.handlers.get(event).push(cb)
    }
    trigger(event, payload) {
      for (const cb of [...(this.handlers.get(event) || [])]) cb(payload)
    }
  }

  return { FakeConn, FakePeer, state: { lastPeer: null } }
})

vi.mock('peerjs', () => ({
  Peer: vi.fn((id, opts) => {
    const p = new h.FakePeer(id, opts)
    h.state.lastPeer = p
    return p
  }),
}))

vi.mock('../../components/settings/settingsStorage.js', () => ({
  getOrCreatePeerId: vi.fn(async () => 'base-peer-id'),
}))

import { Peer } from 'peerjs'
import {
  P2P_EVENTS,
  P2P_STATUS,
  initP2P,
  getStatus,
  getConnectedPeers,
  connectToPeer,
  sendToPeer,
  sendToAllPeers,
  on,
  destroyP2P,
} from '../p2pManager.js'

const tick = () => new Promise((r) => setTimeout(r, 0))

/** Init the peer and fire its 'open' event so status becomes online. */
async function initAndOpen() {
  const res = initP2P()
  await tick()
  const fakePeer = h.state.lastPeer
  fakePeer.trigger('open')
  await res
  return fakePeer
}

/** Open a data connection to `remoteId` (resolves once the conn fires 'open'). */
async function openConnection(fakePeer, remoteId) {
  const p = connectToPeer(remoteId)
  await tick()
  const conn = fakePeer.lastConn
  conn.flipOpen()
  const result = await p
  return { conn, result }
}

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  destroyP2P()
  vi.clearAllMocks()
  h.state.lastPeer = null
})

describe('constants & initial state', () => {
  it('exports P2P_EVENTS with the expected keys', () => {
    expect(P2P_EVENTS).toMatchObject({
      STATUS_CHANGE: 'status-change',
      PEER_CONNECTED: 'peer-connected',
      PEER_DISCONNECTED: 'peer-disconnected',
      MESSAGE: 'message',
      INCOMING_CALL: 'incoming-call',
      ERROR: 'error',
    })
  })

  it('exports P2P_STATUS with offline/connecting/online', () => {
    expect(P2P_STATUS).toMatchObject({
      OFFLINE: 'offline',
      CONNECTING: 'connecting',
      ONLINE: 'online',
    })
  })

  it('is offline with no connections before init', () => {
    expect(getStatus()).toBe(P2P_STATUS.OFFLINE)
    expect(getConnectedPeers()).toEqual([])
  })
})

describe('initP2P', () => {
  it('constructs a Peer with an id starting with the base peer id', async () => {
    await initAndOpen()
    expect(Peer).toHaveBeenCalledTimes(1)
    const idArg = Peer.mock.calls[0][0]
    expect(typeof idArg).toBe('string')
    expect(idArg.startsWith('base-peer-id')).toBe(true)
  })

  it('becomes online after the peer fires open', async () => {
    await initAndOpen()
    expect(getStatus()).toBe(P2P_STATUS.ONLINE)
  })

  it('notifies STATUS_CHANGE subscribers with online, and stops after unsubscribe', async () => {
    const cb = vi.fn()
    const unsub = on(P2P_EVENTS.STATUS_CHANGE, cb)
    await initAndOpen()
    expect(cb).toHaveBeenCalledWith('online')

    cb.mockClear()
    unsub()
    destroyP2P() // would emit 'offline'
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('connectToPeer', () => {
  it('calls peer.connect with reliable:true and resolves once the connection opens', async () => {
    const fakePeer = await initAndOpen()
    const { conn, result } = await openConnection(fakePeer, 'remote-1')
    expect(fakePeer.connect).toHaveBeenCalledWith('remote-1', { reliable: true })
    expect(result).toBe(conn)
    expect(getConnectedPeers()).toContain('remote-1')
  })

  it('reuses an already-open connection without calling peer.connect again', async () => {
    const fakePeer = await initAndOpen()
    await openConnection(fakePeer, 'remote-1')
    expect(fakePeer.connect).toHaveBeenCalledTimes(1)

    const again = await connectToPeer('remote-1')
    expect(again).toBeTruthy()
    expect(fakePeer.connect).toHaveBeenCalledTimes(1)
  })
})

describe('sendToPeer / sendToAllPeers', () => {
  it('sendToPeer returns false when there is no open connection', async () => {
    await initAndOpen()
    expect(sendToPeer('nobody', { hello: 1 })).toBe(false)
  })

  it('sendToPeer returns true and sends over an open connection', async () => {
    const fakePeer = await initAndOpen()
    const { conn } = await openConnection(fakePeer, 'remote-1')
    const payload = { type: 'PING' }
    expect(sendToPeer('remote-1', payload)).toBe(true)
    expect(conn.send).toHaveBeenCalledWith(payload)
  })

  it('sendToAllPeers sends to open connections and skips closed ones', async () => {
    const fakePeer = await initAndOpen()
    const { conn: openConn } = await openConnection(fakePeer, 'remote-1')

    // Incoming, never-opened connection (open stays false).
    const closedConn = new h.FakeConn()
    closedConn.peer = 'remote-2'
    fakePeer.trigger('connection', closedConn)
    expect(getConnectedPeers()).toEqual(expect.arrayContaining(['remote-1', 'remote-2']))

    const payload = { type: 'BROADCAST' }
    sendToAllPeers(payload)
    expect(openConn.send).toHaveBeenCalledWith(payload)
    expect(closedConn.send).not.toHaveBeenCalled()
  })
})

describe('events from peer/connection', () => {
  it('emits INCOMING_CALL when the peer receives a media call', async () => {
    const cb = vi.fn()
    on(P2P_EVENTS.INCOMING_CALL, cb)
    const fakePeer = await initAndOpen()
    const fakeCall = { peer: 'remote-1' }
    fakePeer.trigger('call', fakeCall)
    expect(cb).toHaveBeenCalledWith(fakeCall)
  })

  it('emits MESSAGE with { from, data } when an open connection receives data', async () => {
    const cb = vi.fn()
    on(P2P_EVENTS.MESSAGE, cb)
    const fakePeer = await initAndOpen()
    const { conn } = await openConnection(fakePeer, 'remote-1')
    const data = { type: 'NOTE', text: 'hi' }
    conn.trigger('data', data)
    expect(cb).toHaveBeenCalledWith({ from: 'remote-1', data })
  })
})

describe('destroyP2P', () => {
  it('clears connections, goes offline, and destroys the peer', async () => {
    const fakePeer = await initAndOpen()
    await openConnection(fakePeer, 'remote-1')
    expect(getConnectedPeers()).toContain('remote-1')

    destroyP2P()
    expect(getConnectedPeers()).toEqual([])
    expect(getStatus()).toBe(P2P_STATUS.OFFLINE)
    expect(fakePeer.destroy).toHaveBeenCalled()
  })
})
