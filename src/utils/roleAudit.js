import { supabase } from './supabase.js'

export async function logRoleChange({
  entityType,
  entityId,
  targetUserId = null,
  changedBy,
  oldRole = null,
  newRole = null,
}) {
  if (!entityType || !entityId || !changedBy) return

  const { error } = await supabase.from('role_audit_logs').insert({
    entity_type: entityType,
    entity_id: entityId,
    target_user_id: targetUserId,
    changed_by: changedBy,
    old_role: oldRole,
    new_role: newRole,
  })

  if (error) {
    console.warn('[RoleAudit] skipped role change log:', error?.message || error)
  }
}
