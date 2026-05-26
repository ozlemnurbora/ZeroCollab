/**
 * Pure helpers for project-scoped evaluations (no IndexedDB / network).
 * Shared visibility is by projectId, not by authorUserId.
 */

export function isProjectEvaluation(item) {
  if (!item || typeof item !== 'object') return false
  if (!item.id) return false
  const pid = item.projectId ?? item.project_id
  if (pid == null || String(pid).trim() === '') return false
  return true
}

export function isEvaluationForProject(item, projectId) {
  if (!isProjectEvaluation(item)) return false
  const pid = item.projectId ?? item.project_id
  return String(pid ?? '') === String(projectId ?? '')
}

export function projectIdAllowedForEvaluations(projectId, memberProjectIds, activeProjectId = null) {
  const ps = String(projectId ?? '')
  if (!ps) return false
  const list = Array.isArray(memberProjectIds) ? memberProjectIds : []
  for (const id of list) {
    if (String(id) === ps) return true
  }
  if (activeProjectId != null && String(activeProjectId) === ps) return true
  return false
}

export function mergeEvaluations(existingItems, incomingItems) {
  const byId = new Map()
  for (const e of Array.isArray(existingItems) ? existingItems : []) {
    if (e?.id != null && String(e.id).trim() !== '') byId.set(String(e.id), e)
  }
  for (const e of Array.isArray(incomingItems) ? incomingItems : []) {
    if (e?.id != null && String(e.id).trim() !== '') byId.set(String(e.id), e)
  }
  return Array.from(byId.values()).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
}
