/**
 * Keeps task.doneAt aligned with workflow status for burndown and sync.
 * When entering "done", stamps completion time. When leaving "done", clears it.
 */
export function resolveDoneAtForStatusChange(task, nextStatusRaw, now = Date.now()) {
  const prev = String(task?.status ?? '').toLowerCase()
  const next = String(nextStatusRaw ?? '').toLowerCase()
  const existing =
    typeof task?.doneAt === 'number' && Number.isFinite(task.doneAt)
      ? task.doneAt
      : typeof task?.done_at === 'number' && Number.isFinite(task.done_at)
        ? task.done_at
        : null

  if (next === 'done' && prev !== 'done') {
    return now
  }
  if (next !== 'done') {
    return null
  }
  // Staying in done: preserve first completion time; backfill if legacy data had none
  return existing ?? now
}
