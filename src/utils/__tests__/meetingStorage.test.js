import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../database.js', () => ({
  getMeetingsForOwner: vi.fn(),
  getMeetingsRaw: vi.fn(),
  replaceMeetingsStore: vi.fn(),
}))

import { getMeetingsForOwner, getMeetingsRaw, replaceMeetingsStore } from '../database.js'
import { deleteMeeting, loadMeetings, pruneMeetingsByProjectIds, saveMeeting } from '../meetingStorage.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('loadMeetings', () => {
  it('returns meetings for given owner', async () => {
    getMeetingsForOwner.mockResolvedValue([{ id: 'm1', title: 'Standup' }])
    const result = await loadMeetings('user1')
    expect(result).toEqual([{ id: 'm1', title: 'Standup' }])
    expect(getMeetingsForOwner).toHaveBeenCalledWith('user1')
  })

  it('returns empty array when ownerUserId is falsy', async () => {
    const result = await loadMeetings(null)
    expect(result).toEqual([])
    expect(getMeetingsForOwner).not.toHaveBeenCalled()
  })

  it('returns empty array when ownerUserId is empty string', async () => {
    const result = await loadMeetings('')
    expect(result).toEqual([])
  })

  it('returns empty array when database throws error', async () => {
    getMeetingsForOwner.mockRejectedValue(new Error('DB error'))
    const result = await loadMeetings('user1')
    expect(result).toEqual([])
  })

  it('returns empty array when database returns null', async () => {
    getMeetingsForOwner.mockResolvedValue(null)
    const result = await loadMeetings('user1')
    expect(result).toEqual([])
  })
})

describe('saveMeeting', () => {
  it('saves a new meeting with ownerUserId', async () => {
    getMeetingsRaw.mockResolvedValue([])
    replaceMeetingsStore.mockResolvedValue()
    await saveMeeting({ id: 'm1', title: 'Standup' }, 'user1')
    expect(replaceMeetingsStore).toHaveBeenCalledWith([{ id: 'm1', title: 'Standup', ownerUserId: 'user1' }])
  })

  it('updates existing meeting (replaces by id)', async () => {
    getMeetingsRaw.mockResolvedValue([{ id: 'm1', title: 'Old Title', ownerUserId: 'user1' }])
    replaceMeetingsStore.mockResolvedValue()
    await saveMeeting({ id: 'm1', title: 'New Title' }, 'user1')
    const savedData = replaceMeetingsStore.mock.calls[0][0]
    expect(savedData).toHaveLength(1)
    expect(savedData[0].title).toBe('New Title')
  })

  it('does nothing when meeting has no id', async () => {
    await saveMeeting({ title: 'No ID' }, 'user1')
    expect(getMeetingsRaw).not.toHaveBeenCalled()
  })

  it('does nothing when ownerUserId is falsy', async () => {
    await saveMeeting({ id: 'm1' }, null)
    expect(getMeetingsRaw).not.toHaveBeenCalled()
  })

  it("preserves other owners' meetings when saving", async () => {
    getMeetingsRaw.mockResolvedValue([
      { id: 'm1', title: 'Mine', ownerUserId: 'user1' },
      { id: 'm2', title: 'Theirs', ownerUserId: 'user2' },
    ])
    replaceMeetingsStore.mockResolvedValue()
    await saveMeeting({ id: 'm1', title: 'Updated' }, 'user1')
    const savedData = replaceMeetingsStore.mock.calls[0][0]
    expect(savedData).toHaveLength(2)
    expect(savedData.find((m) => m.id === 'm2').title).toBe('Theirs')
  })
})

describe('deleteMeeting', () => {
  it('deletes meeting by id for matching owner', async () => {
    getMeetingsRaw.mockResolvedValue([
      { id: 'm1', title: 'Standup', ownerUserId: 'user1' },
      { id: 'm2', title: 'Retro', ownerUserId: 'user1' },
    ])
    replaceMeetingsStore.mockResolvedValue()
    await deleteMeeting('m1', 'user1')
    const savedData = replaceMeetingsStore.mock.calls[0][0]
    expect(savedData).toHaveLength(1)
    expect(savedData[0].id).toBe('m2')
  })

  it('does NOT delete meeting owned by another user', async () => {
    getMeetingsRaw.mockResolvedValue([{ id: 'm1', title: 'Standup', ownerUserId: 'user2' }])
    await deleteMeeting('m1', 'user1')
    expect(replaceMeetingsStore).not.toHaveBeenCalled()
  })

  it('does nothing when ownerUserId is falsy', async () => {
    await deleteMeeting('m1', null)
    expect(getMeetingsRaw).not.toHaveBeenCalled()
  })

  it('does nothing when meeting id not found', async () => {
    getMeetingsRaw.mockResolvedValue([{ id: 'm1', ownerUserId: 'user1' }])
    await deleteMeeting('m999', 'user1')
    expect(replaceMeetingsStore).not.toHaveBeenCalled()
  })
})

describe('pruneMeetingsByProjectIds', () => {
  it('removes meetings belonging to specified project IDs for the owner', async () => {
    getMeetingsRaw.mockResolvedValue([
      { id: 'm1', projectId: 'p1', ownerUserId: 'user1' },
      { id: 'm2', projectId: 'p2', ownerUserId: 'user1' },
      { id: 'm3', projectId: 'p1', ownerUserId: 'user1' },
    ])
    replaceMeetingsStore.mockResolvedValue()
    await pruneMeetingsByProjectIds(['p1'], 'user1')
    const savedData = replaceMeetingsStore.mock.calls[0][0]
    expect(savedData).toHaveLength(1)
    expect(savedData[0].id).toBe('m2')
  })

  it('does NOT prune meetings owned by another user', async () => {
    getMeetingsRaw.mockResolvedValue([{ id: 'm1', projectId: 'p1', ownerUserId: 'user2' }])
    await pruneMeetingsByProjectIds(['p1'], 'user1')
    expect(replaceMeetingsStore).not.toHaveBeenCalled()
  })

  it('does nothing when ownerUserId is falsy', async () => {
    await pruneMeetingsByProjectIds(['p1'], null)
    expect(getMeetingsRaw).not.toHaveBeenCalled()
  })

  it('does nothing when projectIds is empty array', async () => {
    await pruneMeetingsByProjectIds([], 'user1')
    expect(getMeetingsRaw).not.toHaveBeenCalled()
  })

  it('keeps meetings without projectId', async () => {
    getMeetingsRaw.mockResolvedValue([
      { id: 'm1', projectId: 'p1', ownerUserId: 'user1' },
      { id: 'm2', ownerUserId: 'user1' },
    ])
    replaceMeetingsStore.mockResolvedValue()
    await pruneMeetingsByProjectIds(['p1'], 'user1')
    const savedData = replaceMeetingsStore.mock.calls[0][0]
    expect(savedData).toHaveLength(1)
    expect(savedData[0].id).toBe('m2')
  })
})
