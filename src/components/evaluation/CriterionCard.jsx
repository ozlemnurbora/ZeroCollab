import { clampScore } from './evaluationUtils.js'

export function CriterionCard({ criterion, value, onChange }) {
  const score = value?.score ?? 7
  const comments = value?.comments ?? ''
  const max = criterion.max ?? 10

  return (
    <section className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)]">
      <header className="border-b border-[rgb(var(--zc-border))] px-4 py-3">
        <h3 className="text-sm font-semibold text-[rgb(var(--zc-text))]">
          {criterion.label}
        </h3>
        <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
          Score from 1 to {max}
        </p>
      </header>

      <div className="px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <input
              type="range"
              min={1}
              max={max}
              value={score}
              onChange={(e) =>
                onChange?.({
                  score: clampScore(e.target.value, 1, max),
                  comments,
                })
              }
              className="w-full accent-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-[rgb(var(--zc-muted2))]">
              Score
            </label>
            <input
              type="number"
              min={1}
              max={max}
              value={score}
              onChange={(e) =>
                onChange?.({
                  score: clampScore(e.target.value, 1, max),
                  comments,
                })
              }
              className="h-9 w-20 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
            <span className="text-xs text-[rgb(var(--zc-subtle))]">
              / {max}
            </span>
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
            Feedback
          </label>
          <textarea
            value={comments}
            onChange={(e) =>
              onChange?.({
                score: clampScore(score, 1, max),
                comments: e.target.value,
              })
            }
            placeholder="Write concise, actionable feedback. Reference evidence where possible."
            className="mt-1 min-h-[96px] w-full resize-y rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
        </div>
      </div>
    </section>
  )
}

