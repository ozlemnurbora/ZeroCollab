import { useEffect } from 'react'
import { Button } from '../ui/Button.jsx'

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onCancel?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Confirm dialog'}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel?.()
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.96)] shadow-2xl">
        <div className="p-5">
          <p className="text-base font-semibold text-[rgb(var(--zc-text))]">
            {title || 'Confirm'}
          </p>
          {message ? (
            <p className="mt-2 text-sm text-[rgb(var(--zc-muted2))]">
              {message}
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[rgb(var(--zc-border))] p-4">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelText || 'Cancel'}
          </Button>
          <Button
            variant={danger ? 'danger' : undefined}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? '…' : confirmText || 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  )
}

