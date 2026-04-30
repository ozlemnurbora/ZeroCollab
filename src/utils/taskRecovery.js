import { getDatabase, DATABASE_META } from './database.js'
import { normalizeTaskForStorage } from '../components/kanban/taskStorage.js'

export function normalizeLegacyTask(task, ownerUserId) {
  return normalizeTaskForStorage(task, ownerUserId)
}

/**
 * One-time recovery:
 * - reads ALL tasks from IndexedDB (not only owner slice)
 * - stamps missing ownerUserId to the current owner
 * - normalizes missing sprint fields + calendarType defaults
 * - writes back only if anything changed
 */
export async function recoverLegacyTasksForCurrentUser(ownerUserId) {
  if (!ownerUserId) return null
  const db = await getDatabase()
  const tasksStoreName = DATABASE_META?.stores?.tasks || 'tasks'
  const all = (await db.getAll(tasksStoreName)) ?? []
  const list = Array.isArray(all) ? all : []

  let changed = 0
  const normalized = []
  for (const t of list) {
    const next = normalizeLegacyTask(t, ownerUserId)
    if (!next) continue

    const prevOwner = t?.ownerUserId ?? null
    const nextOwner = next?.ownerUserId ?? null
    const ownerChanged = !prevOwner && !!nextOwner

    const sprintIdChanged =
      (t?.sprintId == null || t?.sprintId === '') && next.sprintId === null
        ? false
        : String(t?.sprintId ?? '') !== String(next.sprintId ?? '')

    const calendarChanged = (t?.calendarType ?? null) !== (next?.calendarType ?? null)
    const sprintNumberChanged =
      (t?.sprintNumber ?? null) !== (next?.sprintNumber ?? null)
    const storyPointsChanged =
      Number(t?.storyPoints ?? t?.story_points ?? t?.points ?? 0) !== Number(next?.storyPoints ?? 0)
    const updatedAtChanged =
      (t?.updatedAt ?? null) !== (next?.updatedAt ?? null)

    if (ownerChanged || sprintIdChanged || calendarChanged || sprintNumberChanged || storyPointsChanged || updatedAtChanged) {
      changed += 1
    }
    normalized.push(next)
  }

  if (changed === 0) {
    console.log('[taskRecovery] no legacy tasks to recover', {
      ownerUserId,
      total: list.length,
    })
    return normalized
  }

  const tx = db.transaction(tasksStoreName, 'readwrite')
  for (const t of normalized) {
    if (t && typeof t === 'object' && t.id) await tx.store.put(t)
  }
  await tx.done

  console.log('[taskRecovery] recovered legacy tasks', {
    ownerUserId,
    total: list.length,
    updated: changed,
  })
  return normalized
}

