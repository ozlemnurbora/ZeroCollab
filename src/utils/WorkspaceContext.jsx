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
import {
  fetchMyProjects,
  fetchMyTeams,
  fetchProjectTeams,
  fetchTeamMembers,
  removeMemberFromTeam,
  createProject,
  deleteProject as dbDeleteProject,
  leaveProject as dbLeaveProject,
  updateProject as dbUpdateProject,
  createTeam,
  deleteTeam as dbDeleteTeam,
  assignTeamToProject,
  removeTeamFromProject,
  subscribeToMyProjects,
  subscribeToMyTeams,
  updateTeamRecord,
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
  const [projects, setProjects] = useState([])
  const [teams, setTeams] = useState([])
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
    const currentIds = new Set(projects.map((project) => project.id))
    const removedIds = [...memberProjectIdsRef.current].filter((id) => !currentIds.has(id))
    memberProjectIdsRef.current = currentIds
    if (removedIds.length === 0) return
    void pruneSharedTasksByProjectIds(removedIds)
    void pruneMeetingsByProjectIds(removedIds)
  }, [projects])

  const loadProjects = useCallback(async () => {
    if (!user) return
    try {
      const myProjects = await fetchMyProjects(user.id)
      const projectsWithTeams = await Promise.all(
        myProjects.map(async (p) => {
          const teamIds = await fetchProjectTeams(p.id)
          return { ...p, teamIds }
        }),
      )
      setProjects(projectsWithTeams)

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
    try {
      const myTeams = await fetchMyTeams(user.id)
      const teamsWithMembers = await Promise.all(
        myTeams.map(async (t) => {
          const members = await fetchTeamMembers(t.id)
          return { ...t, members }
        }),
      )
      setTeams(teamsWithMembers)
    } catch (err) {
      console.error('[WorkspaceContext] loadTeams error:', err)
    }
  }, [user])

  useEffect(() => {
    if (!user) {
      const resetTimer = window.setTimeout(() => {
        setProjects([])
        setTeams([])
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
    if (!activeProject || !user) {
      void disconnectFromProjectHub()
      return
    }
    void connectToProjectHub(activeProject.id, user.id, user.email)
  }, [activeProject, user])

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
    } else if (memberSource === 'direct') {
      await dbLeaveProject(projectId, user.id)
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
        for (const teamId of toAdd) await assignTeamToProject(project.id, teamId)
        for (const teamId of toRemove)
          await removeTeamFromProject(project.id, teamId)
      }
    }
    await loadProjects()
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
    await removeMemberFromTeam(teamId, targetUserId, user.id)
    await loadTeams()
    await loadProjects()
  }

  return (
    <WorkspaceContext.Provider
      value={{
        projects,
        memberProjectIds: projects.map((project) => project.id),
        teams,
        activeProject,
        activeTeam,
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
