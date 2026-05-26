import { getEvaluationsForProject, replaceEvaluationsForProject } from '../../utils/database.js'
import {
  fetchEvaluationsForProject,
  persistMergedEvaluationsForProject,
  upsertEvaluation,
  deleteRemoteEvaluation,
  canFetchRemoteEvaluations,
} from '../../utils/evaluationRemoteStorage.js'
import { mergeEvaluations } from './evaluationCoreUtils.js'

/**
 * Local-first read: returns whatever IndexedDB has for this project.
 * UI should call this first for instant render, then call syncEvaluationsForProject.
 */
export async function loadEvaluationsForProject(projectId) {
  try {
    if (!projectId) return []
    const items = await getEvaluationsForProject(projectId)
    const arr = Array.isArray(items) ? items : []
    return arr.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
  } catch {
    return []
  }
}

/**
 * Fetch remote, merge with local, persist merged set, return merged list.
 * Caller passes membership context for the eligibility gate.
 */
export async function syncEvaluationsForProject(projectId, memberProjectIds, activeProjectId) {
  try {
    if (!projectId) return []
    const local = await getEvaluationsForProject(projectId)
    if (!canFetchRemoteEvaluations(projectId, memberProjectIds, activeProjectId)) {
      return local
    }
    const remote = await fetchEvaluationsForProject(projectId)
    const merged = mergeEvaluations(local, remote)
    await persistMergedEvaluationsForProject(projectId, merged)
    return merged
  } catch (err) {
    console.error('[evaluationStorage] sync failed:', err)
    return await getEvaluationsForProject(projectId)
  }
}

/**
 * Add one new evaluation: write local immediately, push to remote in background.
 */
export async function saveEvaluation(evaluation) {
  try {
    const pid = evaluation?.projectId
    if (!pid || !evaluation?.id) return null
    const local = await getEvaluationsForProject(pid)
    const merged = mergeEvaluations(local, [evaluation])
    await replaceEvaluationsForProject(pid, merged)
    void upsertEvaluation(evaluation).catch((err) =>
      console.error('[evaluationStorage] remote push failed:', err),
    )
    return evaluation
  } catch (err) {
    console.error('[evaluationStorage] saveEvaluation failed:', err)
    return null
  }
}

export async function deleteEvaluationById(evaluation) {
  try {
    const pid = evaluation?.projectId
    const id = evaluation?.id
    if (!pid || !id) return false
    const local = await getEvaluationsForProject(pid)
    const next = local.filter((e) => e.id !== id)
    await replaceEvaluationsForProject(pid, next)
    void deleteRemoteEvaluation(id).catch((err) =>
      console.error('[evaluationStorage] remote delete failed:', err),
    )
    return true
  } catch (err) {
    console.error('[evaluationStorage] deleteEvaluationById failed:', err)
    return false
  }
}
