import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the remote data + notification-store dependencies so tests are
// deterministic and never hit Supabase.
vi.mock('../logRemoteStorage.js', () => ({
  fetchUserMemberProjectIds: vi.fn(),
  fetchRemoteLogs: vi.fn(),
  fetchProjectNamesByIds: vi.fn(),
}))
vi.mock('../notificationService.js', () => ({
  addNotification: vi.fn(),
  getExistingSourceLogIds: vi.fn(),
}))

import { generateNotificationsForUser } from '../notificationGenerator.js'
import {
  fetchUserMemberProjectIds,
  fetchRemoteLogs,
  fetchProjectNamesByIds,
} from '../logRemoteStorage.js'
import {
  addNotification,
  getExistingSourceLogIds,
} from '../notificationService.js'

const USER = { id: 'u1', email: 'me@x.com' }

function createLocalStorageMock() {
  const store = new Map()

  return {
    getItem: vi.fn((key) => (store.has(key) ? store.get(key) : null)),
    setItem: vi.fn((key, value) => {
      store.set(key, String(value))
    }),
    removeItem: vi.fn((key) => {
      store.delete(key)
    }),
    clear: vi.fn(() => {
      store.clear()
    }),
  }
}

// Note: the generator reads `log.timestamp` (the local log shape) for the
// watermark comparison, so fixtures use `timestamp`.
const makeLog = (overrides = {}) => ({
  id: 'log1',
  userId: 'someone-else',
  userName: 'Alice',
  action: 'meeting.created',
  category: 'meeting',
  entityType: null,
  entityName: 'Standup',
  projectId: 'p1',
  metadata: null,
  timestamp: 1000,
  ...overrides,
})

/** Configure the per-test mock data. Watermark defaults to 0 so logs > 0 are candidates. */
function setup({
  projectIds = ['p1'],
  logsByPid = { p1: [] },
  names = { p1: 'Acme' },
  existingSourceIds = [],
  watermark = 0,
} = {}) {
  fetchUserMemberProjectIds.mockResolvedValue(projectIds)
  fetchProjectNamesByIds.mockResolvedValue(new Map(Object.entries(names)))
  fetchRemoteLogs.mockImplementation(async (pid) => logsByPid[pid] ?? [])
  getExistingSourceLogIds.mockResolvedValue(new Set(existingSourceIds))
  if (watermark !== null) {
    localStorage.setItem(`zc-notif-watermark-${USER.id}`, String(watermark))
  }
}

const firstMessage = () => addNotification.mock.calls[0]?.[0]?.message ?? ''

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
  vi.clearAllMocks()
  localStorage.clear()
  addNotification.mockResolvedValue(null)
})

describe('generateNotificationsForUser — identity / scoping', () => {
  it('produces NO notification for the user\'s own action', async () => {
    setup({ logsByPid: { p1: [makeLog({ userId: USER.id })] } })
    await generateNotificationsForUser(USER)
    expect(addNotification).not.toHaveBeenCalled()
  })

  it('produces a notification for another user\'s action in a member project', async () => {
    setup({ logsByPid: { p1: [makeLog({ userId: 'someone-else' })] } })
    await generateNotificationsForUser(USER)
    expect(addNotification).toHaveBeenCalledTimes(1)
    expect(addNotification.mock.calls[0][0].recipientUserId).toBe(USER.id)
  })
})

describe('generateNotificationsForUser — project-level events', () => {
  it('meeting.created message includes the resolved project name', async () => {
    setup({
      logsByPid: { p1: [makeLog({ action: 'meeting.created', entityName: 'Standup' })] },
      names: { p1: 'Acme' },
    })
    await generateNotificationsForUser(USER)
    expect(addNotification).toHaveBeenCalledTimes(1)
    expect(firstMessage()).toContain('in Acme')
    expect(firstMessage()).toContain('Standup')
  })

  it('sprint.created produces a notification', async () => {
    setup({ logsByPid: { p1: [makeLog({ action: 'sprint.created', category: 'sprint' })] } })
    await generateNotificationsForUser(USER)
    expect(addNotification).toHaveBeenCalledTimes(1)
    expect(addNotification.mock.calls[0][0].type).toBe('sprint_created')
  })

  it('sprint.completed produces a notification', async () => {
    setup({ logsByPid: { p1: [makeLog({ action: 'sprint.completed', category: 'sprint' })] } })
    await generateNotificationsForUser(USER)
    expect(addNotification).toHaveBeenCalledTimes(1)
    expect(addNotification.mock.calls[0][0].type).toBe('sprint_completed')
  })

  it('evaluation.created produces a notification', async () => {
    setup({ logsByPid: { p1: [makeLog({ action: 'evaluation.created', category: 'system' })] } })
    await generateNotificationsForUser(USER)
    expect(addNotification).toHaveBeenCalledTimes(1)
  })

  it('omits the "in ..." clause when the project name cannot be resolved', async () => {
    setup({
      logsByPid: { p1: [makeLog({ action: 'meeting.created' })] },
      names: {}, // empty -> no resolved name
    })
    await generateNotificationsForUser(USER)
    expect(addNotification).toHaveBeenCalledTimes(1)
    const msg = firstMessage()
    expect(msg).not.toContain(' in ')
    expect(msg).not.toContain('a project')
    expect(msg).not.toContain('this project')
  })
})

