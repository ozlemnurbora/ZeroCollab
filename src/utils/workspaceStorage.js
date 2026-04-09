const PROJECTS_KEY = 'zc-projects'
const ACTIVE_PROJECT_KEY = 'zc-active-project'

export function loadProjects() {
  try {
    return JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]')
  } catch {
    return []
  }
}

export function saveProjects(projects) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
}

export function getActiveProject() {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_PROJECT_KEY) || 'null')
  } catch {
    return null
  }
}

export function setActiveProject(project) {
  localStorage.setItem(ACTIVE_PROJECT_KEY, JSON.stringify(project))
}
