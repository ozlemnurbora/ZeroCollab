import { supabase } from './supabase.js'

export async function sendProjectInvitation(projectId, projectName, inviterEmail, inviteeEmail) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('project_invitations')
    .insert({
      project_id: projectId,
      project_name: projectName,
      inviter_id: user.id,
      inviter_email: inviterEmail,
      invitee_email: inviteeEmail,
      status: 'pending'
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getMyInvitations() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('project_invitations')
    .select('*')
    .eq('invitee_email', user.email)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[Invitations] error fetching:', error)
    return []
  }
  return data || []
}

export async function respondToInvitation(invitationId, status) {
  const { error } = await supabase
    .from('project_invitations')
    .update({ status })
    .eq('id', invitationId)

  if (error) throw error
}

export function subscribeToInvitations(userEmail, onInvitation) {
  const channel = supabase
    .channel('invitations:' + userEmail)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'project_invitations',
        filter: `invitee_email=eq.${userEmail}`
      },
      (payload) => {
        console.log('[Invitations] new invitation received:', payload.new)
        onInvitation(payload.new)
      }
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}
