import { useRef, useState } from 'react'
import { Button } from '../ui/Button.jsx'
import { Modal } from '../ui/Modal.jsx'

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

export function DataManagement({ onAfterImportOrClear }) {
  const fileRef = useRef(null)
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const [importError, setImportError] = useState('')

  const exportAll = () => {
    const all = {}
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      all[key] = localStorage.getItem(key)
    }
    downloadJson(`zerocollab-export-${new Date().toISOString()}.json`, all)
  }

  const importAll = async (file) => {
    setImportError('')
    try {
      const text = await readFileAsText(file)
      const parsed = JSON.parse(text)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Invalid export format.')
      }
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') localStorage.setItem(key, value)
        else localStorage.setItem(key, JSON.stringify(value))
      }
      onAfterImportOrClear?.()
    } catch (e) {
      setImportError(e?.message || 'Import failed.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const clearAll = () => {
    localStorage.clear()
    setConfirmClearOpen(false)
    onAfterImportOrClear?.()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={exportAll}>
          Export all data
        </Button>

        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) importAll(file)
          }}
        />
        <Button
          variant="secondary"
          onClick={() => fileRef.current?.click()}
        >
          Import data
        </Button>

        <Button variant="danger" onClick={() => setConfirmClearOpen(true)}>
          Clear all data
        </Button>
      </div>

      {importError ? (
        <p className="text-sm text-rose-300">{importError}</p>
      ) : (
        <p className="text-xs text-[rgb(var(--zc-subtle))]">
          Export downloads a JSON snapshot of current localStorage. Import will
          merge/overwrite keys from the file.
        </p>
      )}

      <Modal
        open={confirmClearOpen}
        onClose={() => setConfirmClearOpen(false)}
        title="Clear all local data?"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setConfirmClearOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={clearAll}>
              Yes, clear
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[rgb(var(--zc-muted))]">
          This will remove tasks, chat messages, evaluations, and all preferences
          stored in your browser for this app.
        </p>
      </Modal>
    </div>
  )
}

