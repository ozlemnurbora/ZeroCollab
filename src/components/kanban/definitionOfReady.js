import { normalizeStoryPointsValue } from './taskStorage.js'

/** Shown when a user tries to mark an item Ready without meeting DoR. */
export const DEFINITION_OF_READY_MESSAGE =
  'Definition of Ready not satisfied. Ready items require story points and acceptance criteria.'

/** Short hint near the Ready backlog state control. */
export const DEFINITION_OF_READY_HELPER_TEXT =
  'Ready items require estimation and acceptance criteria.'

/**
 * @param {object} taskLike - Task-shaped object (title, storyPoints, acceptanceCriteria, …)
 * @returns {boolean}
 */
export function taskMeetsDefinitionOfReady(taskLike) {
  if (!taskLike || typeof taskLike !== 'object') return false
  const title = String(taskLike.title ?? '').trim()
  if (!title) return false
  const sp = normalizeStoryPointsValue(
    taskLike.storyPoints ?? taskLike.story_points ?? taskLike.points ?? 0,
  )
  if (!(sp > 0)) return false
  const ac = String(
    taskLike.acceptanceCriteria ?? taskLike.acceptance_criteria ?? '',
  ).trim()
  if (!ac) return false
  return true
}

/**
 * Call when the resulting backlog state will be `ready`.
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateReadyBacklogState(taskLike) {
  if (taskMeetsDefinitionOfReady(taskLike)) return { ok: true }
  return { ok: false, message: DEFINITION_OF_READY_MESSAGE }
}
