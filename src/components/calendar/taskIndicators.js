export function statusColorClasses(status) {
  if (status === 'done') return 'bg-emerald-400'
  if (status === 'in_progress') return 'bg-blue-400'
  if (status === 'in_review') return 'bg-violet-400'
  return 'bg-violet-400'
}

/** Pill/badge styles for calendar day cells (To Do = purple, In Progress = blue, Done = green). */
export function taskBadgeClasses(status) {
  if (status === 'done') {
    return 'bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-500/35'
  }
  if (status === 'in_progress') {
    return 'bg-blue-500/20 text-blue-100 ring-1 ring-blue-500/35'
  }
  if (status === 'in_review') {
    return 'bg-violet-500/20 text-violet-100 ring-1 ring-violet-500/35'
  }
  return 'bg-violet-500/20 text-violet-100 ring-1 ring-violet-500/35'
}

