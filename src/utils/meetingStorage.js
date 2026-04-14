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
