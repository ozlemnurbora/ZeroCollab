import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { LanguageProvider } from './utils/LanguageContext.jsx'
import { initP2P } from './utils/p2pManager.js'
import { SidebarLayout } from './layouts/SidebarLayout.jsx'
import { DashboardPage } from './pages/DashboardPage.jsx'
import { TasksPage } from './pages/TasksPage.jsx'
import { CalendarPage } from './pages/CalendarPage.jsx'
import { ChatPage } from './pages/ChatPage.jsx'
import { EvaluationPage } from './pages/EvaluationPage.jsx'
import { SettingsPage } from './pages/SettingsPage.jsx'

function App() {
  useEffect(() => {
    initP2P()
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
