import { useState } from 'react'
import { formatEvalDate } from './evaluationUtils.js'
import { useLanguage } from '../../utils/LanguageContext.jsx'
import { Modal } from '../ui/Modal.jsx'

const DEFAULT_GRADE = { label: 'F', name: 'Insufficient' }

const scoreTint = (pct) => {
  if (pct >= 80)
    return {
      badge:
        'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 dark:text-emerald-300',
      stripe: 'bg-emerald-400',
    }
  if (pct >= 60)
    return {
      badge:
        'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 dark:text-indigo-300',
      stripe: 'bg-indigo-400',
    }
  if (pct >= 40)
    return {
      badge:
        'bg-amber-500/15 text-amber-300 border border-amber-500/30 dark:text-amber-300',
      stripe: 'bg-amber-400',
    }
  return {
    badge: 'bg-rose-500/15 text-rose-300 border border-rose-500/30 dark:text-rose-300',
    stripe: 'bg-rose-400',
  }
}

export function EvaluationHistory({ items, onView, onDelete, resolveGrade }) {
  const { t, locale } = useLanguage()
  const [pendingDelete, setPendingDelete] = useState(null)

  return (
    <>
    <section className="min-w-0 max-w-full overflow-hidden rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)]">
      <div
        className="-mx-px -mt-px h-0.5 rounded-t bg-gradient-to-r from-indigo-500/60 via-fuchsia-500/60 to-emerald-500/60"
        aria-hidden="true"
      />
      <header className="border-b border-[rgb(var(--zc-border))] px-4 py-3">
        <h2 className="bg-gradient-to-r from-indigo-500 to-fuchsia-500 bg-clip-text text-base font-semibold text-transparent">
          {t('eval_history')}
        </h2>
        <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">{t('eval_history_sub')}</p>
      </header>

      <div className="px-4 py-3">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] p-4 text-sm text-[rgb(var(--zc-muted2))]">
            {t('eval_none')}
          </div>
        ) : (
          <ul className="divide-y divide-[rgb(var(--zc-border))]">
            {items.map((e) => {
              const pct = Math.round(e.percentage ?? 0)
              const g = resolveGrade ? resolveGrade(e.percentage ?? 0) : DEFAULT_GRADE
              const tint = scoreTint(pct)
              return (
                <li key={e.id} className="relative">
                  <span
                    className={`pointer-events-none absolute bottom-2 left-0 top-2 w-1 rounded-r-full ${tint.stripe}`}
                    aria-hidden="true"
                  />
                  <div className="flex min-w-0 items-start gap-3 py-3 pl-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[rgb(var(--zc-text))]">
                        {formatEvalDate(e.createdAt, locale)}
                        {e.authorName ? (
                          <span className="ml-2 text-xs text-[rgb(var(--zc-subtle))]">
                            by {e.authorName}
                          </span>
                        ) : null}
                      </p>
                      {Array.isArray(e.uploadedFiles) && e.uploadedFiles.length > 0 ? (
                        <p
                          className="mt-0.5 max-w-[240px] truncate text-xs text-[rgb(var(--zc-subtle))]"
                          title={e.uploadedFiles.join(', ')}
                        >
                          {e.uploadedFiles[0]}
                          {e.uploadedFiles.length > 1
                            ? ` + ${e.uploadedFiles.length - 1} more`
                            : ''}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                        {e.total} / {e.max} • {pct}%
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onView?.(e)}
                        className="inline-flex items-center gap-2 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.4)] px-3 py-1.5 text-xs font-medium text-[rgb(var(--zc-muted))] hover:bg-[rgb(var(--zc-panel)/0.7)]"
                      >
                        <span
                          className={`rounded-md px-2 py-1 text-[11px] font-semibold ${tint.badge}`}
                        >
                          {g.label}
                        </span>
                        {t('eval_view')}
                      </button>
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          setPendingDelete(e)
                        }}
                        aria-label="Delete evaluation"
                        title="Delete"
                        className="rounded-md p-1.5 text-[rgb(var(--zc-muted))] transition hover:bg-rose-500/15 hover:text-rose-500"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                          <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>

    {pendingDelete ? (
      <Modal
        open
        onClose={() => setPendingDelete(null)}
        title="Delete evaluation?"
      >
        <div className="space-y-4">
          <p className="text-sm text-[rgb(var(--zc-text))]">
            Are you sure you want to delete this evaluation? This action cannot be undone.
          </p>
          {pendingDelete?.uploadedFiles?.[0] ? (
            <p className="text-xs text-[rgb(var(--zc-muted))]">
              Submission: {pendingDelete.uploadedFiles[0]}
              {pendingDelete.uploadedFiles.length > 1
                ? ` + ${pendingDelete.uploadedFiles.length - 1} more`
                : ''}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              className="rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-1.5 text-sm font-medium text-[rgb(var(--zc-text))] hover:bg-[rgb(var(--zc-panel))]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const target = pendingDelete
                setPendingDelete(null)
                onDelete?.(target)
              }}
              className="rounded-md bg-rose-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-600"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>
    ) : null}
    </>
  )
}
