import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../../utils/database.js', () => ({
  DATABASE_META: {
    settingsChatUserKey: (uid) => `chat-user-${uid}`,
    settingsChatChannelKey: (uid) => `chat-channel-${uid}`,
  },
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  getMessagesForOwner: vi.fn(),
  putMessage: vi.fn(),
  replaceMessagesForOwner: vi.fn(),
}))

import { getSetting, getMessagesForOwner, replaceMessagesForOwner } from '../../../utils/database.js'
import { loadChatUser, loadActiveChannelId, loadMessages, saveMessages } from '../chatStorage.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('loadChatUser', () => {
  it('returns null for falsy ownerUserId', async () => {
    expect(await loadChatUser(null)).toBeNull()
    expect(await loadChatUser('')).toBeNull()
  })
  it('returns stored chat user name', async () => {
    getSetting.mockResolvedValue('Alice')
    expect(await loadChatUser('u1')).toBe('Alice')
  })
  it('returns null when no stored value', async () => {
    getSetting.mockResolvedValue(null)
    expect(await loadChatUser('u1')).toBeNull()
  })
  it('returns null on error', async () => {
    getSetting.mockRejectedValue(new Error('DB error'))
    expect(await loadChatUser('u1')).toBeNull()
  })
})

describe('loadActiveChannelId', () => {
  it('returns "general" for falsy ownerUserId', async () => {
    expect(await loadActiveChannelId(null)).toBe('general')
  })
  it('returns stored channel id', async () => {
    getSetting.mockResolvedValue('announcements')
    expect(await loadActiveChannelId('u1')).toBe('announcements')
  })
  it('returns "general" when no stored value', async () => {
    getSetting.mockResolvedValue(null)
    expect(await loadActiveChannelId('u1')).toBe('general')
  })
  it('returns "general" on error', async () => {
    getSetting.mockRejectedValue(new Error('DB error'))
    expect(await loadActiveChannelId('u1')).toBe('general')
  })
})

describe('loadMessages', () => {
  it('returns empty array for falsy ownerUserId', async () => {
    expect(await loadMessages(null)).toEqual([])
  })
  it('returns messages from database', async () => {
    getMessagesForOwner.mockResolvedValue([{ id: 'm1', text: 'hello' }])
    const result = await loadMessages('u1')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('m1')
  })
  it('returns empty array when database returns null', async () => {
    getMessagesForOwner.mockResolvedValue(null)
    expect(await loadMessages('u1')).toEqual([])
  })
  it('returns empty array on error', async () => {
    getMessagesForOwner.mockRejectedValue(new Error('DB error'))
    expect(await loadMessages('u1')).toEqual([])
  })
})

describe('saveMessages', () => {
  it('does nothing for falsy ownerUserId', async () => {
    await saveMessages([{ id: 'm1' }], null)
    expect(replaceMessagesForOwner).not.toHaveBeenCalled()
  })
  it('calls replaceMessagesForOwner with correct args', async () => {
    replaceMessagesForOwner.mockResolvedValue()
    await saveMessages([{ id: 'm1' }], 'u1')
    expect(replaceMessagesForOwner).toHaveBeenCalledWith('u1', [{ id: 'm1' }])
  })
})
