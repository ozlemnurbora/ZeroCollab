import { getTasksForActiveSprint } from './sprintProgressUtils.js'

function normalizeItemType(item) {
  if (!item) return 'task'
  const it = String(item.itemType ?? '').toLowerCase().trim()
  if (it) return it
  const t = String(item.type ?? '').trim()
  if (t === 'Epic') return 'epic'
  if (t === 'Feature') return 'feature'
  if (t === 'User Story' || t === 'UserStory') return 'user_story'
  if (t === 'Task') return 'task'
  return 'task'
}

function normalizeBacklogState(value) {
  const low = String(value ?? '').toLowerCase().trim()
  if (low === 'ready') return 'ready'
  if (low === 'refined') return 'refined'
  if (low === 'done') return 'done'
  if (low === 'new') return 'new'
  return low || 'new'
}

function getStoryPointsValue(item) {
  const raw = item?.storyPoints ?? item?.story_points ?? item?.points ?? 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

export function getLinkedTasksForStory(storyId, items) {
  if (!storyId) return []
  return (Array.isArray(items) ? items : []).filter(
    (t) => t && normalizeItemType(t) === 'task' && t.parentStoryId === storyId,
  )
}

export function getReadySprintCandidates(items) {
  const list = Array.isArray(items) ? items : []
  const readyStories = []
  const readyIndependentTasks = []

  for (const it of list) {
    if (!it) continue
    if (it.sprintId || it.inSprint === true) continue
    const state = normalizeBacklogState(it.backlogState)
    if (state !== 'ready') continue
    const type = normalizeItemType(it)
    if (type === 'user_story') {
      readyStories.push(it)
      continue
    }
    if (type === 'task') {
      // Exclude tasks that are linked to a User Story from appearing as standalone candidates.
      if (it.parentStoryId) continue
      readyIndependentTasks.push(it)
      continue
    }
  }

  return { readyStories, readyIndependentTasks }
}

export function commitStoryToSprint(storyId, sprintId, items, opts = {}) {
  const now = opts.now ?? Date.now()
  const sprintNumber = opts.sprintNumber ?? null
  const list = Array.isArray(items) ? items : []
  const linkedTasks = getLinkedTasksForStory(storyId, list)
  const changedIds = new Set([storyId, ...linkedTasks.map((t) => t?.id).filter(Boolean)])

  const next = list.map((it) => {
    if (!it || !changedIds.has(it.id)) return it
    const rawBs = it.backlogState || 'ready'
    const backlogStateForSprint =
      String(rawBs).toLowerCase() === 'refined' ? 'ready' : rawBs
    return {
      ...it,
      sprintId,
      sprintNumber,
      sprintCommittedAt: now,
      inSprint: true,
      backlogState: backlogStateForSprint,
      calendarType: 'general',
      calendarId: 'general',
      updatedAt: now,
    }
  })

  const changedItems = next.filter((it) => it && changedIds.has(it.id))
  return { nextItems: next, changedItems }
}

export function removeStoryFromSprint(storyId, items, opts = {}) {
  const now = opts.now ?? Date.now()
  const list = Array.isArray(items) ? items : []
  const linkedTasks = getLinkedTasksForStory(storyId, list)
  const changedIds = new Set([storyId, ...linkedTasks.map((t) => t?.id).filter(Boolean)])

  const next = list.map((it) => {
    if (!it || !changedIds.has(it.id)) return it
    return {
      ...it,
      sprintId: null,
      sprintNumber: null,
      sprintCommittedAt: null,
      inSprint: false,
      backlogState: 'ready',
      calendarType: 'general',
      calendarId: 'general',
      updatedAt: now,
    }
  })

  const changedItems = next.filter((it) => it && changedIds.has(it.id))
  return { nextItems: next, changedItems }
}

export function commitIndependentTaskToSprint(taskId, sprintId, items, opts = {}) {
  const now = opts.now ?? Date.now()
  const sprintNumber = opts.sprintNumber ?? null
  const list = Array.isArray(items) ? items : []
  const next = list.map((it) => {
    if (!it || it.id !== taskId) return it
    const rawBs = it.backlogState || 'ready'
    const backlogStateForSprint =
      String(rawBs).toLowerCase() === 'refined' ? 'ready' : rawBs
    return {
      ...it,
      sprintId,
      sprintNumber,
      sprintCommittedAt: now,
      inSprint: true,
      backlogState: backlogStateForSprint,
      calendarType: 'general',
      calendarId: 'general',
      updatedAt: now,
    }
  })
  const changedItems = next.filter((it) => it?.id === taskId)
  return { nextItems: next, changedItems }
}

export function removeIndependentTaskFromSprint(taskId, items, opts = {}) {
  const now = opts.now ?? Date.now()
  const list = Array.isArray(items) ? items : []
  const next = list.map((it) => {
    if (!it || it.id !== taskId) return it
    return {
      ...it,
      sprintId: null,
      sprintNumber: null,
      sprintCommittedAt: null,
      inSprint: false,
      backlogState: 'ready',
      calendarType: 'general',
      calendarId: 'general',
      updatedAt: now,
    }
  })
  const changedItems = next.filter((it) => it?.id === taskId)
  return { nextItems: next, changedItems }
}

export function calculateSprintCapacityLoad(items, activeSprint, projectId) {
  const sprintItems = getTasksForActiveSprint(items, activeSprint, projectId)
  const stories = sprintItems.filter((it) => normalizeItemType(it) === 'user_story')
  const tasks = sprintItems.filter((it) => normalizeItemType(it) === 'task')

  const taskByStory = new Map()
  for (const t of tasks) {
    if (!t?.parentStoryId) continue
    const list = taskByStory.get(t.parentStoryId) ?? []
    list.push(t)
    taskByStory.set(t.parentStoryId, list)
  }

  let load = 0

  // Stories: use story points if set; otherwise sum linked task points.
  for (const s of stories) {
    const sp = getStoryPointsValue(s)
    if (sp > 0) {
      load += sp
    } else {
      const linked = taskByStory.get(s.id) ?? []
      const sum = linked.reduce((acc, t) => acc + getStoryPointsValue(t), 0)
      load += sum
    }
  }

  // Independent tasks: tasks with no parentStoryId.
  for (const t of tasks) {
    if (t?.parentStoryId) continue
    load += getStoryPointsValue(t)
  }

  return load
}

