import { getMeetingsForOwner, getMeetingsRaw, replaceMeetingsStore } from './database.js'

export async function loadMeetings(ownerUserId) {
  try {
    if (!ownerUserId) return []
    const result = await getMeetingsForOwner(ownerUserId)
    console.log('[MeetingDB] loaded:', result?.length)
    return result ?? []
  } catch (err) {
    console.error('[MeetingDB] load error:', err)
    return []
  }
}

export async function saveMeeting(meeting, ownerUserId) {
  try {
    if (!meeting?.id || !ownerUserId) return
    const all = await getMeetingsRaw()
    const without = all.filter((m) => m.id !== meeting.id)
    const next = [...without, { ...meeting, ownerUserId }]
    await replaceMeetingsStore(next)
    console.log('[MeetingDB] saved:', meeting.id)
  } catch (err) {
    console.error('[MeetingDB] save error:', err)
  }
}

export async function deleteMeeting(id, ownerUserId) {
  try {
    if (!ownerUserId) return
    const all = await getMeetingsRaw()
    const next = all.filter((m) => {
      if (m.id !== id) return true
      if (m.ownerUserId === ownerUserId) return false
      return true
    })
    if (next.length === all.length) return
    await replaceMeetingsStore(next)
    console.log('[MeetingDB] deleted:', id)
  } catch (err) {
    console.error('[MeetingDB] delete error:', err)
  }
}

export async function pruneMeetingsByProjectIds(projectIds, ownerUserId) {
  if (!ownerUserId) return
  const ids = new Set(Array.isArray(projectIds) ? projectIds.filter(Boolean) : [])
  if (ids.size === 0) return
  try {
    const all = await getMeetingsRaw()
    const next = all.filter((meeting) => {
      if (!meeting?.projectId || !ids.has(meeting.projectId)) return true
      if (meeting.ownerUserId !== ownerUserId) return true
      return false
    })
    if (next.length === all.length) return
    await replaceMeetingsStore(next)
    console.log('[MeetingDB] pruned meetings for projects:', Array.from(ids))
  } catch (err) {
    console.error('[MeetingDB] prune error:', err)
  }
}
