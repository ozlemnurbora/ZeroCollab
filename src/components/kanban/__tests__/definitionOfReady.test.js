import { describe, expect, it } from 'vitest'
import {
  DEFINITION_OF_READY_CHECKLIST_MESSAGE,
  DEFINITION_OF_READY_MESSAGE,
  itemTypeRequiresInvestChecklist,
  validateReadyBacklogState,
} from '../definitionOfReady.js'

const fullInvest = {
  independent: true,
  negotiable: true,
  valuable: true,
  estimable: true,
  small: true,
  testable: true,
}

describe('validateReadyBacklogState', () => {
  it('fails when storyPoints = 0', () => {
    const r = validateReadyBacklogState({
      title: 'T',
      storyPoints: 0,
      acceptanceCriteria: 'AC',
      itemType: 'task',
    })
    expect(r.ok).toBe(false)
    expect(r.message).toBe(DEFINITION_OF_READY_MESSAGE)
  })

  it('fails when acceptanceCriteria is empty', () => {
    const r = validateReadyBacklogState({
      title: 'T',
      storyPoints: 3,
      acceptanceCriteria: '   ',
      itemType: 'task',
    })
    expect(r.ok).toBe(false)
    expect(r.message).toBe(DEFINITION_OF_READY_MESSAGE)
  })

  it('fails when INVEST checklist incomplete for user_story', () => {
    const r = validateReadyBacklogState({
      title: 'US',
      storyPoints: 5,
      acceptanceCriteria: 'Given…',
      itemType: 'user_story',
      definitionOfReady: { ...fullInvest, testable: false },
    })
    expect(r.ok).toBe(false)
    expect(r.message).toBe(DEFINITION_OF_READY_CHECKLIST_MESSAGE)
  })

  it('passes when storyPoints > 0, acceptanceCriteria set, INVEST complete for user_story', () => {
    const r = validateReadyBacklogState({
      title: 'US',
      storyPoints: 8,
      acceptanceCriteria: 'Criteria here',
      itemType: 'user_story',
      definitionOfReady: fullInvest,
    })
    expect(r).toEqual({ ok: true })
  })

  it('task itemType does not require INVEST checklist', () => {
    expect(itemTypeRequiresInvestChecklist('task')).toBe(false)
    const r = validateReadyBacklogState({
      title: 'Task',
      storyPoints: 2,
      acceptanceCriteria: 'Must do X',
      itemType: 'task',
      definitionOfReady: {},
    })
    expect(r).toEqual({ ok: true })
  })
})
