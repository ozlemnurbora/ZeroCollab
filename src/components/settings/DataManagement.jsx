import { loadMessages, saveMessages } from '../chat/chatStorage.js'
import { useAuth } from '../../utils/AuthContext.jsx'
import { useLanguage } from '../../utils/LanguageContext.jsx'

export function DataManagement() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const ownerUserId = user?.id || null

  const handleExportJSON = async () => {
    try {
      const ownerKey = ownerUserId || 'unknown'

      // Gather all data from IndexedDB
      const tasks = JSON.parse(localStorage.getItem('zerocollab.tasks.v1') || '[]')
      const settings = JSON.parse(localStorage.getItem('zerocollab.settings.v1') || '{}')
      const chatMessages = await loadMessages(ownerKey)
      const customCalendars = JSON.parse(localStorage.getItem('zc-custom-calendars') || '[]')
      const releasePackages = JSON.parse(localStorage.getItem('zc-release-packages') || '[]')

      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        exportedBy: user?.email || 'unknown',
        data: {
          tasks: Array.isArray(tasks) ? tasks : [],
          settings,
          chatMessages: Array.isArray(chatMessages) ? chatMessages : [],
          customCalendars: Array.isArray(customCalendars) ? customCalendars : [],
          releasePackages: Array.isArray(releasePackages) ? releasePackages : [],
        },
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `zerocollab-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('[DataManagement] Export failed:', err)
      alert('Export failed. Check console for details.')
    }
  }

  const handleImportJSON = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const imported = JSON.parse(text)

        if (!imported?.data) {
          alert('Invalid export format. Missing "data" field.')
          return
        }

        const confirmMsg = `Import will add data from "${file.name}".\n\n` +
          `Tasks: ${imported.data.tasks?.length || 0}\n` +
          `Chat Messages: ${imported.data.chatMessages?.length || 0}\n` +
          `Custom Calendars: ${imported.data.customCalendars?.length || 0}\n` +
          `Release Packages: ${imported.data.releasePackages?.length || 0}\n\n` +
          `Exported by: ${imported.exportedBy || 'unknown'}\n` +
          `Exported at: ${imported.exportedAt || 'unknown'}\n\n` +
          `Continue?`

        if (!window.confirm(confirmMsg)) return

        // Import tasks
        if (Array.isArray(imported.data.tasks) && imported.data.tasks.length > 0) {
          const existingTasks = JSON.parse(localStorage.getItem('zerocollab.tasks.v1') || '[]')
          const existingIds = new Set(existingTasks.map(t => t.id))
          const newTasks = imported.data.tasks.filter(t => !existingIds.has(t.id))
          localStorage.setItem('zerocollab.tasks.v1', JSON.stringify([...existingTasks, ...newTasks]))
        }

        // Import chat messages
        if (Array.isArray(imported.data.chatMessages) && imported.data.chatMessages.length > 0 && ownerUserId) {
          const existing = await loadMessages(ownerUserId)
          const existingIds = new Set(existing.map(m => m.id))
          const newMsgs = imported.data.chatMessages.filter(m => !existingIds.has(m.id))
          await saveMessages([...existing, ...newMsgs], ownerUserId)
        }

        // Import custom calendars
        if (Array.isArray(imported.data.customCalendars) && imported.data.customCalendars.length > 0) {
          const existing = JSON.parse(localStorage.getItem('zc-custom-calendars') || '[]')
          const existingIds = new Set(existing.map(c => c.id))
          const newCals = imported.data.customCalendars.filter(c => !existingIds.has(c.id))
          localStorage.setItem('zc-custom-calendars', JSON.stringify([...existing, ...newCals]))
        }

        // Import release packages
        if (Array.isArray(imported.data.releasePackages) && imported.data.releasePackages.length > 0) {
          const existing = JSON.parse(localStorage.getItem('zc-release-packages') || '[]')
          const existingIds = new Set(existing.map(p => p.id))
          const newPkgs = imported.data.releasePackages.filter(p => !existingIds.has(p.id))
          localStorage.setItem('zc-release-packages', JSON.stringify([...existing, ...newPkgs]))
        }

        alert(`Import complete!\nNew tasks: ${imported.data.tasks?.length || 0}\nRefresh the page to see changes.`)
        window.location.reload()
      } catch (err) {
        console.error('[DataManagement] Import failed:', err)
        alert('Import failed. Invalid JSON file.')
      }
    }
    input.click()
  }

  return (
    <div className="flex flex-col gap-3">
        <div className="mb-4 rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] px-4 py-4">
          <h4 className="text-sm font-semibold text-[rgb(var(--zc-text))]">📦 JSON Export / Import</h4>
          <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
            {t('data_json_desc')}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleExportJSON}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition"
            >
              📤 Export Data (JSON)
            </button>
            <button
              type="button"
              onClick={handleImportJSON}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 transition"
            >
              📥 Import Data (JSON)
            </button>
          </div>
        </div>
    </div>
  )
}
