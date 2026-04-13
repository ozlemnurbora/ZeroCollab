import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { OfflineBanner } from '../components/pwa/OfflineBanner.jsx'
import { useLanguage } from '../utils/LanguageContext.jsx'
import { useWorkspace } from '../utils/WorkspaceContext.jsx'
import { useAuth } from '../utils/AuthContext.jsx'
import { ProjectDetailModal } from '../components/workspace/ProjectDetailModal.jsx'
import { TeamDetailModal } from '../components/workspace/TeamDetailModal.jsx'
import { InvitationsPanel } from '../components/workspace/InvitationsPanel.jsx'

export function SidebarLayout() {
  const { t } = useLanguage()
  const { user, signOut } = useAuth()
  const {
    projects,
    activeProject,
    teams,
    activeTeam,
    selectProject,
    selectTeam,
    updateProjects,
    updateTeams,
  } = useWorkspace()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [showProjectsSection, setShowProjectsSection] = useState(true)
  const [selectedProject, setSelectedProject] = useState(null)
  const [selectedTeam, setSelectedTeam] = useState(null)

  const PROJECT_COLORS = [
    'bg-indigo-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-violet-500',
    'bg-cyan-500',
  ]

  const addProject = () => {
    const name = newProjectName.trim()
    if (!name) return
    const newProject = {
      id: `proj_${Date.now()}`,
      name,
      color: PROJECT_COLORS[projects.length % PROJECT_COLORS.length],
      createdAt: Date.now(),
      members: [],
      description: '',
      teamIds: [],
    }
    const updated = [...projects, newProject]
    updateProjects(updated)
    selectProject(newProject)
    setNewProjectName('')
    setShowNewProject(false)
  }

  const deleteProject = (id) => {
    const updated = projects.filter((p) => p.id !== id)
    updateProjects(updated)
    if (selectedProject?.id === id) setSelectedProject(null)
    if (activeProject?.id === id) {
      const next = updated[0] || null
      selectProject(next)
    }
  }

  const updateProject = (updated) => {
    const updatedList = projects.map((p) => (p.id === updated.id ? updated : p))
    updateProjects(updatedList)
    if (activeProject?.id === updated.id) {
      selectProject(updated)
    }
    setSelectedProject((prev) => (prev?.id === updated.id ? updated : prev))
  }

  const [showTeamsSection, setShowTeamsSection] = useState(true)
  const [showNewTeam, setShowNewTeam] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')

  const TEAM_COLORS = [
    'bg-pink-500',
    'bg-teal-500',
    'bg-orange-500',
    'bg-blue-500',
    'bg-lime-500',
    'bg-purple-500',
  ]

  const addTeam = () => {
    const name = newTeamName.trim()
    if (!name) return
    const creatorName = user?.email?.split('@')[0] || 'Unknown'
    const newTeam = {
      id: `team_${Date.now()}`,
      name,
      color: TEAM_COLORS[teams.length % TEAM_COLORS.length],
      createdAt: Date.now(),
      members: [creatorName],
      projectIds: [],
    }
    const updated = [...teams, newTeam]
    updateTeams(updated)
    setNewTeamName('')
    setShowNewTeam(false)
  }

  useEffect(() => {
    if (!user || !teams || teams.length === 0) return
    const userName = user.email?.split('@')[0]
    if (!userName) return
    let needsUpdate = false
    const updated = teams.map((team) => {
      const members = team.members || []
      if (members.length === 0) {
        needsUpdate = true
        return { ...team, members: [userName] }
      }
      return team
    })
    if (needsUpdate) updateTeams(updated)
  }, [user?.id])

  const deleteTeam = (id) => {
    const updated = teams.filter((t) => t.id !== id)
    updateTeams(updated)
    if (selectedTeam?.id === id) setSelectedTeam(null)
    if (activeTeam?.id === id) selectTeam(null)
  }

  const updateTeam = (updated) => {
    const updatedList = teams.map((t) => (t.id === updated.id ? updated : t))
    updateTeams(updatedList)
    setSelectedTeam((prev) => (prev?.id === updated.id ? updated : prev))
    if (activeTeam?.id === updated.id) selectTeam(updated)
  }

  const navItems = useMemo(
    () => [
      { to: '/', label: t('nav_dashboard'), end: true },
      { to: '/tasks', label: t('nav_tasks') },
      { to: '/calendar', label: t('nav_calendar') },
      { to: '/chat', label: t('nav_chat') },
      { to: '/evaluation', label: t('nav_evaluation') },
      { to: '/settings', label: t('nav_settings') },
    ],
    [t],
  )

  const linkBaseClasses =
    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors'

  const getLinkClasses = ({ isActive }) => {
    const activeClasses =
      'bg-[rgb(var(--zc-border))] text-[rgb(var(--zc-text))]'
    const inactiveClasses =
      'text-[rgb(var(--zc-muted))] hover:bg-[rgb(var(--zc-border)/0.7)] hover:text-[rgb(var(--zc-text))]'
    return `${linkBaseClasses} ${isActive ? activeClasses : inactiveClasses}`
  }

  return (
    <div className="min-h-screen bg-[rgb(var(--zc-bg))] text-[rgb(var(--zc-text))] flex">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[rgb(var(--zc-panel))] border-r border-[rgb(var(--zc-border))] flex flex-col transform transition-transform duration-200 md:relative md:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:w-64`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-[rgb(var(--zc-border))]">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-500 flex items-center justify-center text-xs font-bold text-white">
              ZC
            </div>
            <span className="text-base font-semibold tracking-tight">
              ZeroCollab
            </span>
          </div>
          <button
            type="button"
            className="md:hidden rounded-md p-1 text-[rgb(var(--zc-muted2))] hover:bg-[rgb(var(--zc-border))]"
            onClick={() => setIsSidebarOpen(false)}
          >
            <span className="sr-only">{t('sidebar_close')}</span>✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-3">
          <InvitationsPanel />
          {activeProject && (
            <div className="mx-3 mb-3 flex items-center gap-2 rounded-lg bg-[rgb(var(--zc-border)/0.4)] px-3 py-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${activeProject.color}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-[rgb(var(--zc-text))]">{activeProject.name}</p>
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className="space-y-0.5 px-3">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={getLinkClasses}
                onClick={() => setIsSidebarOpen(false)}
              >
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Divider */}
          <div className="my-3 border-t border-[rgb(var(--zc-border))]" />

          {/* Projects Section */}
          <div className="px-3">
            <button
              type="button"
              onClick={() => setShowProjectsSection((v) => !v)}
              className="flex w-full items-center justify-between py-1 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--zc-muted2))] hover:text-[rgb(var(--zc-text))]"
            >
              <span>Projects</span>
              <span className="text-xs">
                {showProjectsSection ? '▾' : '▸'}
              </span>
            </button>

            {showProjectsSection ? (
              <div className="mt-1 space-y-0.5">
                {projects.map((project) => (
                  <div key={project.id} className="group flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => selectProject(project)}
                      className={[
                        'flex flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition',
                        activeProject?.id === project.id
                          ? 'bg-[rgb(var(--zc-border)/0.5)] text-[rgb(var(--zc-text))] font-medium'
                          : 'text-[rgb(var(--zc-muted))] hover:bg-[rgb(var(--zc-border)/0.35)] hover:text-[rgb(var(--zc-text))]',
                      ].join(' ')}
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${project.color}`}
                          />
                          <span className="truncate text-sm">{project.name}</span>
                        </div>
                        {project.teamIds && project.teamIds.length > 0 ? (
                          <div className="ml-4 mt-0.5 flex flex-wrap gap-1">
                            {teams
                              .filter((team) => project.teamIds.includes(team.id))
                              .map((team) => (
                                <span
                                  key={team.id}
                                  className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--zc-border)/0.5)] px-1.5 py-0.5 text-[10px] text-[rgb(var(--zc-muted2))]"
                                >
                                  <span
                                    className={`h-1.5 w-1.5 rounded-full ${team.color}`}
                                  />
                                  {team.name}
                                </span>
                              ))}
                          </div>
                        ) : null}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedProject(project)}
                      className="hidden group-hover:flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs text-[rgb(var(--zc-subtle))] hover:bg-[rgb(var(--zc-border)/0.5)] hover:text-[rgb(var(--zc-text))]"
                      title="Project settings"
                    >
                      ⚙
                    </button>
                  </div>
                ))}

                {/* New Project */}
                {showNewProject ? (
                  <div className="mt-1 space-y-1.5">
                    <input
                      autoFocus
                      type="text"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addProject()
                        if (e.key === 'Escape') {
                          setShowNewProject(false)
                          setNewProjectName('')
                        }
                      }}
                      placeholder="Project name..."
                      className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 py-1.5 text-xs text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    />
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={addProject}
                        className="flex-1 rounded-md bg-indigo-500/20 px-2 py-1 text-xs font-medium text-indigo-300 hover:bg-indigo-500/30"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewProject(false)
                          setNewProjectName('')
                        }}
                        className="flex-1 rounded-md bg-[rgb(var(--zc-border)/0.5)] px-2 py-1 text-xs text-[rgb(var(--zc-muted))] hover:bg-[rgb(var(--zc-border))]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowNewProject(true)}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-[rgb(var(--zc-muted2))] hover:bg-[rgb(var(--zc-border)/0.35)] hover:text-[rgb(var(--zc-text))] transition"
                  >
                    <span className="text-sm">+</span> New Project
                  </button>
                )}
              </div>
            ) : null}
          </div>

          {/* Divider */}
          <div className="my-3 border-t border-[rgb(var(--zc-border))]" />

          {/* Teams Section */}
          <div className="px-3">
            <button
              type="button"
              onClick={() => setShowTeamsSection((v) => !v)}
              className="flex w-full items-center justify-between py-1 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--zc-muted2))] hover:text-[rgb(var(--zc-text))]"
            >
              <span>Teams</span>
              <span className="text-xs">
                {showTeamsSection ? '▾' : '▸'}
              </span>
            </button>

            {showTeamsSection ? (
              <div className="mt-1 space-y-0.5">
                {teams.map((team) => (
                  <div key={team.id} className="group flex items-center gap-1">
                    <div
                      className={[
                        'flex flex-1 min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm',
                        activeTeam?.id === team.id
                          ? 'bg-[rgb(var(--zc-border)/0.5)] text-[rgb(var(--zc-text))] font-medium'
                          : 'text-[rgb(var(--zc-muted))]',
                      ].join(' ')}
                    >
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${team.color}`}
                      />
                      <span className="truncate text-sm">{team.name}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-[rgb(var(--zc-subtle))]">
                        {team.members?.length || 0} members
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedTeam(team)}
                      className="hidden group-hover:flex items-center justify-center w-5 h-5 rounded text-[rgb(var(--zc-subtle))] hover:text-[rgb(var(--zc-text))] hover:bg-[rgb(var(--zc-border)/0.5)] text-xs shrink-0"
                      title="Team settings"
                    >
                      ⚙
                    </button>
                  </div>
                ))}

                {showNewTeam ? (
                  <div className="mt-1 space-y-1.5">
                    <input
                      autoFocus
                      type="text"
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addTeam()
                        if (e.key === 'Escape') {
                          setShowNewTeam(false)
                          setNewTeamName('')
                        }
                      }}
                      placeholder="Team name..."
                      className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 py-1.5 text-xs text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    />
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={addTeam}
                        className="flex-1 rounded-md bg-indigo-500/20 px-2 py-1 text-xs font-medium text-indigo-300 hover:bg-indigo-500/30"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewTeam(false)
                          setNewTeamName('')
                        }}
                        className="flex-1 rounded-md bg-[rgb(var(--zc-border)/0.5)] px-2 py-1 text-xs text-[rgb(var(--zc-muted))] hover:bg-[rgb(var(--zc-border))]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowNewTeam(true)}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-[rgb(var(--zc-muted2))] hover:bg-[rgb(var(--zc-border)/0.35)] hover:text-[rgb(var(--zc-text))] transition"
                  >
                    <span className="text-sm">+</span> New Team
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <div className="border-t border-[rgb(var(--zc-border))] px-4 py-3 space-y-2">
          <p className="text-xs text-[rgb(var(--zc-subtle))]">{t('brand_tagline')}</p>
          {user && (
            <div className="space-y-1">
              <p className="text-xs text-[rgb(var(--zc-muted2))] truncate">{user.email}</p>
              <button
                type="button"
                onClick={() => signOut()}
                className="w-full rounded-md bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/25 transition"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>

      </aside>

      {/* Modals rendered outside sidebar to prevent position issues */}
      <ProjectDetailModal
        open={!!selectedProject}
        onClose={() => setSelectedProject(null)}
        project={selectedProject}
        teams={teams}
        onUpdate={updateProject}
        onDelete={deleteProject}
      />

      <TeamDetailModal
        open={!!selectedTeam}
        onClose={() => setSelectedTeam(null)}
        team={selectedTeam}
        onUpdate={updateTeam}
        onDelete={deleteTeam}
      />

      <div className="flex-1 flex flex-col">
        <OfflineBanner />
        <header className="flex items-center justify-between border-b border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.8)] px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white">
              ZC
            </div>
            <span className="text-base font-semibold tracking-tight">
              ZeroCollab
            </span>
          </div>
          <button
            type="button"
            className="rounded-md p-1.5 text-[rgb(var(--zc-muted))] hover:bg-[rgb(var(--zc-border))] hover:text-[rgb(var(--zc-text))]"
            onClick={() => setIsSidebarOpen((open) => !open)}
          >
            <span className="sr-only">{t('sidebar_toggle')}</span>☰
          </button>
        </header>

        <main className="flex-1 px-4 py-4 md:px-6 md:py-6">
          <div className="w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
