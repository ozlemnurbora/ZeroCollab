import { supabase } from './supabase.js'

export function isSharedMeeting(meeting) {
  return !!meeting && meeting.calendarType === 'general' && !!meeting.projectId
}

export function mapMeetingToRemote(meeting) {
  if (!isSharedMeeting(meeting)) return null
  return {
    id: meeting.id,
    project_id: meeting.projectId,
    title: meeting.title ?? '',
    description: meeting.description ?? null,
    meeting_date: meeting.date ?? null,
    meeting_time: meeting.time ?? null,
    duration: meeting.duration ?? null,
    recurring: meeting.recurring ?? 'none',
    calendar_type: meeting.calendarType,
    timezone: meeting.timezone ?? null,
    owner_user_id: meeting.ownerUserId ?? null,
    payload: { ...meeting },
    updated_at: new Date().toISOString(),
  }
}

export function mapRemoteMeeting(row) {
  if (!row) return null
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {}
  return {
    ...payload,
    id: row.id ?? payload.id,
    projectId: row.project_id ?? payload.projectId ?? null,
    title: row.title ?? payload.title ?? '',
    description: row.description ?? payload.description ?? '',
    date: row.meeting_date ?? payload.date ?? '',
    time: row.meeting_time ?? payload.time ?? '',
    duration: row.duration ?? payload.duration ?? 60,
    recurring: row.recurring ?? payload.recurring ?? 'none',
    calendarType: row.calendar_type ?? payload.calendarType ?? 'general',
    timezone: row.timezone ?? payload.timezone ?? null,
    ownerUserId: row.owner_user_id ?? payload.ownerUserId ?? null,
    createdAt: payload.createdAt ?? (row.created_at ? Date.parse(row.created_at) : undefined),
    updatedAt: payload.updatedAt ?? (row.updated_at ? Date.parse(row.updated_at) : undefined),
  }
}

export async function upsertRemoteMeeting(meeting) {
  try {
    if (!isSharedMeeting(meeting)) return
    const row = mapMeetingToRemote(meeting)
    if (!row) return
    const { error } = await supabase
      .from('meetings')
      .upsert(row, { onConflict: 'id' })
    if (error) console.error('[MeetingRemoteStorage] upsertRemoteMeeting error', error)
  } catch (err) {
    console.error('[MeetingRemoteStorage] upsertRemoteMeeting exception', err)
  }
}

export async function fetchRemoteMeetingsForProject(projectId) {
  try {
    if (!projectId) return []
    const { data, error } = await supabase
      .from('meetings')
      .select('*')
      .eq('project_id', projectId)
    if (error) {
      console.error('[MeetingRemoteStorage] fetchRemoteMeetingsForProject error', error)
      return []
    }
    return (Array.isArray(data) ? data : []).map(mapRemoteMeeting).filter(Boolean)
  } catch (err) {
    console.error('[MeetingRemoteStorage] fetchRemoteMeetingsForProject exception', err)
    return []
  }
}

export async function deleteRemoteMeeting(meetingId, projectId) {
  try {
    if (!meetingId || !projectId) return
    const { error } = await supabase.from('meetings').delete().eq('id', meetingId)
    if (error) console.error('[MeetingRemoteStorage] deleteRemoteMeeting error', error)
  } catch (err) {
    console.error('[MeetingRemoteStorage] deleteRemoteMeeting exception', err)
  }
}
