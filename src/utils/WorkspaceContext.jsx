import { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import {
  loadProjects,
  saveProjects,
  getActiveProject,
  setActiveProject,
} from './workspaceStorage.js'
import { connectToProjectHub } from './appHub.js'
import { getAcceptedTeamInvitations, subscribeToTeamMemberChanges } from './invitationManager.js'
import {
  joinTeamSync,
  leaveTeamSync,
  broadcastTeamMembers,
  broadcastProjectToTeam,
} from './workspaceSync.js'

const WorkspaceContext = createContext(null)

export function WorkspaceProvider({ children }) {
  const { user } = useAuth()
  const [projects, setProjects] = useState(() => loadProjects())
  const [activeProject, setActiveProjectState] = useState(() =>
    getActiveProject(),
  )
  const [teams, setTeams] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('zc-teams') || '[]')
    } catch {
      return []
    }
  })
  const [activeTeam, setActiveTeamState] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('zc-active-team') || 'null')
    } catch {
      return null
    }
  })

  const selectProject = (project) => {
    setActiveProjectState(project)
    setActiveProject(project)
  }

  const selectTeam = (team) => {
    setActiveTeamState(team)
    localStorage.setItem('zc-active-team', JSON.stringify(team))
  }

  const updateProjects = (updated) => {
    setProjects(updated)
    saveProjects(updated)
    void (async () => {
      for (const project of updated) {
        if (project.teamIds && project.teamIds.length > 0) {
          await broadcastProjectToTeam(project)
        }
      }
    })()
  }

  const updateTeams = (updated) => {
    setTeams(updated)
    localStorage.setItem('zc-teams', JSON.stringify(updated))
    void (async () => {
      for (const team of updated) {
        if (team.members && team.members.length > 0) {
          await broadcastTeamMembers(team.id, team.members)
        }
      }
    })()
  }

  const addMyselfToTeam = (teamId, userName) => {
    setTeams((prev) => {
      const updated = prev.map((t) => {
        if (t.id === teamId) {
          const members = t.members || []
          if (!members.includes(userName)) {
            return { ...t, members: [...members, userName] }
          }
        }
        return t
      })
      localStorage.setItem('zc-teams', JSON.stringify(updated))
      return updated
    })
  }

  useEffect(() => {
    void (async () => {
      await joinTeamSync(
        (teamId, members) => {
          setTeams((prev) => {
            const updated = prev.map((t) => {
              if (t.id === teamId) {
                const merged = [...new Set([...(t.members || []), ...members])]
                return { ...t, members: merged }
              }
              return t
            })
            localStorage.setItem('zc-teams', JSON.stringify(updated))
            return updated
          })
        },
        (project) => {
          setProjects((prev) => {
            if (prev.find((p) => p.id === project.id)) {
              const updated = prev.map((p) => (p.id === project.id ? project : p))
              saveProjects(updated)
              return updated
            }
            const updated = [...prev, { ...project, isShared: true }]
            saveProjects(updated)
            return updated
          })
        },
      )
    })()
    return () => {
      void leaveTeamSync()
    }
  }, [])

  useEffect(() => {
    if (!teams || teams.length === 0) return

    const teamIds = teams.map(t => t.id)

    getAcceptedTeamInvitations(teamIds).then(accepted => {
      if (accepted.length === 0) return

      setTeams(prev => {
        let updated = [...prev]
        accepted.forEach(inv => {
          const memberName = inv.invitee_email.split('@')[0]
          updated = updated.map(t => {
            if (t.id === inv.team_id) {
              const members = t.members || []
              if (!members.includes(memberName)) {
                return { ...t, members: [...members, memberName] }
              }
            }
            return t
          })
        })
        localStorage.setItem('zc-teams', JSON.stringify(updated))
        return updated
      })
    })

    const unsubscribe = subscribeToTeamMemberChanges(teamIds, (inv) => {
      const memberName = inv.invitee_email.split('@')[0]
      setTeams(prev => {
        const updated = prev.map(t => {
          if (t.id === inv.team_id) {
            const members = t.members || []
            if (!members.includes(memberName)) {
              return { ...t, members: [...members, memberName] }
            }
          }
          return t
        })
        localStorage.setItem('zc-teams', JSON.stringify(updated))
        return updated
      })
    })

    return () => unsubscribe()
  }, [teams.length])

  useEffect(() => {
    if (!activeProject || !user) return
    void connectToProjectHub(activeProject.id, user.id, user.email)
  }, [activeProject?.id, user?.id])

  return (
    <WorkspaceContext.Provider
      value={{
        projects,
        activeProject,
        teams,
        activeTeam,
        selectProject,
        selectTeam,
        updateProjects,
        updateTeams,
        addMyselfToTeam,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx)
    throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}
