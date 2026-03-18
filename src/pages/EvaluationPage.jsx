import { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button.jsx'
import { Modal } from '../components/ui/Modal.jsx'
import { CriterionCard } from '../components/evaluation/CriterionCard.jsx'
import { EvaluationHistory } from '../components/evaluation/EvaluationHistory.jsx'
import { EvaluationSummary } from '../components/evaluation/EvaluationSummary.jsx'
import { RUBRIC } from '../components/evaluation/evaluationConstants.js'
import {
  loadEvaluations,
  saveEvaluations,
} from '../components/evaluation/evaluationStorage.js'
import { clampScore, computeTotals } from '../components/evaluation/evaluationUtils.js'

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID)
    return crypto.randomUUID()
  return `eval_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function defaultCriteriaState() {
  return RUBRIC.reduce((acc, c) => {
    acc[c.id] = { score: 7, comments: '' }
    return acc
  }, {})
}

export function EvaluationPage() {
  const [criteria, setCriteria] = useState(() => defaultCriteriaState())
  const [history, setHistory] = useState([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [hasLoadedHistory, setHasLoadedHistory] = useState(false)
  const [selectedHistory, setSelectedHistory] = useState(null)

  useEffect(() => {
    if (!hasLoadedHistory) return
    void saveEvaluations(history)
  }, [history])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setIsLoadingHistory(true)
      const existing = await loadEvaluations()
      if (cancelled) return
      setHistory(Array.isArray(existing) ? existing : [])
      setHasLoadedHistory(true)
      setIsLoadingHistory(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const totals = useMemo(() => computeTotals(criteria), [criteria])

  const saveCurrent = () => {
    const createdAt = Date.now()
    const snapshot = {
      id: createId(),
      createdAt,
      criteria: RUBRIC.reduce((acc, c) => {
        acc[c.id] = {
          score: clampScore(criteria[c.id]?.score ?? 1, 1, c.max ?? 10),
          comments: criteria[c.id]?.comments ?? '',
        }
        return acc
      }, {}),
      ...totals,
    }

    setHistory((prev) => [snapshot, ...prev])
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight text-[rgb(var(--zc-text))] sm:text-3xl">
        Evaluation
      </h1>
      <p className="mt-2 text-sm text-[rgb(var(--zc-muted))] sm:text-base">
        Rubric-based project assessment with saved history.
      </p>

      {isLoadingHistory ? (
        <div className="mt-6 rounded-xl border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-6 text-sm text-[rgb(var(--zc-muted2))]">
          Loading evaluation history…
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <EvaluationSummary
            total={totals.total}
            max={totals.max}
            percentage={totals.percentage}
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[rgb(var(--zc-text))]">
                Rubric
              </h2>
              <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                Provide scores and written feedback for each criterion.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() =>
                  alert(
                    'AI evaluation coming soon - will integrate with LLM API',
                  )
                }
              >
                Evaluate with AI
              </Button>
              <Button onClick={saveCurrent}>Save evaluation</Button>
            </div>
          </div>

          <div className="grid gap-4">
            {RUBRIC.map((criterion) => (
              <CriterionCard
                key={criterion.id}
                criterion={criterion}
                value={criteria[criterion.id]}
                onChange={(next) =>
                  setCriteria((prev) => ({ ...prev, [criterion.id]: next }))
                }
              />
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <EvaluationHistory
            items={history}
            onSelect={(e) => setSelectedHistory(e)}
          />
          <div className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)] p-4">
            <p className="text-sm font-semibold text-[rgb(var(--zc-text))]">
              Academic notes
            </p>
            <p className="mt-2 text-sm text-[rgb(var(--zc-muted))]">
              Write feedback that is specific, evidence-based, and actionable.
              Where possible, reference concrete examples and suggestions for improvement.
            </p>
          </div>
        </div>
      </div>

      <Modal
        open={!!selectedHistory}
        onClose={() => setSelectedHistory(null)}
        title="Evaluation snapshot"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setSelectedHistory(null)}>
              Close
            </Button>
          </div>
        }
      >
        {selectedHistory ? (
          <div className="space-y-4">
            <EvaluationSummary
              total={selectedHistory.total}
              max={selectedHistory.max}
              percentage={selectedHistory.percentage}
            />
            <div className="space-y-3">
              {RUBRIC.map((c) => {
                const v = selectedHistory.criteria?.[c.id]
                return (
                  <div
                    key={c.id}
                    className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-[rgb(var(--zc-text))]">
                        {c.label}
                      </p>
                      <span className="rounded-md bg-[rgb(var(--zc-bg)/0.4)] px-2 py-1 text-xs text-[rgb(var(--zc-muted))] ring-1 ring-inset ring-[rgb(var(--zc-border))]">
                        {v?.score ?? 0} / {c.max ?? 10}
                      </span>
                    </div>
                    {v?.comments ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-[rgb(var(--zc-muted))]">
                        {v.comments}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-[rgb(var(--zc-subtle))]">
                        No written feedback.
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  )
}

