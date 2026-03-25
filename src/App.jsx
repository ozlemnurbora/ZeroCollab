import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { LanguageProvider } from './utils/LanguageContext.jsx'
import { initSignaling, joinRoom } from './utils/signalingClient.js'
import { connectToPeer, getPeerId, initP2P, on, P2P_EVENTS } from './utils/p2pManager.js'
import { SidebarLayout } from './layouts/SidebarLayout.jsx'
import { DashboardPage } from './pages/DashboardPage.jsx'
import { TasksPage } from './pages/TasksPage.jsx'
import { CalendarPage } from './pages/CalendarPage.jsx'
import { ChatPage } from './pages/ChatPage.jsx'
import { EvaluationPage } from './pages/EvaluationPage.jsx'
import { SettingsPage } from './pages/SettingsPage.jsx'

function App() {
  useEffect(() => {
    // Signaling server manages peer connectivity across refreshes.
    // Remove old peer list so we don't double-connect.
    try {
      sessionStorage.removeItem('zc-connected-peers')
    } catch {
      // ignore
    }

    void initP2P().then(({ peerId }) => {
      // eslint-disable-next-line no-console
      console.log('[App] P2P initialized, peerId:', peerId)

      initSignaling()

      // Join default room after a short delay to ensure peer is ready
      window.setTimeout(() => {
        const myPeerId = getPeerId()
        if (!myPeerId) return
        const today = new Date().toISOString().slice(0, 10)
        const roomCode = `zerocollab-${today}`
        joinRoom(roomCode, myPeerId, (peers) => {
          peers.forEach((remotePeerId) => {
            if (remotePeerId !== myPeerId) {
              // eslint-disable-next-line no-console
              console.log('[App] auto-connecting to peer from room:', remotePeerId)
              void connectToPeer(remotePeerId)
            }
          })
        })
      }, 1500)

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
