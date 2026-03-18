import { EVALUATION_STORAGE_KEY } from './evaluationConstants.js'

export function loadEvaluations() {
  try {
    const raw = localStorage.getItem(EVALUATION_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveEvaluations(items) {
  try {
    localStorage.setItem(EVALUATION_STORAGE_KEY, JSON.stringify(items))
  } catch {
    // ignore storage errors
  }
}

