import { describe, expect, it } from 'vitest'
import { getLinkedTasksForStory, getReadySprintCandidates, commitStoryToSprint, removeStoryFromSprint, commitIndependentTaskToSprint, removeIndependentTaskFromSprint } from '../sprint/sprintPlanningHierarchyUtils.js'

const story1 = { id: 's1', itemType: 'user_story', backlogState: 'ready', storyPoints: 5 }
const story2 = { id: 's2', itemType: 'user_story', backlogState: 'ready', storyPoints: 3 }
const task1 = { id: 't1', itemType: 'task', parentStoryId: 's1', backlogState: 'ready' }
const task2 = { id: 't2', itemType: 'task', parentStoryId: 's1', backlogState: 'ready' }
const task3 = { id: 't3', itemType: 'task', parentStoryId: 's2', backlogState: 'ready' }
const independentTask = { id: 't4', itemType: 'task', backlogState: 'ready' }
const items = [story1, story2, task1, task2, task3, independentTask]

describe('getLinkedTasksForStory', () => {
  it('returns tasks linked to a story', () => {
    const linked = getLinkedTasksForStory('s1', items)
    expect(linked).toHaveLength(2)
    expect(linked.map(t => t.id)).toContain('t1')
    expect(linked.map(t => t.id)).toContain('t2')
  })
  it('returns empty for unknown story', () => {
    expect(getLinkedTasksForStory('unknown', items)).toHaveLength(0)
  })
  it('returns empty for null storyId', () => {
    expect(getLinkedTasksForStory(null, items)).toHaveLength(0)
  })
})

describe('getReadySprintCandidates', () => {
  it('returns ready stories', () => {
    const { readyStories } = getReadySprintCandidates(items)
    expect(readyStories).toHaveLength(2)
  })
  it('returns ready independent tasks (no parentStoryId)', () => {
    const { readyIndependentTasks } = getReadySprintCandidates(items)
    expect(readyIndependentTasks).toHaveLength(1)
    expect(readyIndependentTasks[0].id).toBe('t4')
  })
  it('excludes items already in sprint', () => {
    const inSprint = [{ ...story1, inSprint: true }, story2, ...items.slice(2)]
    const { readyStories } = getReadySprintCandidates(inSprint)
    expect(readyStories).toHaveLength(1)
    expect(readyStories[0].id).toBe('s2')
  })
  it('excludes non-ready items', () => {
    const mixed = [{ ...story1, backlogState: 'new' }, story2, ...items.slice(2)]
    const { readyStories } = getReadySprintCandidates(mixed)
    expect(readyStories).toHaveLength(1)
  })
})

describe('commitStoryToSprint', () => {
  it('marks story and linked tasks as in sprint', () => {
    const { changedItems } = commitStoryToSprint('s1', 'sprint_1', items)
    expect(changedItems).toHaveLength(3)
    changedItems.forEach(item => {
      expect(item.sprintId).toBe('sprint_1')
      expect(item.inSprint).toBe(true)
    })
  })
  it('does not change unrelated items', () => {
    const { nextItems } = commitStoryToSprint('s1', 'sprint_1', items)
    const unrelated = nextItems.find(i => i.id === 's2')
    expect(unrelated.sprintId).toBeUndefined()
  })
})

describe('removeStoryFromSprint', () => {
  it('removes story and linked tasks from sprint', () => {
    const committed = commitStoryToSprint('s1', 'sprint_1', items).nextItems
    const { changedItems } = removeStoryFromSprint('s1', committed)
    expect(changedItems).toHaveLength(3)
    changedItems.forEach(item => {
      expect(item.sprintId).toBeNull()
      expect(item.inSprint).toBe(false)
    })
  })
})

describe('commitIndependentTaskToSprint', () => {
  it('marks task as in sprint', () => {
    const { changedItems } = commitIndependentTaskToSprint('t4', 'sprint_1', items)
    expect(changedItems).toHaveLength(1)
    expect(changedItems[0].sprintId).toBe('sprint_1')
    expect(changedItems[0].inSprint).toBe(true)
  })
})

describe('removeIndependentTaskFromSprint', () => {
  it('removes task from sprint', () => {
    const committed = commitIndependentTaskToSprint('t4', 'sprint_1', items).nextItems
    const { changedItems } = removeIndependentTaskFromSprint('t4', committed)
    expect(changedItems).toHaveLength(1)
    expect(changedItems[0].sprintId).toBeNull()
    expect(changedItems[0].inSprint).toBe(false)
  })
})
