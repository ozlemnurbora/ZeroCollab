import { loadMessages, saveMessages } from '../chat/chatStorage.js'
import { loadEvaluationsForProject, saveEvaluation } from '../evaluation/evaluationStorage.js'
import { loadTasks, saveTasks } from '../kanban/taskStorage.js'
import { useAuth } from '../../utils/AuthContext.jsx'
import { useLanguage } from '../../utils/LanguageContext.jsx'
import { loadMeetings, saveMeeting } from '../../utils/meetingStorage.js'
import { useWorkspace } from '../../utils/WorkspaceContext.jsx'

export function DataManagement() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const { memberProjectIds = [] } = useWorkspace()
  const ownerUserId = user?.id || null

  const handleExportJSON = async () => {
    try {
      const ownerKey = ownerUserId || 'unknown'

      // Gather local-device data from the stores that actually own it.
      const tasks = ownerUserId ? await loadTasks(ownerUserId) : []
      const meetings = ownerUserId ? await loadMeetings(ownerUserId) : []
      let evaluations = []
      for (const pid of memberProjectIds) {
        const evs = await loadEvaluationsForProject(pid)
        if (Array.isArray(evs)) evaluations = evaluations.concat(evs)
      }
      // de-dup by id
      const seenEvalIds = new Set()
      evaluations = evaluations.filter((e) => {
        if (!e?.id || seenEvalIds.has(e.id)) return false
        seenEvalIds.add(e.id)
        return true
      })
      const settings = JSON.parse(localStorage.getItem('zerocollab.settings.v1') || '{}')
      const chatMessages = await loadMessages(ownerKey)
      const customCalendars = JSON.parse(localStorage.getItem('zc-custom-calendars') || '[]')

      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        exportedBy: user?.email || 'unknown',
        data: {
          tasks: Array.isArray(tasks) ? tasks : [],
          meetings: Array.isArray(meetings) ? meetings : [],
          evaluations: Array.isArray(evaluations) ? evaluations : [],
          settings,
          chatMessages: Array.isArray(chatMessages) ? chatMessages : [],
          customCalendars: Array.isArray(customCalendars) ? customCalendars : [],
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
          `Meetings: ${imported.data.meetings?.length || 0}\n` +
          `Evaluations: ${imported.data.evaluations?.length || 0}\n` +
          `Chat Messages: ${imported.data.chatMessages?.length || 0}\n` +
          `Custom Calendars: ${imported.data.customCalendars?.length || 0}\n` +
          `Exported by: ${imported.exportedBy || 'unknown'}\n` +
          `Exported at: ${imported.exportedAt || 'unknown'}\n\n` +
          `Continue?`

        if (!window.confirm(confirmMsg)) return

        // Import tasks
        if (Array.isArray(imported.data.tasks) && imported.data.tasks.length > 0 && ownerUserId) {
          const existing = await loadTasks(ownerUserId)
          const existingIds = new Set((existing || []).map((t) => t.id))
          const newTasks = imported.data.tasks.filter((t) => !existingIds.has(t.id))
          if (newTasks.length > 0) await saveTasks([...(existing || []), ...newTasks], ownerUserId, { reason: 'JSON import' })
        }

        // Import meetings
        if (Array.isArray(imported.data.meetings) && imported.data.meetings.length > 0 && ownerUserId) {
          const existing = await loadMeetings(ownerUserId)
          const existingIds = new Set((existing || []).map((m) => m.id))
          for (const m of imported.data.meetings) {
            if (!existingIds.has(m.id)) await saveMeeting(m, ownerUserId)
          }
        }

        // Import evaluations
        if (Array.isArray(imported.data.evaluations) && imported.data.evaluations.length > 0) {
          // gather existing ids across member projects to avoid duplicates
          const existingEvalIds = new Set()
          for (const pid of memberProjectIds) {
            const evs = await loadEvaluationsForProject(pid)
            for (const e of (evs || [])) if (e?.id) existingEvalIds.add(e.id)
          }
          for (const ev of imported.data.evaluations) {
            if (ev?.id && !existingEvalIds.has(ev.id)) {
              await saveEvaluation(ev)
            }
          }
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
