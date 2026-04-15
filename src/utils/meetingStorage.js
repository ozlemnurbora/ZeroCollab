import { getDatabase } from './database.js'

export async function loadMeetings() {
  try {
    const db = await getDatabase()
    const result = await db.getAll('meetings')
    console.log('[MeetingDB] loaded:', result?.length)
    return result ?? []
  } catch (err) {
    console.error('[MeetingDB] load error:', err)
    return []
  }
}

export async function saveMeeting(meeting) {
  try {
    const db = await getDatabase()
    await db.put('meetings', meeting)
    console.log('[MeetingDB] saved:', meeting.id)
  } catch (err) {
    console.error('[MeetingDB] save error:', err)
  }
}

export async function deleteMeeting(id) {
  try {
    const db = await getDatabase()
    await db.delete('meetings', id)
    console.log('[MeetingDB] deleted:', id)
  } catch (err) {
    console.error('[MeetingDB] delete error:', err)
  }
}

export async function pruneMeetingsByProjectIds(projectIds) {
  const ids = new Set(Array.isArray(projectIds) ? projectIds.filter(Boolean) : [])
  if (ids.size === 0) return
  try {
    const db = await getDatabase()
    const existing = (await db.getAll('meetings')) ?? []
    const next = existing.filter((meeting) => !meeting?.projectId || !ids.has(meeting.projectId))
    if (next.length === existing.length) return
    const tx = db.transaction('meetings', 'readwrite')
    await tx.store.clear()
    for (const meeting of next) {
      if (meeting?.id) await tx.store.put(meeting)
    }
    await tx.done
    console.log('[MeetingDB] pruned meetings for projects:', Array.from(ids))
  } catch (err) {
    console.error('[MeetingDB] prune error:', err)
  }
}
