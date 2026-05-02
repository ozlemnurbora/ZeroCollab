import { normalizeStoryPointsValue } from './taskStorage.js'

/** Shown when title / SP / acceptance fail. */
export const DEFINITION_OF_READY_MESSAGE =
  'Definition of Ready not satisfied. Ready items require story points and acceptance criteria.'

/** Shown when INVEST checklist incomplete for Epic / Feature / User Story. */
export const DEFINITION_OF_READY_CHECKLIST_MESSAGE =
  'Definition of Ready checklist must be completed before marking this item as Ready.'

/** Short hint near the Ready backlog state control. */
export const DEFINITION_OF_READY_HELPER_TEXT =
  'Ready items require estimation and acceptance criteria.'

/** Optional copy under the INVEST checklist. */
export const INVEST_CHECKLIST_HELPER_TEXT =
  'INVEST criteria help determine whether backlog items are ready for sprint planning.'

export const INVEST_CHECKLIST_LABELS = [
  { key: 'independent', label: 'Independent' },
  { key: 'negotiable', label: 'Negotiable' },
  { key: 'valuable', label: 'Valuable' },
  { key: 'estimable', label: 'Estimable' },
  { key: 'small', label: 'Small' },
  { key: 'testable', label: 'Testable' },
]

const INVEST_ITEM_TYPES = new Set(['epic', 'feature', 'user_story'])

export function itemTypeRequiresInvestChecklist(itemType) {
  const t =
    typeof itemType === 'string' && itemType.trim() ? itemType.trim() : 'task'
  return INVEST_ITEM_TYPES.has(t)
}

/**
 * @param {object | null | undefined} raw
 * @returns {{ independent: boolean, negotiable: boolean, valuable: boolean, estimable: boolean, small: boolean, testable: boolean }}
 */
export function normalizeDefinitionOfReady(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  return {
    independent: !!r.independent,
    negotiable: !!r.negotiable,
    valuable: !!r.valuable,
    estimable: !!r.estimable,
    small: !!r.small,
    testable: !!r.testable,
  }
}

export function investChecklistComplete(definitionOfReady) {
  const d = normalizeDefinitionOfReady(definitionOfReady)
  return (
    d.independent &&
    d.negotiable &&
    d.valuable &&
    d.estimable &&
    d.small &&
    d.testable
  )
}

/**
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateReadyBacklogState(taskLike) {
  if (!taskLike || typeof taskLike !== 'object') {
    return { ok: false, message: DEFINITION_OF_READY_MESSAGE }
  }
  const title = String(taskLike.title ?? '').trim()
  if (!title) return { ok: false, message: DEFINITION_OF_READY_MESSAGE }
  const sp = normalizeStoryPointsValue(
    taskLike.storyPoints ?? taskLike.story_points ?? taskLike.points ?? 0,
  )
  if (!(sp > 0)) return { ok: false, message: DEFINITION_OF_READY_MESSAGE }
  const ac = String(
    taskLike.acceptanceCriteria ?? taskLike.acceptance_criteria ?? '',
  ).trim()
  if (!ac) return { ok: false, message: DEFINITION_OF_READY_MESSAGE }

  if (itemTypeRequiresInvestChecklist(taskLike.itemType)) {
    if (!investChecklistComplete(taskLike.definitionOfReady)) {
      return { ok: false, message: DEFINITION_OF_READY_CHECKLIST_MESSAGE }
    }
  }
  return { ok: true }
}

export function taskMeetsDefinitionOfReady(taskLike) {
  return validateReadyBacklogState(taskLike).ok
}
