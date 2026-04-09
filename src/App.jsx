import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { LanguageProvider } from './utils/LanguageContext.jsx'
import { WorkspaceProvider } from './utils/WorkspaceContext.jsx'
import { connectToPeer, initP2P } from './utils/p2pManager.js'
import { SidebarLayout } from './layouts/SidebarLayout.jsx'
import { DashboardPage } from './pages/DashboardPage.jsx'
import { TasksPage } from './pages/TasksPage.jsx'
import { CalendarPage } from './pages/CalendarPage.jsx'
import { ChatPage } from './pages/ChatPage.jsx'
import { EvaluationPage } from './pages/EvaluationPage.jsx'
import { SettingsPage } from './pages/SettingsPage.jsx'

function App() {
  useEffect(() => {
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
        // eslint-disable-next-line no-console
        console.log('[App] auto-reconnecting to saved peers:', saved)
        for (const peerId of saved) {
          if (typeof peerId !== 'string' || !peerId) continue
          try {
            const conn = await connectToPeer(peerId)
            if (!conn) throw new Error('connect failed')
            // eslint-disable-next-line no-console
            console.log('[App] reconnected to:', peerId)
          } catch (err) {
            // eslint-disable-next-line no-console
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
      <WorkspaceProvider>
        <Routes>
          <Route path="/" element={<SidebarLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="evaluation" element={<EvaluationPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </WorkspaceProvider>
    </LanguageProvider>
  )
}

export default App
