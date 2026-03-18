import { getEvaluations, putEvaluations } from '../../utils/database.js'

export async function loadEvaluations() {
  try {
    const items = await getEvaluations()
    return Array.isArray(items) ? items : []
  } catch {
    return []
  }
}

export async function saveEvaluations(items) {
  try {
    await putEvaluations(items)
  } catch {
    // ignore storage errors
  }
}

