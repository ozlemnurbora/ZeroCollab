import { formatEvalDate } from './evaluationUtils.js'
import { useLanguage } from '../../utils/LanguageContext.jsx'

const DEFAULT_GRADE = { label: 'F', name: 'Insufficient' }

export function EvaluationHistory({ items, onSelect, resolveGrade }) {
  const { t, locale } = useLanguage()

  return (
    <section className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)]">
      <header className="border-b border-[rgb(var(--zc-border))] px-4 py-3">
        <h2 className="text-sm font-semibold text-[rgb(var(--zc-text))]">
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
              const g = resolveGrade
                ? resolveGrade(e.percentage ?? 0)
                : DEFAULT_GRADE
              return (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[rgb(var(--zc-text))]">
                      {formatEvalDate(e.createdAt, locale)}
                    </p>
                    <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                      {e.total} / {e.max} • {pct}%
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelect?.(e)}
                    className="inline-flex items-center gap-2 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.4)] px-3 py-1.5 text-xs font-medium text-[rgb(var(--zc-muted))] hover:bg-[rgb(var(--zc-panel)/0.7)]"
                  >
                    <span className="rounded-md bg-[rgb(var(--zc-bg)/0.4)] px-2 py-1 text-[11px] font-semibold text-[rgb(var(--zc-text))] ring-1 ring-inset ring-[rgb(var(--zc-border))]">
                      {g.label}
                    </span>
                    {t('eval_view')}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
