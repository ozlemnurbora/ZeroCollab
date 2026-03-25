import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { LanguageProvider } from './utils/LanguageContext.jsx'
import { connectToPeer, initP2P, on, P2P_EVENTS } from './utils/p2pManager.js'
import { SidebarLayout } from './layouts/SidebarLayout.jsx'
import { DashboardPage } from './pages/DashboardPage.jsx'
import { TasksPage } from './pages/TasksPage.jsx'
import { CalendarPage } from './pages/CalendarPage.jsx'
import { ChatPage } from './pages/ChatPage.jsx'
import { EvaluationPage } from './pages/EvaluationPage.jsx'
import { SettingsPage } from './pages/SettingsPage.jsx'

function App() {
  useEffect(() => {
    void initP2P().then(({ peerId }) => {
      // eslint-disable-next-line no-console
      console.log('[App] P2P initialized, peerId:', peerId)
      try {
        const raw = sessionStorage.getItem('zc-connected-peers')
        const saved = raw ? JSON.parse(raw) : []
        if (Array.isArray(saved) && saved.length > 0) {
          // eslint-disable-next-line no-console
          console.log('[App] auto-reconnecting to saved peers:', saved)
          for (const remotePeerId of saved) {
            if (typeof remotePeerId === 'string' && remotePeerId) {
              window.setTimeout(() => {
                void connectToPeer(remotePeerId)
              }, 1000)
            }
          }
        }
      } catch {
        // ignore corrupt storage
      }
    })

    const unsub = on(P2P_EVENTS.PEER_DISCONNECTED, ({ peerId }) => {
      // eslint-disable-next-line no-console
      console.log('[App] peer disconnected:', peerId)
    })

    return () => {
      unsub()
    }
  }, [])

  return (
    <LanguageProvider>
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
    </LanguageProvider>
  )
}

export default App
