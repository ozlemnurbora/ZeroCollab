export function statusColorClasses(status) {
  if (status === 'done') return 'bg-emerald-400'
  if (status === 'in_progress') return 'bg-indigo-400'
  return 'bg-slate-400'
}

