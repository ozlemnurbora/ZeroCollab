import { supabase } from './supabase.js'

function buildPairingCode() {
  const digits = Math.floor(100000 + Math.random() * 900000)
  return `ZC-${digits}`
}

function normalizePairingCode(code) {
  return (code || '').toString().trim().toUpperCase().replace(/\s+/g, '')
}

async function addUserToTeamLinkedProjects(teamId, user) {
  const { data: projectTeams, error: projectTeamsError } = await supabase
    .from('project_teams')
    .select('project_id')
    .eq('team_id', teamId)

  if (projectTeamsError) throw projectTeamsError
  if (!projectTeams || projectTeams.length === 0) return

  for (const pt of projectTeams) {
    const { data: existingPm, error: pmSelErr } = await supabase
      .from('project_members')
      .select('role, member_source')
      .eq('project_id', pt.project_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (pmSelErr) {
      console.error('[InvitationManager] project_members lookup:', pmSelErr)
      continue
    }
    if (existingPm?.role === 'owner') continue
    if (existingPm?.member_source === 'direct') continue

    const { error: pmError } = await supabase.from('project_members').upsert(
      {
        project_id: pt.project_id,
        user_id: user.id,
        user_email: user.email,
        role: 'member',
        member_source: 'team',
      },
      { onConflict: 'project_id,user_id' },
    )

    if (pmError) {
      console.error('[InvitationManager] project member insert error:', pmError)
    }
  }
}

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

export async function getTeamMembers(teamIds) {
  if (!teamIds || teamIds.length === 0) return []

  const { data, error } = await supabase
    .from('team_invitations')
    .select('team_id, invitee_email, inviter_email')
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

export async function generateTeamPairingCode(teamId) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  if (!teamId) throw new Error('Team ID is required')

  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('owner_id')
    .eq('id', teamId)
    .single()

  if (teamError) throw teamError
  if (!team || team.owner_id !== user.id) {
    throw new Error('Only the team owner can generate pairing code.')
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  let attempts = 0
  while (attempts < 5) {
    attempts += 1
    const code = buildPairingCode()
    const { error } = await supabase.from('team_pairing_codes').insert({
      team_id: teamId,
      code,
      created_by: user.id,
      expires_at: expiresAt,
    })

    if (!error) return code
    if (error?.code !== '23505') throw error
  }

  throw new Error('Could not generate a unique pairing code. Please try again.')
}

export async function getTeamPairingCode(teamId) {
  if (!teamId) return null

  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('team_pairing_codes')
    .select('code, expires_at, created_at')
    .eq('team_id', teamId)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data || null
}

export async function joinTeamWithCode(rawCode) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const code = normalizePairingCode(rawCode)
  if (!code) throw new Error('Please enter a valid pairing code.')

  const nowIso = new Date().toISOString()
  const { data: pairingRow, error: pairingError } = await supabase
    .from('team_pairing_codes')
    .select('team_id, code, expires_at')
    .eq('code', code)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (pairingError) throw pairingError
  if (!pairingRow) {
    throw new Error('Pairing code is invalid or expired.')
  }

  const { error: teamMemberError } = await supabase.from('team_members').upsert(
    {
      team_id: pairingRow.team_id,
      user_id: user.id,
      user_email: user.email,
      display_name: user.email ? user.email.split('@')[0] : 'member',
    },
    { onConflict: 'team_id,user_id' },
  )

  if (teamMemberError) throw teamMemberError

  await addUserToTeamLinkedProjects(pairingRow.team_id, user)
  return { teamId: pairingRow.team_id, code: pairingRow.code }
}
