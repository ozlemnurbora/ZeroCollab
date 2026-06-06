import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/Button.jsx'
import { useLanguage } from '../../utils/LanguageContext.jsx'

const MAX_FILE_BYTES = 50 * 1024 * 1024

export function MessageComposer({
  disabled,
  onSend,
  placeholder,
  onFileSelect,
  pendingFile,
  onSendFile,
  onCancelFile,
}) {
  const { t } = useLanguage()
  const [text, setText] = useState('')
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const [fileError, setFileError] = useState('')

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const canSend = !disabled && text.trim().length > 0

  const send = () => {
    if (!canSend) return
    const value = text.trim()
    setText('')
    onSend?.(value)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      setFileError(t('composer_file_too_large'))
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setFileError('')
    onFileSelect?.(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      setFileError(t('composer_file_too_large'))
      return
    }
    setFileError('')
    onFileSelect?.(file)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <div
      className="border-t border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)] px-4 py-3"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {pendingFile ? (
        <div className="mb-3 rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-xs text-[rgb(var(--zc-muted))]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {pendingFile.isImage ? (
                <img
                  src={pendingFile.previewUrl}
                  alt={pendingFile.file.name}
                  className="h-10 w-10 rounded-md object-cover ring-1 ring-inset ring-[rgb(var(--zc-border))]"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-indigo-500/20 text-xs font-semibold text-indigo-200 ring-1 ring-inset ring-indigo-500/40">
                  {t('file_label')}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-[rgb(var(--zc-text))]">
                  {pendingFile.file.name}
                </p>
                <p className="mt-0.5 text-[11px] text-[rgb(var(--zc-subtle))]">
                  {(pendingFile.file.size / (1024 * 1024)).toFixed(2)} MB •{' '}
                  {pendingFile.file.type || t('chat_unknown_type')}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="rounded-md bg-[rgb(var(--zc-bg)/0.8)] px-2 py-1 text-[11px] font-medium text-[rgb(var(--zc-muted))] ring-1 ring-inset ring-[rgb(var(--zc-border))] hover:bg-[rgb(var(--zc-panel)/0.8)]"
                onClick={onCancelFile}
              >
                {t('file_cancel')}
              </button>
              <Button
                size="sm"
                onClick={() => {
                  onSendFile?.()
                }}
              >
                {t('file_send')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel))] text-[rgb(var(--zc-muted))] shadow-sm transition hover:bg-[rgb(var(--zc-border)/0.6)] hover:text-[rgb(var(--zc-text))] disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
        >
          <span aria-hidden="true">📎</span>
          <span className="sr-only">{t('composer_attach')}</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
        />
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          className="max-h-36 min-h-[42px] w-full resize-none rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          className="h-9 rounded-md px-4 text-sm font-medium text-white shadow-sm transition-colors bg-indigo-600 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:text-white dark:bg-indigo-600 dark:hover:bg-indigo-700 dark:disabled:bg-[rgb(var(--zc-border))] dark:disabled:text-[rgb(var(--zc-muted))]"
        >
          {t('composer_send')}
        </button>
      </div>
      <p className="mt-2 text-xs text-[rgb(var(--zc-subtle))]">{t('composer_hint')}</p>
      {fileError ? (
        <p className="mt-1 text-xs text-rose-300">{fileError}</p>
      ) : null}
    </div>
  )
}
