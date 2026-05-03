import { describe, expect, it } from 'vitest'
import {
  isTaskChatMessage,
  isTaskChatMessageForTask,
  mergeTaskChatMessages,
  shouldAcceptIncomingTaskChatMessage,
} from '../taskChatUtils.js'

const validTaskChat = {
  id: 'm1',
  kind: 'task-chat',
  taskId: 't1',
  projectId: 'p1',
  text: 'hi',
  createdAt: 100,
  ownerUserId: 'user-a',
  senderUserId: 'user-a',
}

describe('isTaskChatMessage', () => {
  it('recognizes valid task-chat message', () => {
    expect(isTaskChatMessage(validTaskChat)).toBe(true)
  })

  it('rejects non task-chat messages', () => {
    expect(isTaskChatMessage({ ...validTaskChat, kind: 'note' })).toBe(false)
    expect(isTaskChatMessage(null)).toBe(false)
    expect(isTaskChatMessage({ kind: 'task-chat', taskId: 't1' })).toBe(false)
    expect(isTaskChatMessage({ kind: 'task-chat', projectId: 'p1' })).toBe(false)
  })
})

describe('isTaskChatMessageForTask', () => {
  it('matches by taskId and projectId', () => {
    expect(isTaskChatMessageForTask(validTaskChat, 't1', 'p1')).toBe(true)
  })

  it('does not match same taskId in different projectId', () => {
    expect(isTaskChatMessageForTask(validTaskChat, 't1', 'p2')).toBe(false)
  })

  it('accepts task_id / project_id aliases', () => {
    const m = { ...validTaskChat, task_id: 't9', project_id: 'p9' }
    delete m.taskId
    delete m.projectId
    expect(isTaskChatMessageForTask(m, 't9', 'p9')).toBe(true)
  })
})

describe('shouldAcceptIncomingTaskChatMessage', () => {
  const members = ['p1', 'p2']

  it('accepts when projectId is in memberProjectIds', () => {
    expect(shouldAcceptIncomingTaskChatMessage(validTaskChat, members)).toBe(true)
  })

  it('rejects when projectId is not in memberProjectIds', () => {
    expect(
      shouldAcceptIncomingTaskChatMessage(
        { ...validTaskChat, projectId: 'p99' },
        members,
      ),
    ).toBe(false)
  })

  it('accepts when projectId matches activeProjectId fallback', () => {
    expect(shouldAcceptIncomingTaskChatMessage(validTaskChat, [], 'p1')).toBe(true)
  })

  it('does not require ownerUserId to match a particular viewer', () => {
    const fromPeer = {
      ...validTaskChat,
      id: 'm2',
      ownerUserId: 'someone-else',
      senderUserId: 'someone-else',
    }
    expect(shouldAcceptIncomingTaskChatMessage(fromPeer, members)).toBe(true)
  })
})

describe('mergeTaskChatMessages', () => {
  it('avoids duplicate messages by id', () => {
    const a = [{ id: '1', createdAt: 1, text: 'a' }]
    const b = [{ id: '1', createdAt: 1, text: 'b' }]
    const out = mergeTaskChatMessages(a, b)
    expect(out).toHaveLength(1)
    expect(out[0].text).toBe('b')
  })

  it('sorts by createdAt ascending', () => {
    const out = mergeTaskChatMessages(
      [{ id: 'b', createdAt: 200 }],
      [{ id: 'a', createdAt: 50 }],
    )
    expect(out.map((m) => m.id)).toEqual(['a', 'b'])
  })
})
