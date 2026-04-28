import { supabase } from './supabase.js'

function mapProjectFromMemberRow(row) {
  const p = row.projects
  if (!p) return null
  // From project_members.member_source: 'owner' | 'direct' | 'team'
  const memberSource =
    row.member_source ??
    (row.role === 'owner' ? 'owner' : 'team')
  return {
    ...p,
    ownerId: p.owner_id,
    description: p.description ?? '',
    goal: p.goal ?? '',
    phase: p.phase ?? 'planning',
    status: p.status ?? 'active',
    startDate: p.start_date ?? '',
    targetEndDate: p.target_end_date ?? '',
    role: row.role,
    memberSource,
    teamIds: [],
    isShared: row.role !== 'owner',
  }
}

// ─── PROJECTS ───

export async function fetchMyProjects(userId) {
  const { data, error } = await supabase
    .from('project_members')
    .select('project_id, role, member_source, projects(*)')
    .eq('user_id', userId)

  if (error) {
    console.error('[WorkspaceDB] fetchMyProjects error:', error)
    return []
  }

  return (data || []).map(mapProjectFromMemberRow).filter(Boolean)
}

export async function fetchProjectMembers(projectId) {
  const { data, error } = await supabase
    .from('project_members')
    .select('user_id, user_email, role, member_source, custom_role')
    .eq('project_id', projectId)

  if (error) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('project_members')
      .select('user_id, user_email, role, member_source')
      .eq('project_id', projectId)
    if (fallbackError) {
      console.error('[WorkspaceDB] fetchProjectMembers error:', fallbackError)
      return []
    }
    return (fallbackData || []).map((row) => ({
      userId: row.user_id,
      email: row.user_email,
      name: row.user_email ? row.user_email.split('@')[0] : 'Unknown',
      role: row.role,
      memberSource: row.member_source,
      customRole: null,
    }))
  }

  return (data || []).map((row) => ({
    userId: row.user_id,
    email: row.user_email,
    name: row.user_email ? row.user_email.split('@')[0] : 'Unknown',
    role: row.role,
    memberSource: row.member_source,
    customRole: row.custom_role ?? null,
  }))
}

