import { clampScore } from './evaluationUtils.js'
import { useLanguage } from '../../utils/LanguageContext.jsx'

function ScoreBar({ score, max }) {
  const pct = max > 0 ? Math.min(1, Math.max(0, score / max)) : 0
  const filled = Math.round(pct * 10)
  const tone =
    pct >= 0.7
      ? 'bg-emerald-500'
      : pct >= 0.4
        ? 'bg-amber-500'
        : 'bg-rose-500'

  return (
    <div
      className="flex w-full items-center gap-1"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={score}
    >
      {Array.from({ length: 10 }).map((_, i) => {
        const isFilled = i < filled
        return (
          <div
            key={i}
            className={[
              'h-2.5 flex-1 rounded-sm transition-colors',
              isFilled ? tone : 'bg-[rgb(var(--zc-border)/0.6)]',
            ].join(' ')}
          />
        )
      })}
    </div>
  )
}

export function CriterionCard({ criterion, value, onChange }) {
  const { t } = useLanguage()
  const min = criterion.min ?? 1
  const max = criterion.max ?? 10
  const notApplicable = value?.applicable === false
  const raw = value?.score
  const score = raw === undefined || raw === null ? 0 : Number(raw)
  const comments = value?.comments ?? ''
  const label = criterion.label ?? t(`rubric_${criterion.id}`)
  const description = criterion.description
  const unevaluated = !Number.isFinite(score) || score === 0
  const clamped = unevaluated ? min : clampScore(score, min, max)
  const displayScore = unevaluated ? 0 : clamped

  return (
    <section className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)]">
      <header className="border-b border-[rgb(var(--zc-border))] px-4 py-3">
        <h3 className="text-sm font-semibold text-[rgb(var(--zc-text))]">{label}</h3>
        {description ? (
          <p className="mt-1 text-xs text-[rgb(var(--zc-muted))]">{description}</p>
        ) : null}
        {notApplicable ? (
          <p className="mt-2">
            <span className="inline-flex rounded-md bg-[rgb(var(--zc-panel))] px-2.5 py-1 text-xs font-medium text-[rgb(var(--zc-muted))] ring-1 ring-inset ring-[rgb(var(--zc-border))]">
              {t('eval_not_applicable')}
            </span>
          </p>
        ) : (
          <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
            {t('eval_score_range', { min, max })}
          </p>
        )}
      </header>

      <div className="px-4 py-4">
        {notApplicable ? null : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <ScoreBar score={displayScore} max={max} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-medium text-[rgb(var(--zc-muted2))]">
                {t('eval_score_label')}
              </label>
              <input
                type="number"
                min={0}
                max={max}
                value={displayScore}
                disabled
                readOnly
                aria-readonly="true"
                tabIndex={-1}
                className="h-9 w-20 cursor-not-allowed rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 text-sm text-[rgb(var(--zc-text))] opacity-70"
              />
              <span className="text-xs text-[rgb(var(--zc-subtle))]">/ {max}</span>
              <span className="text-[11px] font-medium text-[rgb(var(--zc-muted))]">
                {t('eval_set_by_ai')}
              </span>
            </div>
          </div>
        )}

        <div className={notApplicable ? '' : 'mt-4'}>
          <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
            {t('eval_feedback')}
          </label>
          <textarea
            value={comments}
            onChange={(e) =>
              onChange?.(
                notApplicable
                  ? {
                      ...value,
                      score: null,
                      comments: e.target.value,
                      applicable: false,
                    }
                  : {
                      ...value,
                      score: displayScore,
                      comments: e.target.value,
                      applicable: true,
                    },
              )
            }
            placeholder={t('eval_feedback_placeholder')}
            className="mt-1 min-h-[96px] w-full resize-y rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
        </div>
      </div>
    </section>
  )
}
