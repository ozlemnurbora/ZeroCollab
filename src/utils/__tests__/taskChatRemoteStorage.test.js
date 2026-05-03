import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mergeTaskChatMessages } from '../taskChatUtils.js'

const upsertMock = vi.fn()
const orderMock = vi.fn()
const eqMock = vi.fn()

vi.mock('../supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      upsert: upsertMock,
      select: vi.fn(() => ({
        eq: eqMock,
      })),
    })),
  },
}))

import { supabase } from '../supabase.js'
import {
  fetchTaskChatMessagesForTask,
  mapRemoteTaskChatMessage,
  normalizeTaskChatMessageForRemote,
  upsertTaskChatMessage,
} from '../taskChatRemoteStorage.js'

describe('normalizeTaskChatMessageForRemote', () => {
  it('maps projectId and taskId to snake_case row fields', () => {
    const row = normalizeTaskChatMessageForRemote({
      id: 'msg-1',
      kind: 'task-chat',
      taskId: 'task-a',
      projectId: 'proj-x',
      sender: 'Alex',
      senderUserId: 'user-99',
      text: 'hello',
      createdAt: 1700000000000,
      channelId: 'task:task-a',
    })
    expect(row).not.toBeNull()
    expect(row.project_id).toBe('proj-x')
    expect(row.task_id).toBe('task-a')
    expect(row.id).toBe('msg-1')
    expect(row.text).toBe('hello')
    expect(row.sender_user_id).toBe('user-99')
    expect(row.sender_name).toBe('Alex')
    expect(row.payload.kind).toBe('task-chat')
    expect(row.payload.channelId).toBe('task:task-a')
  })

  it('accepts task_id and project_id aliases', () => {
    const row = normalizeTaskChatMessageForRemote({
      id: 'm2',
      kind: 'task-chat',
      task_id: 't9',
      project_id: 'p9',
      sender: 'Bo',
      senderUserId: 'u1',
      text: 'yo',
      createdAt: 100,
    })
    expect(row.task_id).toBe('t9')
    expect(row.project_id).toBe('p9')
  })
})

describe('mapRemoteTaskChatMessage', () => {
  it('reconstructs a task-chat client message with numeric createdAt', () => {
    const m = mapRemoteTaskChatMessage({
      id: 'r1',
      project_id: 'p1',
      task_id: 't1',
      sender_user_id: 'peer-1',
      sender_name: 'Sam',
      text: 'backfilled',
      created_at: '2024-01-02T03:04:05.000Z',
      payload: { kind: 'task-chat', channelId: 'task:t1' },
    })
    expect(m.kind).toBe('task-chat')
    expect(m.taskId).toBe('t1')
    expect(m.projectId).toBe('p1')
    expect(m.text).toBe('backfilled')
    expect(m.senderUserId).toBe('peer-1')
    expect(m.sender).toBe('Sam')
    expect(m.createdAt).toBe(Date.parse('2024-01-02T03:04:05.000Z'))
    expect(m.ownerUserId).toBeUndefined()
  })
})

describe('fetchTaskChatMessagesForTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eqMock.mockReset()
    orderMock.mockReset()
    eqMock.mockReturnValue({ eq: eqMock, order: orderMock })
    orderMock.mockResolvedValue({ data: [], error: null })
  })

  it('scopes query by project_id and task_id', async () => {
    await fetchTaskChatMessagesForTask('proj-1', 'task-1')
    expect(supabase.from).toHaveBeenCalledWith('task_chat_messages')
    expect(eqMock).toHaveBeenCalledWith('project_id', 'proj-1')
    expect(eqMock).toHaveBeenCalledWith('task_id', 'task-1')
    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: true })
  })

  it('returns mapped task-scoped messages only', async () => {
    orderMock.mockResolvedValue({
      data: [
        {
          id: 'a',
          project_id: 'p1',
          task_id: 't1',
          sender_user_id: 'u1',
          sender_name: 'One',
          text: 'x',
          created_at: '2024-01-01T00:00:00.000Z',
          payload: {},
        },
      ],
      error: null,
    })
    const list = await fetchTaskChatMessagesForTask('p1', 't1')
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('a')
    expect(list[0].kind).toBe('task-chat')
    expect(list[0].taskId).toBe('t1')
    expect(list[0].projectId).toBe('p1')
  })
})

describe('merge local and remote task chat', () => {
  it('merges without duplicate ids', () => {
    const local = [
      {
        id: '1',
        kind: 'task-chat',
        taskId: 't',
        projectId: 'p',
        text: 'a',
        createdAt: 1,
      },
    ]
    const remote = [
      {
        id: '1',
        kind: 'task-chat',
        taskId: 't',
        projectId: 'p',
        text: 'a',
        createdAt: 1,
      },
      {
        id: '2',
        kind: 'task-chat',
        taskId: 't',
        projectId: 'p',
        text: 'b',
        createdAt: 2,
      },
    ]
    const merged = mergeTaskChatMessages(local, remote)
    expect(merged).toHaveLength(2)
    expect(merged.map((m) => m.id).sort()).toEqual(['1', '2'])
  })
})

describe('visibility vs ownerUserId', () => {
  it('mapped remote messages do not use ownerUserId for visibility fields', () => {
    const m = mapRemoteTaskChatMessage({
      id: 'x',
      project_id: 'p',
      task_id: 't',
      sender_user_id: 'other-user',
      sender_name: 'Other',
      text: 'hi',
      created_at: '2024-06-01T12:00:00.000Z',
      payload: {},
    })
    expect(m.ownerUserId).toBeUndefined()
    expect(m.senderUserId).toBe('other-user')
  })
})

describe('upsertTaskChatMessage', () => {
  beforeEach(() => {
    upsertMock.mockResolvedValue({ error: null })
  })

  it('calls supabase upsert with normalized row', async () => {
    const msg = {
      id: 'u1',
      kind: 'task-chat',
      taskId: 't1',
      projectId: 'p1',
      sender: 'Me',
      senderUserId: 'self',
      text: 'out',
      createdAt: 5000,
      channelId: 'task:t1',
    }
    await upsertTaskChatMessage(msg)
    expect(upsertMock).toHaveBeenCalledTimes(1)
    const [row, opts] = upsertMock.mock.calls[0]
    expect(row.project_id).toBe('p1')
    expect(row.task_id).toBe('t1')
    expect(opts).toEqual({ onConflict: 'id' })
  })
})
