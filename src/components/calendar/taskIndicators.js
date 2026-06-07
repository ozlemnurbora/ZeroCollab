export function statusColorClasses(status) {
  if (status === 'done') return 'bg-emerald-400'
  if (status === 'in_progress') return 'bg-blue-400'
  if (status === 'in_review') return 'bg-violet-400'
  return 'bg-violet-400'
}

/** Pill/badge styles for calendar day cells (To Do = purple, In Progress = blue, Done = green). */
export function taskBadgeClasses(status) {
  if (status === 'done') {
    return 'bg-emerald-600 text-white ring-1 ring-emerald-700'
  }
  if (status === 'in_progress') {
    return 'bg-blue-600 text-white ring-1 ring-blue-700'
  }
  if (status === 'in_review') {
    return 'bg-violet-600 text-white ring-1 ring-violet-700'
  }
  return 'bg-violet-600 text-white ring-1 ring-violet-700'
}

