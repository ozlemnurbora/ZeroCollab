function parseDateTime(date, time) {
  if (!date || !time) return null
  const dt = new Date(`${date}T${time}`)
  if (Number.isNaN(dt.getTime())) return null
  return dt
}

export function getMeetingLifecycle(meeting, now = Date.now()) {
  const start = parseDateTime(meeting?.date, meeting?.time)
  if (!start) {
    return {
      status: 'invalid',
      startAt: null,
      endAt: null,
      canJoin: false,
    }
  }
  const durationMinutes = Number.isFinite(Number(meeting?.duration))
    ? Number(meeting.duration)
    : 60
  const safeDuration = Math.max(1, durationMinutes)
  const startAt = start.getTime()
  const endAt = startAt + safeDuration * 60 * 1000

  let status = 'upcoming'
  if (now >= endAt) status = 'ended'
  else if (now >= startAt) status = 'active'

  return {
    status,
    startAt,
    endAt,
    canJoin: status !== 'ended',
  }
}
