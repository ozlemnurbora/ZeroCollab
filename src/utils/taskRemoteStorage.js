import { supabase } from './supabase.js'

function isSharedProjectTask(task) {
  if (!task || typeof task !== 'object') return false
  if (!task.projectId) return false
  // Only shared/general project tasks go to Supabase.
  return task.calendarType === 'general' || !task.calendarType
}

function toIso(ts) {
  const n = typeof ts === 'number' && Number.isFinite(ts) ? ts : Date.now()
  return new Date(n).toISOString()
}

export function normalizeTaskForRemote(task, fallbackUserId) {
  if (!isSharedProjectTask(task)) return null
  const id = typeof task.id === 'string' ? task.id : String(task.id || '')
  const projectId = typeof task.projectId === 'string' ? task.projectId : String(task.projectId || '')
  if (!id || !projectId) return null

  const normalized = {
    ...task,
    id,
    projectId,
    status: typeof task.status === 'string' && task.status.trim() ? task.status.trim().toLowerCase() : 'todo',
    priority: typeof task.priority === 'string' && task.priority.trim() ? task.priority.trim() : 'must',
    itemType: typeof task.itemType === 'string' && task.itemType.trim() ? task.itemType.trim() : 'task',
    backlogState: typeof task.backlogState === 'string' && task.backlogState.trim() ? task.backlogState.trim() : 'new',
    storyPoints: Number(task.storyPoints ?? 0) || 0,
    sprintId: task.sprintId == null || task.sprintId === '' ? null : task.sprintId,
    sprintNumber: task.sprintNumber == null || task.sprintNumber === '' ? null : task.sprintNumber,
    calendarType: 'general',
    calendarId: task.calendarId || 'general',
    ownerUserId: task.ownerUserId || fallbackUserId || null,
    updatedAt:
      typeof task.updatedAt === 'number' && Number.isFinite(task.updatedAt)
        ? task.updatedAt
        : Date.now(),
  }

  return {
    id: normalized.id,
    project_id: normalized.projectId,
    title: normalized.title || normalized.name || 'Untitled',
    description: normalized.description ?? null,
    assignee: normalized.assignee ?? null,
    status: normalized.status || 'todo',
    priority: normalized.priority || 'must',
    item_type: normalized.itemType || 'task',
    backlog_state: normalized.backlogState || 'new',
    story_points: Number(normalized.storyPoints || 0),
    sprint_id: normalized.sprintId || null,
    sprint_number: normalized.sprintNumber ?? null,
    sprint_committed_at: normalized.sprintCommittedAt || null,
    calendar_type: normalized.calendarType || 'general',
    calendar_id: normalized.calendarId || 'general',
    team_id: normalized.teamId || null,
    owner_user_id: normalized.ownerUserId || fallbackUserId || null,
    payload: normalized,
    updated_at: toIso(normalized.updatedAt),
  }
}

export function mapRemoteTask(row) {
  if (!row) return null
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {}
  const id = typeof row.id === 'string' ? row.id : String(payload.id || '')
  const projectId = row.project_id ?? payload.projectId ?? null

  const createdAt = row.created_at ? Date.parse(row.created_at) : payload.createdAt ?? null
  const updatedAt = row.updated_at ? Date.parse(row.updated_at) : payload.updatedAt ?? null

  return {
    ...payload,
    id,
    projectId,
    title: payload.title ?? row.title ?? 'Untitled',
    description: payload.description ?? row.description ?? '',
    assignee: payload.assignee ?? row.assignee ?? '',
    status: payload.status ?? row.status ?? 'todo',
    priority: payload.priority ?? row.priority ?? 'must',
    itemType: payload.itemType ?? row.item_type ?? 'task',
    backlogState: payload.backlogState ?? row.backlog_state ?? 'new',
    storyPoints: payload.storyPoints ?? row.story_points ?? 0,
    sprintId: payload.sprintId ?? row.sprint_id ?? null,
    sprintNumber: payload.sprintNumber ?? row.sprint_number ?? null,
    sprintCommittedAt: payload.sprintCommittedAt ?? row.sprint_committed_at ?? null,
    calendarType: payload.calendarType ?? row.calendar_type ?? 'general',
    calendarId: payload.calendarId ?? row.calendar_id ?? 'general',
    teamId: payload.teamId ?? row.team_id ?? null,
    ownerUserId: payload.ownerUserId ?? row.owner_user_id ?? null,
    createdAt: payload.createdAt ?? createdAt ?? Date.now(),
    updatedAt: payload.updatedAt ?? updatedAt ?? Date.now(),
  }
}

export async function fetchRemoteProjectTasks(projectId) {
  try {
    if (!projectId) return []
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: true })
    if (error) {
      console.error('[TaskRemoteStorage] fetchRemoteProjectTasks error', error)
      return []
    }
    return (Array.isArray(data) ? data : []).map(mapRemoteTask).filter(Boolean)
  } catch (err) {
    console.error('[TaskRemoteStorage] fetchRemoteProjectTasks exception', err)
    return []
  }
}

export async function upsertRemoteTasks(tasks, userId) {
  try {
    const list = Array.isArray(tasks) ? tasks : []
    const rows = list
      .filter(isSharedProjectTask)
      .map((t) => normalizeTaskForRemote(t, userId))
      .filter(Boolean)
    if (rows.length === 0) return
    const { error } = await supabase.from('tasks').upsert(rows, { onConflict: 'id' })
    if (error) console.error('[TaskRemoteStorage] upsertRemoteTasks error', error)
  } catch (err) {
    console.error('[TaskRemoteStorage] upsertRemoteTasks exception', err)
  }
}

export async function deleteRemoteTask(taskId, projectId) {
  try {
    if (!taskId || !projectId) return
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId)
      .eq('project_id', projectId)
    if (error) console.error('[TaskRemoteStorage] deleteRemoteTask error', error)
  } catch (err) {
    console.error('[TaskRemoteStorage] deleteRemoteTask exception', err)
  }
}

