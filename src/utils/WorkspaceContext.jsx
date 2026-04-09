import { createContext, useContext, useState } from 'react'
import {
  loadProjects,
  saveProjects,
  getActiveProject,
  setActiveProject,
} from './workspaceStorage.js'

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
