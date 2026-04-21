import { getEvaluationsForOwner, replaceEvaluationsForOwner } from '../../utils/database.js'

export async function loadEvaluations(ownerUserId) {
  try {
    if (!ownerUserId) return []
    const items = await getEvaluationsForOwner(ownerUserId)
    return Array.isArray(items) ? items : []
  } catch {
    return []
  }
}

export async function saveEvaluations(items, ownerUserId) {
  try {
    if (!ownerUserId) return
    await replaceEvaluationsForOwner(ownerUserId, items)
  } catch {
    // ignore storage errors
  }
}
