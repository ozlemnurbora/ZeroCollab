import { useLanguage } from '../../utils/LanguageContext.jsx'

function gradeColor(label) {
  const base = String(label ?? 'F').charAt(0)
  if (base === 'A') return 'text-emerald-200 ring-emerald-500/30 bg-emerald-500/10'
  if (base === 'B') return 'text-indigo-200 ring-indigo-500/30 bg-indigo-500/10'
  if (base === 'C') return 'text-amber-200 ring-amber-500/30 bg-amber-500/10'
  if (base === 'D') return 'text-orange-200 ring-orange-500/30 bg-orange-500/10'
  return 'text-rose-200 ring-rose-500/30 bg-rose-500/10'
}

const DEFAULT_GRADE = { label: 'F', name: 'Insufficient' }

export function EvaluationSummary({ total, max, percentage, grade }) {
  const { t } = useLanguage()
  const pct = Math.max(0, Math.min(100, Math.round(percentage)))
  const g = grade && grade.label != null ? grade : DEFAULT_GRADE

  return (
    <section className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)]">
      <header className="border-b border-[rgb(var(--zc-border))] px-4 py-3">
        <h2 className="text-sm font-semibold text-[rgb(var(--zc-text))]">
          {t('eval_summary')}
        </h2>
        <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">{t('eval_summary_sub')}</p>
      </header>

      <div className="px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium text-[rgb(var(--zc-muted2))]">
              {t('eval_total_score')}
            </p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-[rgb(var(--zc-text))]">
              {total}
              <span className="text-base font-medium text-[rgb(var(--zc-subtle))]">
                {' '}
                / {max}
              </span>
            </p>
            <p className="mt-1 text-sm text-[rgb(var(--zc-muted))]">
              {t('eval_overall', { pct })}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={[
                'inline-flex items-center rounded-md px-3 py-1.5 text-sm font-semibold ring-1 ring-inset',
                gradeColor(g.label),
              ].join(' ')}
            >
              {g.label}
            </span>
            <span className="text-sm text-[rgb(var(--zc-muted))]">{g.name}</span>
          </div>
        </div>

        <div className="mt-4">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-[rgb(var(--zc-panel))] ring-1 ring-inset ring-[rgb(var(--zc-border))]">
            <div
              className="h-full rounded-full bg-indigo-500/70"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-[rgb(var(--zc-subtle))]">
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>
      </div>
    </section>
  )
}