export async function createProject(project, userId, userEmail) {
  const { error: projError } = await supabase.from('projects').insert({
    id: project.id,
    name: project.name,
    color: project.color,
    description: project.description || null,
    goal: project.goal || null,
    phase: project.phase || 'planning',
    status: project.status || 'active',
    start_date: project.startDate || null,
    target_end_date: project.targetEndDate || null,
    owner_id: userId,
  })

  if (projError) throw projError

  const { error: memberError } = await supabase.from('project_members').insert({
    project_id: project.id,
    user_id: userId,
    user_email: userEmail,
    role: 'owner',
    member_source: 'owner',
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
  const { data: existing, error: selError } = await supabase
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()

  if (selError) throw selError
  if (existing?.role === 'owner') return

  const { error } = await supabase.from('project_members').upsert(
    {
      project_id: projectId,
      user_id: userId,
      user_email: userEmail,
      role: role || 'member',
      member_source: 'direct',
    },
    { onConflict: 'project_id,user_id' },
  )

  if (error) throw error
}

export async function updateProject(project, userId) {
  const { error } = await supabase
    .from('projects')
    .update({
      name: project.name,
      color: project.color,
      description: project.description || null,
      goal: project.goal || null,
      phase: project.phase || 'planning',
      status: project.status || 'active',
      start_date: project.startDate || null,
      target_end_date: project.targetEndDate || null,
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

    const { data: existing, error: exError } = await supabase
      .from('project_members')
      .select('role, member_source')
      .eq('project_id', projectId)
      .eq('user_id', member.user_id)
      .maybeSingle()

    if (exError) {
      console.error('[WorkspaceDB] project_members lookup failed:', exError)
      continue
    }
    if (existing?.role === 'owner') continue
    if (existing?.member_source === 'direct') continue

    const { error: pmError } = await supabase.from('project_members').upsert(
      {
        project_id: projectId,
        user_id: member.user_id,
        user_email: member.user_email,
        role: 'member',
        member_source: 'team',
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

// ─── SPRINTS ───

function createSprintId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `sprint_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function toIsoDate(d) {
  return d.toISOString().slice(0, 10)
}

export async function fetchProjectSprints(projectId) {
  if (!projectId) return []
  const { data, error } = await supabase
    .from('sprints')
    .select('*')
    .eq('project_id', projectId)
    .order('sprint_number', { ascending: false })

  if (error) throw error
  return data || []
}

export async function getActiveSprint(projectId) {
  if (!projectId) return null
  const { data, error } = await supabase
    .from('sprints')
    .select('*')
    .eq('project_id', projectId)
    .eq('status', 'active')
    .order('sprint_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data || null
}

export async function createSprint(projectId, durationWeeks, sprintGoal, createdBy) {
  if (!projectId) throw new Error('Project is required for sprint creation.')
  const duration = Number(durationWeeks || 0)
  if (!Number.isFinite(duration) || duration < 1) {
    throw new Error('Sprint duration must be at least 1 week.')
  }

  const active = await getActiveSprint(projectId)
  if (active) {
    throw new Error('Only one active sprint is allowed per project.')
  }

  const { data: latest, error: latestError } = await supabase
    .from('sprints')
    .select('sprint_number')
    .eq('project_id', projectId)
    .order('sprint_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestError) throw latestError

  const sprintNumber = (latest?.sprint_number || 0) + 1
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + duration * 7)

  const payload = {
    id: createSprintId(),
    project_id: projectId,
    sprint_number: sprintNumber,
    duration_weeks: duration,
    start_date: toIsoDate(start),
    end_date: toIsoDate(end),
    sprint_goal: sprintGoal || null,
    status: 'active',
    created_by: createdBy || null,
  }

  const { data, error } = await supabase
    .from('sprints')
    .insert(payload)
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function completeSprint(sprintId) {
  if (!sprintId) throw new Error('Sprint id is required.')
  const { data, error } = await supabase
    .from('sprints')
    .update({ status: 'completed' })
    .eq('id', sprintId)
    .select('*')
    .maybeSingle()

  if (error) throw error
  return data || null
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
    .select('user_id, user_email, display_name, custom_role')
    .eq('team_id', teamId)

  if (error) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('team_members')
      .select('user_id, user_email, display_name')
      .eq('team_id', teamId)
    if (fallbackError) return []
    return (fallbackData || []).map((row) => ({
      userId: row.user_id,
      email: row.user_email,
      name: row.display_name || row.user_email.split('@')[0],
      customRole: null,
    }))
  }
  return (data || []).map((row) => ({
    userId: row.user_id,
    email: row.user_email,
    name: row.display_name || row.user_email.split('@')[0],
    customRole: row.custom_role || null,
  }))
}

export async function updateTeamMemberRole(teamId, userId, customRole) {
  const { data, error } = await supabase
    .from('team_members')
    .update({ custom_role: customRole })
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .select('user_id')

  if (error) throw error
  if (!data || data.length === 0) {
    console.warn(
      `[WorkspaceDB] updateTeamMemberRole updated 0 rows for team_id=${teamId}, user_id=${userId}`,
    )
  }
}

export async function removeMemberFromTeam(teamId, targetUserId, currentUserId) {
  // verify current user is the owner
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('owner_id')
    .eq('id', teamId)
    .single()

  if (teamError) throw teamError
  if (!team || team.owner_id !== currentUserId) {
    throw new Error('Only the team owner can remove members')
  }

  if (targetUserId === currentUserId) {
    throw new Error('Owner cannot remove themselves with removeMemberFromTeam')
  }

  // find all projects linked to this team
  const { data: projectTeams, error: ptError } = await supabase
    .from('project_teams')
    .select('project_id')
    .eq('team_id', teamId)

  if (ptError) throw ptError

  // remove from team_members
  const { error: removeError } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', targetUserId)

  if (removeError) throw removeError

  // for each related project, remove the user from project_members
  // only if they are not still included through another assigned team
  const projectIds = (projectTeams || []).map((pt) => pt.project_id)

  for (const projectId of projectIds) {
    const { data: otherTeams, error: otherTeamsError } = await supabase
      .from('project_teams')
      .select('team_id')
      .eq('project_id', projectId)
      .neq('team_id', teamId)

    if (otherTeamsError) throw otherTeamsError

    const otherTeamIds = (otherTeams || []).map((t) => t.team_id)

    let stillInProject = false
    if (otherTeamIds.length > 0) {
      const { data: stillInOtherTeam, error: stillError } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('user_id', targetUserId)
        .in('team_id', otherTeamIds)

      if (stillError) throw stillError
      if (stillInOtherTeam && stillInOtherTeam.length > 0) {
        stillInProject = true
      }
    }

    if (!stillInProject) {
      const { error: projectRemoveError } = await supabase
        .from('project_members')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', targetUserId)
        .neq('role', 'owner')

      if (projectRemoveError) throw projectRemoveError
    }
  }
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
  const { data: projectTeams } = await supabase
    .from('project_teams')
    .select('project_id')
    .eq('team_id', teamId)

  const projectIds = (projectTeams || []).map((pt) => pt.project_id)

  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId)

  if (error) throw error

  for (const projectId of projectIds) {
    const { data: otherTeams } = await supabase
      .from('project_teams')
      .select('team_id')
      .eq('project_id', projectId)
      .neq('team_id', teamId)

    const otherTeamIds = (otherTeams || []).map((t) => t.team_id)

    let stillInProject = false
    if (otherTeamIds.length > 0) {
      const { data: stillInTeam } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('user_id', userId)
        .in('team_id', otherTeamIds)

      if (stillInTeam && stillInTeam.length > 0) stillInProject = true
    }

    if (!stillInProject) {
      await supabase
        .from('project_members')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .neq('role', 'owner')
    }
  }

  console.log('[WorkspaceDB] left team and removed from related projects')
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
        console.log('[WorkspaceDB] project_members changed, reloading projects')
        onUpdate()
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'projects',
      },
      () => {
        console.log('[WorkspaceDB] project deleted, reloading projects')
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
        console.log('[WorkspaceDB] team_members changed, reloading teams')
        onUpdate()
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}