describe('generateNotificationsForUser — assignment / ownership', () => {
  it('*.created assigned to current user -> "assigned ... to you" with item type label', async () => {
    setup({
      logsByPid: {
        p1: [
          makeLog({
            action: 'epic.created',
            category: 'epic',
            entityType: 'epic',
            entityName: 'Auth',
            metadata: { assignee: USER.email },
          }),
        ],
      },
    })
    await generateNotificationsForUser(USER)
    expect(addNotification).toHaveBeenCalledTimes(1)
    const msg = firstMessage()
    expect(msg).toContain('assigned the epic')
    expect(msg).toContain('"Auth"')
    expect(msg).toContain('to you')
    expect(addNotification.mock.calls[0][0].type).toBe('task_assigned')
  })

  it('*.updated with assigneeChanged true -> "assigned ... to you"', async () => {
    setup({
      logsByPid: {
        p1: [
          makeLog({
            action: 'task.updated',
            category: 'task',
            entityType: 'task',
            entityName: 'Bug',
            metadata: { assignee: USER.email, assigneeChanged: true },
          }),
        ],
      },
    })
    await generateNotificationsForUser(USER)
    expect(addNotification).toHaveBeenCalledTimes(1)
    expect(addNotification.mock.calls[0][0].type).toBe('task_assigned')
    expect(firstMessage()).toContain('to you')
  })

  it('*.updated with assignee = current user and assigneeChanged falsy -> "updated your ..."', async () => {
    setup({
      logsByPid: {
        p1: [
          makeLog({
            action: 'task.updated',
            category: 'task',
            entityType: 'task',
            entityName: 'Bug',
            metadata: { assignee: USER.email },
          }),
        ],
      },
    })
    await generateNotificationsForUser(USER)
    expect(addNotification).toHaveBeenCalledTimes(1)
    expect(addNotification.mock.calls[0][0].type).toBe('task_update')
    expect(firstMessage()).toContain('updated your task')
  })

  it('task.moved assigned to current user -> "moved your ... to <toStatus>"', async () => {
    setup({
      logsByPid: {
        p1: [
          makeLog({
            action: 'task.moved',
            category: 'task',
            entityType: 'task',
            entityName: 'Bug',
            metadata: { assignee: USER.email, toStatus: 'done' },
          }),
        ],
      },
    })
    await generateNotificationsForUser(USER)
    expect(addNotification).toHaveBeenCalledTimes(1)
    expect(addNotification.mock.calls[0][0].type).toBe('task_moved')
    const msg = firstMessage()
    expect(msg).toContain('moved your task')
    expect(msg).toContain('to done')
  })

  it('created/updated assigned to a DIFFERENT email -> NO notification', async () => {
    setup({
      logsByPid: {
        p1: [
          makeLog({
            action: 'task.created',
            category: 'task',
            entityType: 'task',
            metadata: { assignee: 'other@x.com' },
          }),
        ],
      },
    })
    await generateNotificationsForUser(USER)
    expect(addNotification).not.toHaveBeenCalled()
  })
})

describe('generateNotificationsForUser — de-dup / watermark', () => {
  it('does not re-create a notification for the same source log across two runs', async () => {
    const store = []
    setup({
      logsByPid: { p1: [makeLog({ id: 'log1', action: 'meeting.created' })] },
    })
    // Stateful mocks (applied after setup, which resets mocks) so the store
    // persists across the two runs and feeds the dedup guard.
    addNotification.mockImplementation(async (n) => {
      store.push(n)
    })
    getExistingSourceLogIds.mockImplementation(
      async () => new Set(store.map((n) => n.sourceLogId).filter(Boolean)),
    )

    await generateNotificationsForUser(USER)
    // Reset the watermark so the second run re-considers the same log; dedup must
    // then rely on the sourceLogId guard.
    localStorage.setItem(`zc-notif-watermark-${USER.id}`, '0')
    await generateNotificationsForUser(USER)

    expect(store).toHaveLength(1)
    expect(store[0].sourceLogId).toBe('log1')
  })

  it('skips a log already present in existing source ids', async () => {
    setup({
      logsByPid: { p1: [makeLog({ id: 'log1', action: 'meeting.created' })] },
      existingSourceIds: ['log1'],
    })
    await generateNotificationsForUser(USER)
    expect(addNotification).not.toHaveBeenCalled()
  })

  it('only generates for events newer than the stored watermark', async () => {
    setup({
      watermark: 5000,
      logsByPid: {
        p1: [
          makeLog({ id: 'old', action: 'meeting.created', timestamp: 1000 }),
          makeLog({ id: 'new', action: 'meeting.created', timestamp: 9000 }),
        ],
      },
    })
    await generateNotificationsForUser(USER)
    expect(addNotification).toHaveBeenCalledTimes(1)
    expect(addNotification.mock.calls[0][0].sourceLogId).toBe('new')
  })
})
