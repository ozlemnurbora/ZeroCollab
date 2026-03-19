import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/Button.jsx'

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
      setFileError('Maximum file size is 50MB.')
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
      setFileError('Maximum file size is 50MB.')
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
                  FILE
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-[rgb(var(--zc-text))]">
                  {pendingFile.file.name}
                </p>
                <p className="mt-0.5 text-[11px] text-[rgb(var(--zc-subtle))]">
                  {(pendingFile.file.size / (1024 * 1024)).toFixed(2)} MB •{' '}
                  {pendingFile.file.type || 'Unknown type'}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="rounded-md bg-[rgb(var(--zc-bg)/0.8)] px-2 py-1 text-[11px] font-medium text-[rgb(var(--zc-muted))] ring-1 ring-inset ring-[rgb(var(--zc-border))] hover:bg-[rgb(var(--zc-panel)/0.8)]"
                onClick={onCancelFile}
              >
                Cancel
              </button>
              <Button
                size="sm"
                onClick={() => {
                  onSendFile?.()
                }}
              >
                Send file
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] text-[rgb(var(--zc-muted2))] hover:bg-[rgb(var(--zc-panel))]"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
        >
          <span aria-hidden="true">📎</span>
          <span className="sr-only">Attach file</span>
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
        <Button onClick={send} disabled={!canSend}>
          Send
        </Button>
      </div>
      <p className="mt-2 text-xs text-[rgb(var(--zc-subtle))]">
        Press Enter to send • Shift+Enter for a new line • Drag &amp; drop to attach
      </p>
      {fileError ? (
        <p className="mt-1 text-xs text-rose-300">
          {fileError}
        </p>
      ) : null}
    </div>
  )
}

