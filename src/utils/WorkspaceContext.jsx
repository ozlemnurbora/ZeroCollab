import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react'
import { useAuth } from './AuthContext.jsx'
import { connectToProjectHub, disconnectFromProjectHub } from './appHub.js'
import { pruneSharedTasksByProjectIds } from '../components/kanban/taskStorage.js'
import { pruneMeetingsByProjectIds } from './meetingStorage.js'
import { isAdminRole, normalizeProjectRole } from './roleOntology.js'
import { addLogEntry } from './logService.js'
import {
  canCreateProject,
  getProjectLimit,
  syncProjectsQuotaFromWorkspaceCount,
} from './tokenEconomics/quotaGuardService.js'
import {
  fetchMyProjects,
  fetchMyTeams,
  fetchProjectTeams,
  fetchProjectMembers,
  fetchTeamMembers,
  removeMemberFromTeam,
  createProject,
  deleteProject as dbDeleteProject,
  leaveProject as dbLeaveProject,
  updateProject as dbUpdateProject,
  updateProjectOverview as dbUpdateProjectOverview,
  createTeam,
  deleteTeam as dbDeleteTeam,
  assignTeamToProject,
  removeTeamFromProject,
  removeDirectProjectMember as dbRemoveDirectProjectMember,
  subscribeToMyProjects,
  subscribeToMyTeams,
  updateTeamRecord,
  updateTeamMemberRole as dbUpdateTeamMemberRole,
  fetchProjectSprints,
  getActiveSprint,
  createSprint as dbCreateSprint,
  completeSprint as dbCompleteSprint,
  updateProjectSprint as dbUpdateProjectSprint,
} from './workspaceDB.js'

const WorkspaceContext = createContext(null)

async function migrateLocalToSupabase(user) {
  const key = `zc-workspace-db-migrated:${user.id}`
  if (localStorage.getItem(key)) return

  let localProjects = []
  let localTeams = []
  try {
    localProjects = JSON.parse(localStorage.getItem('zc-projects') || '[]')
  } catch {
    localProjects = []
  }
  try {
    localTeams = JSON.parse(localStorage.getItem('zc-teams') || '[]')
  } catch {
    localTeams = []
  }

  const remoteProjects = await fetchMyProjects(user.id)
  const remoteProjectIds = new Set(remoteProjects.map((p) => p.id))

  const remoteTeamsExisting = await fetchMyTeams(user.id)
  const remoteTeamIds = new Set(remoteTeamsExisting.map((x) => x.id))

  for (const t of localTeams) {
    if (!t?.id || remoteTeamIds.has(t.id)) continue
    const ownerOk = !t.ownerId || t.ownerId === user.id
    if (!ownerOk) continue
    try {
      await createTeam(
        {
          id: t.id,
          name: t.name || 'Team',
          color: t.color || 'bg-pink-500',
        },
        user.id,
        user.email,
      )
      remoteTeamIds.add(t.id)
    } catch (e) {
      console.warn('[WorkspaceContext] migrate team skipped:', t.id, e)
    }
  }

  for (const p of localProjects) {
    if (!p?.id || remoteProjectIds.has(p.id)) continue
    const ownerOk =
      !p.ownerId || p.ownerId === user.id || (!p.isShared && !p.ownerId)
    if (!ownerOk) continue
    try {
      await createProject(
        {
          id: p.id,
          name: p.name || 'Untitled',
          color: p.color || 'bg-indigo-500',
          description: p.description || '',
        },
        user.id,
        user.email,
      )
      remoteProjectIds.add(p.id)
      const teamIds = p.teamIds || []
      for (const tid of teamIds) {
        if (!remoteTeamIds.has(tid)) continue
        try {
          await assignTeamToProject(p.id, tid)
        } catch (e) {
          console.warn('[WorkspaceContext] migrate project_teams skipped:', e)
        }
      }
    } catch (e) {
      console.warn('[WorkspaceContext] migrate project skipped:', p.id, e)
    }
  }

  localStorage.setItem(key, '1')
}

