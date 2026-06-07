import { supabase } from './supabase.js'

/**
 * Remote sync for the Activity Log. Mirrors `taskRemoteStorage.js`: project-scoped,
 * RLS-gated by project_members. Every function is wrapped so logging can NEVER
 * throw or block the UI.
 */

/** Map a local log object to the `activity_logs` row shape. Returns null when not project-scoped. */
export function mapLogToRemote(log) {
  if (!log || !log.projectId) return null
  return {
    id: log.id,
    project_id: log.projectId,
    user_id: log.userId ?? null,
    user_name: log.userName ?? null,
    action: log.action,
    category: log.category ?? 'system',
    severity: log.severity ?? 'info',
    message: log.message ?? null,
    entity_type: log.entityType ?? null,
    entity_id: log.entityId ?? null,
    entity_name: log.entityName ?? null,
    metadata: log.metadata ?? null,
  }
}

/** Map a Supabase `activity_logs` row back to the local log shape. */
export function mapRemoteToLog(row) {
  if (!row) return null
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    userId: row.user_id ?? null,
    userName: row.user_name ?? '',
    action: row.action,
    category: row.category ?? 'system',
    severity: row.severity ?? 'info',
    message: row.message ?? '',
    entityType: row.entity_type ?? null,
    entityId: row.entity_id ?? null,
    entityName: row.entity_name ?? '',
    metadata: row.metadata ?? null,
    timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  }
}

/** Fire-and-forget insert of a project-scoped log. No-op (and never throws) without a projectId. */
export async function insertRemoteLog(log) {
  try {
    if (!log || !log.projectId) return
    const row = mapLogToRemote(log)
    if (!row) return
    const { error } = await supabase.from('activity_logs').insert(row)
    if (error) console.error('[LogRemoteStorage] insertRemoteLog error', error)
  } catch (err) {
    console.error('[LogRemoteStorage] insertRemoteLog exception', err)
  }
}

/** Fetch the project's shared logs, newest-first. Returns [] on any error or missing projectId. */
export async function fetchRemoteLogs(projectId, { limit = 500 } = {}) {
  try {
    if (!projectId) return []
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) {
      console.error('[LogRemoteStorage] fetchRemoteLogs error', error)
      return []
    }
    return (Array.isArray(data) ? data : []).map(mapRemoteToLog).filter(Boolean)
  } catch (err) {
    console.error('[LogRemoteStorage] fetchRemoteLogs exception', err)
    return []
  }
}

/** Project IDs the user is a member of. Used to fan auth logs out to each project. Never throws. */
export async function fetchUserMemberProjectIds(userId) {
  if (!userId) return []
  try {
    const { data, error } = await supabase
      .from('project_members')
      .select('project_id')
      .eq('user_id', userId)
    if (error) return []
    return (data || []).map((r) => r.project_id).filter(Boolean)
  } catch {
    return []
  }
}

/** Delete every shared log row for a project (used by "Clear all"). Never throws. */
export async function deleteRemoteLogsForProject(projectId) {
  try {
    if (!projectId) return
    const { error } = await supabase
      .from('activity_logs')
      .delete()
      .eq('project_id', projectId)
    if (error) console.error('[LogRemoteStorage] deleteRemoteLogsForProject error', error)
  } catch (err) {
    console.error('[LogRemoteStorage] deleteRemoteLogsForProject exception', err)
  }
}
