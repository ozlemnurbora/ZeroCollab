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

  const selectProject = (project) => {
    setActiveProjectState(project)
    setActiveProject(project)
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
        selectProject,
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
