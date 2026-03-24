export function formatDueDate(isoDate, locale) {
  if (!isoDate) return '—'
  const d = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat(locale || undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(d)
}

export function isOverdue(isoDate) {
  if (!isoDate) return false
  const due = new Date(`${isoDate}T23:59:59`)
  if (Number.isNaN(due.getTime())) return false
  return due.getTime() < Date.now()
}

