import { useEffect } from 'react'

export function Modal({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onMouseDown={onClose}
        aria-hidden="true"
      />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg))] shadow-xl shadow-black/40"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-[rgb(var(--zc-border))] px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-[rgb(var(--zc-text))]">
                {title}
              </h2>
            </div>
            <button
              type="button"
              className="rounded-md p-1 text-[rgb(var(--zc-muted2))] hover:bg-[rgb(var(--zc-border))] hover:text-[rgb(var(--zc-text))]"
              onClick={onClose}
            >
              <span className="sr-only">Close</span>✕
            </button>
          </div>

          <div className="min-h-0 overflow-y-auto px-5 py-4">{children}</div>

          {footer ? (
            <div className="border-t border-[rgb(var(--zc-border))] px-5 py-4">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

