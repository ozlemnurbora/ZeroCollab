import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { LanguageProvider } from './utils/LanguageContext.jsx'
import { WorkspaceProvider } from './utils/WorkspaceContext.jsx'
import { AuthProvider, useAuth } from './utils/AuthContext.jsx'
import { MeetingSessionProvider } from './utils/MeetingSessionContext.jsx'
import { connectToPeer, initP2P } from './utils/p2pManager.js'
import { requestNotificationPermission } from './utils/taskReminder.js'
import { SidebarLayout } from './layouts/SidebarLayout.jsx'
import { DashboardPage } from './pages/DashboardPage.jsx'
import { ProjectOverviewPage } from './pages/ProjectOverviewPage.jsx'
import { SprintPlanningPage } from './pages/SprintPlanningPage.jsx'
import { SprintBoardPage } from './pages/SprintBoardPage.jsx'
import { TasksPage } from './pages/TasksPage.jsx'
import { CalendarPage } from './pages/CalendarPage.jsx'
import { ChatPage } from './pages/ChatPage.jsx'
import { MeetingRoomPage } from './pages/MeetingRoomPage.jsx'
import { EvaluationPage } from './pages/EvaluationPage.jsx'
import { TokenEconomicsPage } from './pages/TokenEconomicsPage.jsx'
import { SettingsPage } from './pages/SettingsPage.jsx'
import { AuthPage } from './pages/AuthPage.jsx'

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-[rgb(var(--zc-bg))] flex items-center justify-center">
        <p className="text-[rgb(var(--zc-muted))]">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return <AuthPage />
  }

  return (
    <Routes>
      <Route path="/" element={<SidebarLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="project-overview" element={<ProjectOverviewPage />} />
        <Route path="sprint-planning" element={<SprintPlanningPage />} />
        <Route path="sprint-board" element={<SprintBoardPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="meetings/:meetingId" element={<MeetingRoomPage />} />
        <Route path="evaluation" element={<EvaluationPage />} />
        <Route path="token-economics" element={<TokenEconomicsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

function App() {
  useEffect(() => {
    void requestNotificationPermission()

    const run = async () => {
      await initP2P()

      await new Promise((resolve) => setTimeout(resolve, 2000))

      let saved = []
      try {
        saved = JSON.parse(sessionStorage.getItem('zc-connected-peers') || '[]')
        if (!Array.isArray(saved)) saved = []
      } catch {
        saved = []
      }

      if (saved.length > 0) {
         
        console.log('[App] auto-reconnecting to saved peers:', saved)
        for (const peerId of saved) {
          if (typeof peerId !== 'string' || !peerId) continue
          try {
            const conn = await connectToPeer(peerId)
            if (!conn) throw new Error('connect failed')
             
            console.log('[App] reconnected to:', peerId)
          } catch (err) {
             
            console.log('[App] failed to reconnect to:', peerId, err)
            try {
              const current = JSON.parse(
                sessionStorage.getItem('zc-connected-peers') || '[]',
              )
              if (Array.isArray(current)) {
                sessionStorage.setItem(
                  'zc-connected-peers',
                  JSON.stringify(current.filter((id) => id !== peerId)),
                )
              }
            } catch {
              // ignore
            }
          }
        }
      }
    }
    void run()
  }, [])

  return (
    <LanguageProvider>
      <AuthProvider>
        <WorkspaceProvider>
          <MeetingSessionProvider>
            <AppRoutes />
          </MeetingSessionProvider>
        </WorkspaceProvider>
      </AuthProvider>
    </LanguageProvider>
  )
}

export default App
