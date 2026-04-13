import { createContext, useContext, useEffect, useState } from 'react'
import {
  loadProjects,
  saveProjects,
  getActiveProject,
  setActiveProject,
} from './workspaceStorage.js'
import { getAcceptedTeamInvitations, subscribeToTeamMemberChanges } from './invitationManager.js'

const WorkspaceContext = createContext(null)

export function WorkspaceProvider({ children }) {
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
  }

  const updateTeams = (updated) => {
    setTeams(updated)
    localStorage.setItem('zc-teams', JSON.stringify(updated))
  }

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
