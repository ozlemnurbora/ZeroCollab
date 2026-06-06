export function formatTimestamp(ms, locale) {
  if (!ms) return ''
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(locale || undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export function formatTimestampWithDate(ms, locale) {
  if (!ms) return ''
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(locale || undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

export function formatTimestampLong(ms, locale) {
  if (!ms) return ''
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(locale || undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

