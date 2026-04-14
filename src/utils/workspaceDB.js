import { supabase } from './supabase.js'

function mapProjectFromMemberRow(row) {
  const p = row.projects
  if (!p) return null
  return {
    ...p,
    ownerId: p.owner_id,
    description: p.description ?? '',
    role: row.role,
    teamIds: [],
    isShared: row.role !== 'owner',
  }
}

// ─── PROJECTS ───

export async function fetchMyProjects(userId) {
  const { data, error } = await supabase
    .from('project_members')
    .select('project_id, role, projects(*)')
    .eq('user_id', userId)

  if (error) {
    console.error('[WorkspaceDB] fetchMyProjects error:', error)
    return []
  }

  return (data || []).map(mapProjectFromMemberRow).filter(Boolean)
}

export async function createProject(project, userId, userEmail) {
  const { error: projError } = await supabase.from('projects').insert({
    id: project.id,
    name: project.name,
    color: project.color,
    description: project.description || null,
    owner_id: userId,
  })

  if (projError) throw projError

  const { error: memberError } = await supabase.from('project_members').insert({
    project_id: project.id,
    user_id: userId,
    user_email: userEmail,
    role: 'owner',
  })

  if (memberError) throw memberError
  return project
}

export async function deleteProject(projectId, userId) {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)
    .eq('owner_id', userId)

  if (error) throw error
}

export async function leaveProject(projectId, userId) {
  const { error } = await supabase
    .from('project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId)

  if (error) throw error
}

export async function joinProjectAsMember(projectId, userId, userEmail, role = 'member') {
  const { error } = await supabase.from('project_members').insert({
    project_id: projectId,
    user_id: userId,
    user_email: userEmail,
    role,
  })

  if (error) throw error
}

export async function updateProject(project, userId) {
  const { error } = await supabase
    .from('projects')
    .update({
      name: project.name,
      color: project.color,
      description: project.description || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', project.id)
    .eq('owner_id', userId)

  if (error) throw error
}

export async function assignTeamToProject(projectId, teamId) {
  const { error } = await supabase
    .from('project_teams')
    .upsert({ project_id: projectId, team_id: teamId })

  if (error) throw error

  const { data: members, error: membersError } = await supabase
    .from('team_members')
    .select('user_id, user_email, display_name')
    .eq('team_id', teamId)

  if (membersError || !members) return

  for (const member of members) {
    if (!member.user_id) continue
    const { error: pmError } = await supabase.from('project_members').upsert(
      {
        project_id: projectId,
        user_id: member.user_id,
        user_email: member.user_email,
        role: 'member',
      },
      { onConflict: 'project_id,user_id' },
    )

    if (pmError)
      console.error('[WorkspaceDB] failed to add member to project:', pmError)
  }

  console.log('[WorkspaceDB] assigned team to project and added members')
}

export async function removeTeamFromProject(projectId, teamId) {
  const { error } = await supabase
    .from('project_teams')
    .delete()
    .eq('project_id', projectId)
    .eq('team_id', teamId)

  if (error) throw error

  const { data: remainingTeams } = await supabase
    .from('project_teams')
    .select('team_id')
    .eq('project_id', projectId)

  const remainingTeamIds = (remainingTeams || []).map((r) => r.team_id)

  const { data: removedMembers } = await supabase
    .from('team_members')
    .select('user_id')
    .eq('team_id', teamId)

  if (!removedMembers) return

  for (const member of removedMembers) {
    if (!member.user_id) continue

    if (remainingTeamIds.length > 0) {
      const { data: stillInTeam } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('user_id', member.user_id)
        .in('team_id', remainingTeamIds)

      if (stillInTeam && stillInTeam.length > 0) continue
    }

    await supabase
      .from('project_members')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', member.user_id)
      .neq('role', 'owner')
  }
}

export async function fetchProjectTeams(projectId) {
  const { data, error } = await supabase
    .from('project_teams')
    .select('team_id')
    .eq('project_id', projectId)

  if (error) return []
  return (data || []).map((row) => row.team_id)
}

// ─── TEAMS ───

export async function fetchMyTeams(userId) {
  const { data, error } = await supabase
    .from('team_members')
    .select('team_id, teams(*)')
    .eq('user_id', userId)

  if (error) {
    console.error('[WorkspaceDB] fetchMyTeams error:', error)
    return []
  }

  return (data || []).map((row) => {
    const t = row.teams
    if (!t) return null
    return {
      ...t,
      ownerId: t.owner_id,
      members: [],
    }
  }).filter(Boolean)
}

export async function fetchTeamMembers(teamId) {
  const { data, error } = await supabase
    .from('team_members')
    .select('user_email, display_name')
    .eq('team_id', teamId)

  if (error) return []
  return (data || []).map((row) => row.display_name || row.user_email.split('@')[0])
}

export async function createTeam(team, userId, userEmail) {
  const { error: teamError } = await supabase.from('teams').insert({
    id: team.id,
    name: team.name,
    color: team.color,
    owner_id: userId,
  })

  if (teamError) throw teamError

  const { error: memberError } = await supabase.from('team_members').insert({
    team_id: team.id,
    user_id: userId,
    user_email: userEmail,
    display_name: userEmail.split('@')[0],
  })

  if (memberError) throw memberError
  return team
}

export async function deleteTeam(teamId, userId) {
  const { error } = await supabase
    .from('teams')
    .delete()
    .eq('id', teamId)
    .eq('owner_id', userId)

  if (error) throw error
}

export async function leaveTeam(teamId, userId) {
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId)

  if (error) throw error
}

export async function joinTeamAsMember(teamId, userId, userEmail) {
  const { error } = await supabase.from('team_members').insert({
    team_id: teamId,
    user_id: userId,
    user_email: userEmail,
    display_name: userEmail.split('@')[0],
  })

  if (error) throw error
}

export async function updateTeamRecord(teamId, { name }, userId) {
  const { error } = await supabase
    .from('teams')
    .update({
      name,
      updated_at: new Date().toISOString(),
    })
    .eq('id', teamId)
    .eq('owner_id', userId)

  if (error) throw error
}

/** Client-safe: invitee row until they sign up (user_id may be null). */
export async function addMemberToTeam(teamId, userEmail, displayName) {
  const { error } = await supabase.from('team_members').insert({
    team_id: teamId,
    user_id: null,
    user_email: userEmail,
    display_name: displayName || userEmail.split('@')[0],
  })

  if (error) throw error
}

export function subscribeToMyProjects(userId, onUpdate) {
  const channel = supabase
    .channel('my-projects:' + userId)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'project_members',
        filter: `user_id=eq.${userId}`,
      },
      () => {
        onUpdate()
      },
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'projects',
      },
      () => {
        onUpdate()
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

export function subscribeToMyTeams(userId, onUpdate) {
  const channel = supabase
    .channel('my-teams:' + userId)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'team_members',
        filter: `user_id=eq.${userId}`,
      },
      () => {
        onUpdate()
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}
