import { useRef, useState } from 'react'
import { Button } from '../ui/Button.jsx'
import { Modal } from '../ui/Modal.jsx'
import { useLanguage } from '../../utils/LanguageContext.jsx'

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
  const { t } = useLanguage()
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
        setImportError(t('data_import_error_invalid'))
        return
      }
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') localStorage.setItem(key, value)
        else localStorage.setItem(key, JSON.stringify(value))
      }
      onAfterImportOrClear?.()
    } catch {
      setImportError(t('data_import_error'))
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
          {t('data_export')}
        </Button>

        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void importAll(file)
          }}
        />
        <Button variant="secondary" onClick={() => fileRef.current?.click()}>
          {t('data_import')}
        </Button>

        <Button variant="danger" onClick={() => setConfirmClearOpen(true)}>
          {t('data_clear')}
        </Button>
      </div>

      {importError ? (
        <p className="text-sm text-rose-300">{importError}</p>
      ) : (
        <p className="text-xs text-[rgb(var(--zc-subtle))]">{t('data_help')}</p>
      )}

      <Modal
        open={confirmClearOpen}
        onClose={() => setConfirmClearOpen(false)}
        title={t('data_clear_title')}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmClearOpen(false)}>
              {t('btn_cancel')}
            </Button>
            <Button variant="danger" onClick={clearAll}>
              {t('data_clear_yes')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[rgb(var(--zc-muted))]">{t('data_clear_body')}</p>
      </Modal>
    </div>
  )
}
