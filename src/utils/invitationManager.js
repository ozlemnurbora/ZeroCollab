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

export async function sendTeamInvitation(teamId, teamName, projectId, projectName, inviterEmail, inviteeEmail) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('team_invitations')
    .insert({
      team_id: teamId,
      team_name: teamName,
      project_id: projectId || null,
      project_name: projectName || null,
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

export async function getMyTeamInvitations() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('team_invitations')
    .select('*')
    .eq('invitee_email', user.email)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[TeamInvitations] error fetching:', error)
    return []
  }
  return data || []
}

export async function respondToTeamInvitation(invitationId, status) {
  const { error } = await supabase
    .from('team_invitations')
    .update({ status })
    .eq('id', invitationId)

  if (error) throw error
}

export function subscribeToTeamInvitations(userEmail, onInvitation) {
  const channel = supabase
    .channel('team-invitations:' + userEmail)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'team_invitations',
        filter: `invitee_email=eq.${userEmail}`
      },
      (payload) => {
        console.log('[TeamInvitations] new invitation received:', payload.new)
        onInvitation(payload.new)
      }
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}

export async function getAcceptedTeamInvitations(teamIds) {
  if (!teamIds || teamIds.length === 0) return []

  const { data, error } = await supabase
    .from('team_invitations')
    .select('*')
    .in('team_id', teamIds)
    .eq('status', 'accepted')

  if (error) return []
  return data || []
}

export function subscribeToTeamMemberChanges(teamIds, onMemberAccepted) {
  if (!teamIds || teamIds.length === 0) return () => {}

  const channel = supabase
    .channel('team-members-changes')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'team_invitations',
        filter: `status=eq.accepted`
      },
      (payload) => {
        if (teamIds.includes(payload.new.team_id)) {
          console.log('[TeamSync] member accepted invitation:', payload.new)
          onMemberAccepted(payload.new)
        }
      }
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}