export function WorkspaceProvider({ children }) {
  const { user } = useAuth()
  const [projects, setProjects] = useState(() => {
    try { return JSON.parse(localStorage.getItem('zc-projects-cache') || '[]') } catch { return [] }
  })
  const [teams, setTeams] = useState(() => {
    try { return JSON.parse(localStorage.getItem('zc-teams-cache') || '[]') } catch { return [] }
  })
  const [activeProject, setActiveProjectState] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('zc-active-project') || 'null')
    } catch {
      return null
    }
  })
  const [activeTeam, setActiveTeamState] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('zc-active-team') || 'null')
    } catch {
      return null
    }
  })
  const [projectSprints, setProjectSprints] = useState([])
  const [activeSprint, setActiveSprint] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  const projectsRef = useRef(projects)
  const teamsRef = useRef(teams)
  const activeProjectRef = useRef(activeProject)
  const activeTeamRef = useRef(activeTeam)
  const memberProjectIdsRef = useRef(new Set())

  useEffect(() => {
    projectsRef.current = projects
    teamsRef.current = teams
    activeProjectRef.current = activeProject
    activeTeamRef.current = activeTeam
  }, [projects, teams, activeProject, activeTeam])

  useEffect(() => {
    // Logout clears `projects` to []. That must not be interpreted as losing every membership.
    if (!user) {
      memberProjectIdsRef.current = new Set()
      return
    }

    const currentIds = new Set(projects.map((project) => project.id))
    const removedIds = [...memberProjectIdsRef.current].filter((id) => !currentIds.has(id))
    memberProjectIdsRef.current = currentIds
    if (removedIds.length === 0) return
    void pruneSharedTasksByProjectIds(removedIds, user.id)
    void pruneMeetingsByProjectIds(removedIds, user.id)
  }, [projects, user])

  const loadProjects = useCallback(async () => {
    if (!user) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    try {
      const myProjects = await fetchMyProjects(user.id)
      const projectsWithTeams = await Promise.all(
        myProjects.map(async (p) => {
          const [teamIds, projectMembers] = await Promise.all([
            fetchProjectTeams(p.id),
            fetchProjectMembers(p.id),
          ])
          return { ...p, teamIds, projectMembers }
        }),
      )
      setProjects(projectsWithTeams)
      try { localStorage.setItem('zc-projects-cache', JSON.stringify(projectsWithTeams)) } catch {}

      setActiveProjectState((prev) => {
        if (!prev) {
          if (projectsWithTeams.length > 0) {
            const first = projectsWithTeams[0]
            localStorage.setItem('zc-active-project', JSON.stringify(first))
            return first
          }
          return null
        }
        const stillExists = projectsWithTeams.find((p) => p.id === prev.id)
        if (stillExists) {
          localStorage.setItem('zc-active-project', JSON.stringify(stillExists))
          return stillExists
        }
        if (projectsWithTeams.length > 0) {
          const first = projectsWithTeams[0]
          localStorage.setItem('zc-active-project', JSON.stringify(first))
          return first
        }
        localStorage.removeItem('zc-active-project')
        return null
      })
    } catch (err) {
      console.error('[WorkspaceContext] loadProjects error:', err)
    }
  }, [user])

  const loadTeams = useCallback(async () => {
    if (!user) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    try {
      const myTeams = await fetchMyTeams(user.id)
      const teamsWithMembers = await Promise.all(
        myTeams.map(async (t) => {
          const members = await fetchTeamMembers(t.id)
          return { ...t, members }
        }),
      )
      setTeams(teamsWithMembers)
      try { localStorage.setItem('zc-teams-cache', JSON.stringify(teamsWithMembers)) } catch {}
    } catch (err) {
      console.error('[WorkspaceContext] loadTeams error:', err)
    }
  }, [user])

  // Fallback: if we have projects but no active project (e.g. offline refresh where
  // loadProjects' auto-select is skipped), select the first project.
  useEffect(() => {
    if (activeProject) return
    if (!Array.isArray(projects) || projects.length === 0) return
    const first = projects[0]
    setActiveProjectState(first)
    try { localStorage.setItem('zc-active-project', JSON.stringify(first)) } catch {}
  }, [activeProject, projects])

  const loadProjectSprints = useCallback(async (projectId) => {
    if (!user || !projectId) {
      setProjectSprints([])
      setActiveSprint(null)
      return
    }
    try {
      const [all, active] = await Promise.all([
        fetchProjectSprints(projectId),
        getActiveSprint(projectId),
      ])
      setProjectSprints(Array.isArray(all) ? all : [])
      setActiveSprint(active || null)
    } catch (err) {
      console.error('[WorkspaceContext] loadProjectSprints error:', err)
      setProjectSprints([])
      setActiveSprint(null)
    }
  }, [user])

  useEffect(() => {
    if (!user) {
      // Offline / transient null user: do NOT wipe — keep cached projects & teams visible.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setIsLoading(false)
        return
      }
      const resetTimer = window.setTimeout(() => {
        setProjects([])
        setTeams([])
        localStorage.removeItem('zc-projects-cache')
        localStorage.removeItem('zc-teams-cache')
        setIsLoading(false)
      }, 0)
      return () => window.clearTimeout(resetTimer)
    }

    let cancelled = false
    const loadingTimer = window.setTimeout(() => {
      setIsLoading(true)
    }, 0)
    ;(async () => {
      await migrateLocalToSupabase(user)
      await Promise.all([loadProjects(), loadTeams()])
    })().finally(() => {
      if (!cancelled) {
        setIsLoading(false)
      }
    })

    const unsubProjects = subscribeToMyProjects(user.id, () => {
      void loadProjects()
    })
    const unsubTeams = subscribeToMyTeams(user.id, () => {
      void loadTeams()
    })

    return () => {
      cancelled = true
      window.clearTimeout(loadingTimer)
      unsubProjects()
      unsubTeams()
    }
  }, [user, loadProjects, loadTeams])

  useEffect(() => {
    if (!user) {
      localStorage.removeItem('zc-active-project')
      localStorage.removeItem('zc-active-team')
      const resetActiveTimer = window.setTimeout(() => {
        setActiveProjectState(null)
        setActiveTeamState(null)
      }, 0)
      return () => window.clearTimeout(resetActiveTimer)
    }
    return undefined
  }, [user])

  useEffect(() => {
    if (!user) {
      syncProjectsQuotaFromWorkspaceCount(0)
      return
    }
    const n = Array.isArray(projects) ? projects.length : 0
    syncProjectsQuotaFromWorkspaceCount(n)
  }, [projects, user])

  useEffect(() => {
    if (!activeProject || !user) {
      void disconnectFromProjectHub()
      return
    }
    void connectToProjectHub(activeProject.id, user.id, user.email)
  }, [activeProject, user])

  useEffect(() => {
    if (!activeProject?.id || !user) {
      setProjectSprints([])
      setActiveSprint(null)
      return
    }
    void loadProjectSprints(activeProject.id)
  }, [activeProject?.id, user, loadProjectSprints])

  useEffect(() => {
    const handleProjectDeleted = () => {
      void loadProjects()
    }
    window.addEventListener('hub:project-deleted', handleProjectDeleted)
    return () => window.removeEventListener('hub:project-deleted', handleProjectDeleted)
  }, [loadProjects])

  const selectProject = (project) => {
    setActiveProjectState(project)
    if (project == null) {
      localStorage.removeItem('zc-active-project')
    } else {
      localStorage.setItem('zc-active-project', JSON.stringify(project))
    }
  }

  const selectTeam = (team) => {
    setActiveTeamState(team)
    localStorage.setItem('zc-active-team', JSON.stringify(team))
  }

  const addProject = async (name, color) => {
    if (!user) return null
    // Use the live count of currently active/visible projects so deleting a
    // project actually frees a slot. There is no archived/deleted flag on
    // projects in this codebase — `removeProject` removes them from `projects`
    // outright — so `projects.length` is the active count.
    const activeProjectCount = Array.isArray(projects) ? projects.length : 0
    const projectLimit = getProjectLimit()
    console.log(
      '[Quota Enforcement] projects',
      activeProjectCount,
      'limit',
      projectLimit,
    )
    if (!canCreateProject(activeProjectCount)) {
      if (typeof window !== 'undefined') {
        window.alert(
          'Project quota reached for your current plan. Hold more ZC tokens to unlock a higher project limit.',
        )
      }
      return null
    }
    const newProject = {
      id: `proj_${Date.now()}`,
      name,
      color: color || 'bg-indigo-500',
      createdAt: Date.now(),
      teamIds: [],
      ownerId: user.id,
      role: 'owner',
      memberSource: 'owner',
    }
    await createProject(newProject, user.id, user.email)
    await loadProjects()
    void addLogEntry({
      action: 'project.created',
      category: 'project',
      severity: 'success',
      message: `Created project "${name}"`,
      userId: user?.id,
      userName: user?.email?.split('@')[0] || '',
      entityType: 'project',
      entityId: newProject.id,
      entityName: name,
    })
    return newProject
  }

  const removeProject = async (projectId) => {
    if (!user) return
    const project = projects.find((p) => p.id === projectId)
    if (!project) return

    const isProjOwner =
      project.owner_id === user.id || project.ownerId === user.id
    const memberSource =
      project.memberSource ??
      (project.role === 'owner' ? 'owner' : 'team')

    if (isProjOwner) {
      await dbDeleteProject(projectId, user.id)
      await pruneSharedTasksByProjectIds([projectId], user.id)
      await pruneMeetingsByProjectIds([projectId], user.id)
      // Real deletion. Kept as a local workspace event (no projectId) since the
      // project — and its shared log trail — is being removed.
      void addLogEntry({
        action: 'project.deleted',
        category: 'project',
        severity: 'warning',
        message: `Deleted project "${project.name || projectId}"`,
        userId: user?.id,
        userName: user?.email?.split('@')[0] || '',
        entityType: 'project',
        entityId: project.id,
        entityName: project.name || '',
      })
    } else if (memberSource === 'direct') {
      await dbLeaveProject(projectId, user.id)
      await pruneSharedTasksByProjectIds([projectId], user.id)
      await pruneMeetingsByProjectIds([projectId], user.id)
      // Member leaving — include projectId so remaining members see it shared.
      void addLogEntry({
        action: 'project.member_left',
        category: 'project',
        severity: 'info',
        message: `${user?.email?.split('@')[0] || 'A member'} left project "${project.name || projectId}"`,
        userId: user?.id,
        userName: user?.email?.split('@')[0] || '',
        projectId: project.id,
        projectName: project.name || '',
        entityType: 'project',
        entityId: project.id,
        entityName: project.name || '',
      })
    } else {
      console.warn(
        '[WorkspaceContext] removeProject blocked: only direct-invite members may leave',
        projectId,
      )
      return
    }

    if (activeProject?.id === projectId) {
      await disconnectFromProjectHub()
      const remaining = projects.filter((p) => p.id !== projectId)
      if (remaining.length > 0) {
        selectProject(remaining[0])
      } else {
        selectProject(null)
      }
    }

    await loadProjects()
  }

  const removeDirectProjectMember = async (projectId, targetUserId) => {
    if (!user || !projectId || !targetUserId) return false
    const project = projectsRef.current.find((p) => p.id === projectId)
    if (!project) return false

    const isProjOwner =
      project.owner_id === user.id || project.ownerId === user.id
    const currentMember =
      (project.projectMembers || []).find((m) => m?.userId === user.id) || null
    const normalizedRole = user.id === (project.owner_id || project.ownerId)
      ? 'project_admin'
      : normalizeProjectRole(
        currentMember?.role,
        currentMember?.memberSource,
        currentMember?.customRole,
      )
    const canManage =
      isProjOwner || isAdminRole(normalizedRole) || normalizedRole === 'project_manager'

    if (!canManage) {
      console.warn('[WorkspaceContext] removeDirectProjectMember blocked', {
        projectId,
        targetUserId,
      })
      return false
    }
    if (targetUserId === user.id) return false

    // Resolve project + member name BEFORE removal; after loadProjects the
    // member is gone from the list and can't be resolved.
    const proj = projectsRef.current.find((p) => p.id === projectId)
    const removedMember = (proj?.projectMembers || []).find(
      (m) => m?.userId === targetUserId,
    )
    const removedMemberName =
      (removedMember && (removedMember.name || removedMember.email)) || targetUserId

    try {
      await dbRemoveDirectProjectMember(projectId, targetUserId)
      await loadProjects()
      // Shared audit trail entry (carries projectId so all members see it).
      void addLogEntry({
        action: 'project.member_removed',
        category: 'project',
        severity: 'warning',
        message: `${removedMemberName} was removed from project "${proj?.name || projectId}"`,
        userId: user?.id,
        userName: user?.email?.split('@')[0] || '',
        projectId: projectId,
        projectName: proj?.name || '',
        entityType: 'project',
        entityId: projectId,
        entityName: proj?.name || '',
        metadata: { removedUserId: targetUserId, removedBy: 'admin' },
      })
      return true
    } catch (err) {
      console.error('[WorkspaceContext] removeDirectProjectMember error:', err)
      return false
    }
  }

  const updateProjects = async (updatedList) => {
    if (!user) return
    const prevById = new Map(projectsRef.current.map((p) => [p.id, p]))
    for (const project of updatedList) {
      const prev = prevById.get(project.id)
      const isOwner = project.owner_id === user.id || project.ownerId === user.id
      if (
        prev &&
        isOwner &&
        (prev.name !== project.name ||
          prev.description !== project.description ||
          prev.color !== project.color)
      ) {
        await dbUpdateProject(project, user.id)
      }
      if (project.teamIds) {
        const currentTeamIds = await fetchProjectTeams(project.id)
        const toAdd = project.teamIds.filter((id) => !currentTeamIds.includes(id))
        const toRemove = currentTeamIds.filter((id) => !project.teamIds.includes(id))
        for (const teamId of toAdd) {
          await assignTeamToProject(project.id, teamId)
          // Log only newly-assigned teams (not on every save).
          const team = teamsRef.current.find((tm) => tm.id === teamId)
          void addLogEntry({
            action: 'team.assigned',
            category: 'team',
            severity: 'info',
            message: `Assigned team "${team?.name || teamId}" to project "${project.name || project.id}"`,
            userId: user?.id,
            userName: user?.email?.split('@')[0] || '',
            projectId: project.id,
            projectName: project.name || '',
            entityType: 'team',
            entityId: teamId,
            entityName: team?.name || '',
          })
        }
        for (const teamId of toRemove) {
          await removeTeamFromProject(project.id, teamId)
          const team = teamsRef.current.find((tm) => tm.id === teamId)
          const teamName = team?.name || teamId
          void addLogEntry({
            action: 'team.unassigned',
            category: 'team',
            severity: 'warning',
            message: `Removed team "${teamName}" from project "${project.name || project.id}"`,
            userId: user?.id,
            userName: user?.email?.split('@')[0] || '',
            projectId: project.id,
            projectName: project.name || '',
            entityType: 'team',
            entityId: teamId,
            entityName: teamName,
          })
        }
      }
    }
    await loadProjects()
  }

  const updateProjectOverview = async (projectId, updates) => {
    if (!user || !projectId) return false
    const project = projectsRef.current.find((p) => p.id === projectId)
    if (!project) return false

    // STRICT: only project_manager can edit overview metadata (admins can't unless also manager).
    const currentMember =
      (project.projectMembers || []).find((m) => m?.userId === user.id) || null
    const isManager = currentMember?.customRole === 'project_manager'
    if (!isManager) return false

    try {
      await dbUpdateProjectOverview(projectId, updates || {})
      await loadProjects()
      return true
    } catch (err) {
      console.error('[WorkspaceContext] updateProjectOverview error:', err)
      return false
    }
  }

  const addTeam = async (name, color) => {
    if (!user) return null
    const newTeam = {
      id: `team_${Date.now()}`,
      name,
      color: color || 'bg-pink-500',
      createdAt: Date.now(),
      members: [user.email.split('@')[0]],
      ownerId: user.id,
    }
    await createTeam(newTeam, user.id, user.email)
    await loadTeams()
    void addLogEntry({
      action: 'team.created',
      category: 'team',
      severity: 'success',
      message: `Created team "${name}"`,
      userId: user?.id,
      userName: user?.email?.split('@')[0] || '',
      entityType: 'team',
      entityId: newTeam.id,
      entityName: name,
    })
    return newTeam
  }

  const removeTeam = async (teamId) => {
    if (!user) return
    const team = teamsRef.current.find((t) => t.id === teamId)
    if (!team) return

    const isTeamOwner = team.owner_id === user.id || team.ownerId === user.id
    if (!isTeamOwner) {
      console.warn(
        '[WorkspaceContext] removeTeam blocked: only team owner can delete team',
        teamId,
      )
      return
    }

    void addLogEntry({
      action: 'team.deleted',
      category: 'team',
      severity: 'warning',
      message: `Deleted team "${team.name || teamId}"`,
      userId: user?.id,
      userName: user?.email?.split('@')[0] || '',
      entityType: 'team',
      entityId: team.id,
      entityName: team.name || '',
    })

    await dbDeleteTeam(teamId, user.id)
    if (activeTeamRef.current?.id === teamId) {
      selectTeam(null)
    }
    await loadTeams()
    await loadProjects()
  }

  const updateTeams = async (updatedList) => {
    if (!user) return
    const prevById = new Map(teamsRef.current.map((t) => [t.id, t]))
    for (const t of updatedList) {
      const prev = prevById.get(t.id)
      const isOwner = t.owner_id === user.id || t.ownerId === user.id
      if (prev && isOwner && prev.name !== t.name) {
        await updateTeamRecord(t.id, { name: t.name }, user.id)
      }
    }
    await loadTeams()
  }

  const kickTeamMember = async (teamId, targetUserId) => {
    if (!user) return
    // Resolve a display name BEFORE removal — the member is gone afterward.
    const team = teamsRef.current.find((tm) => tm.id === teamId)
    const removedMember = (team?.members || []).find(
      (m) =>
        m &&
        typeof m === 'object' &&
        (m.userId === targetUserId || m.id === targetUserId),
    )
    const removedMemberName =
      (removedMember && (removedMember.name || removedMember.email)) || targetUserId
    await removeMemberFromTeam(teamId, targetUserId, user.id)
    await loadTeams()
    await loadProjects()
    // Log once per project this team is assigned to so each project's audit
    // trail records the removal. Fall back to the active project if none resolve.
    const affectedProjects = projectsRef.current.filter(
      (p) => Array.isArray(p.teamIds) && p.teamIds.includes(teamId),
    )
    const targets =
      affectedProjects.length > 0
        ? affectedProjects
        : activeProject?.id
          ? [activeProject]
          : []
    for (const proj of targets) {
      void addLogEntry({
        action: 'project.member_removed',
        category: 'project',
        severity: 'warning',
        message: `${removedMemberName} was removed from project "${proj.name}"`,
        userId: user?.id,
        userName: user?.email?.split('@')[0] || '',
        projectId: proj.id,
        projectName: proj.name || '',
        entityType: 'project',
        entityId: proj.id,
        entityName: proj.name || '',
        metadata: { removedUserId: targetUserId, teamId },
      })
    }
  }

  const updateTeamMemberRole = async (teamId, userId, customRole) => {
    if (!user) return
    await dbUpdateTeamMemberRole(teamId, userId, customRole)
    await loadTeams()
  }

  const createProjectSprint = async ({
    durationWeeks,
    sprintGoal,
    capacityPoints,
    capacity_points,
  }) => {
    if (!user || !activeProject?.id) return null
    const cap = capacityPoints ?? capacity_points ?? 0
    const created = await dbCreateSprint(
      activeProject.id,
      durationWeeks,
      sprintGoal,
      user.id,
      cap,
    )
    await loadProjectSprints(activeProject.id)
    if (created) {
      const sprintLabel = `Sprint #${created.sprint_number ?? created.sprintNumber ?? ''}`.trim()
      void addLogEntry({
        action: 'sprint.created',
        category: 'sprint',
        severity: 'success',
        message: `Created sprint "${sprintLabel}"`,
        userId: user?.id,
        userName: user?.email?.split('@')[0] || '',
        projectId: activeProject.id,
        projectName: activeProject.name || '',
        entityType: 'sprint',
        entityId: created.id,
        entityName: sprintLabel,
      })
    }
    return created
  }

  const completeProjectSprint = async (sprintId) => {
    if (!user || !activeProject?.id || !sprintId) return null
    const updated = await dbCompleteSprint(sprintId)
    await loadProjectSprints(activeProject.id)
    if (updated) {
      const sprintLabel = `Sprint #${updated.sprint_number ?? updated.sprintNumber ?? ''}`.trim()
      void addLogEntry({
        action: 'sprint.completed',
        category: 'sprint',
        severity: 'info',
        message: `Completed sprint "${sprintLabel}"`,
        userId: user?.id,
        userName: user?.email?.split('@')[0] || '',
        projectId: activeProject.id,
        projectName: activeProject.name || '',
        entityType: 'sprint',
        entityId: sprintId,
        entityName: sprintLabel,
      })
    }
    return updated
  }

  const updateProjectSprint = async (sprintId, updates) => {
    if (!user || !activeProject?.id || !sprintId) return null
    const updated = await dbUpdateProjectSprint(sprintId, updates)
    await loadProjectSprints(activeProject.id)
    return updated
  }

  return (
    <WorkspaceContext.Provider
      value={{
        projects,
        memberProjectIds: projects.map((project) => project.id),
        teams,
        activeProject,
        activeTeam,
        projectSprints,
        activeSprint,
        isLoading,
        selectProject,
        selectTeam,
        addProject,
        addTeam,
        removeProject,
        removeTeam,
        updateProjects,
        updateTeams,
        kickTeamMember,
        updateTeamMemberRole,
        removeDirectProjectMember,
        updateProjectOverview,
        loadProjectSprints,
        createProjectSprint,
        completeProjectSprint,
        updateProjectSprint,
        reloadProjects: loadProjects,
        reloadTeams: loadTeams,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}
