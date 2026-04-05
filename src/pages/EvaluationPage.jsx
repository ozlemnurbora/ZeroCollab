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
import { useLanguage } from '../utils/LanguageContext.jsx'
import { loadEvaluationCriteria } from '../utils/ontologyLoader.js'

const ANTHROPIC_API_KEY_STORAGE = 'zc-anthropic-key'

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID)
    return crypto.randomUUID()
  return `eval_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function criteriaStateFromRubric(rubric) {
  return rubric.reduce((acc, c) => {
    const min = c.min ?? 1
    const max = c.max ?? 20
    acc[c.id] = {
      score: clampScore(7, min, max),
      comments: '',
    }
    return acc
  }, {})
}

export function EvaluationPage() {
  const { t } = useLanguage()
  const [rubric, setRubric] = useState(RUBRIC)
  const [criteria, setCriteria] = useState(() => criteriaStateFromRubric(RUBRIC))
  const [isLoadingRubric, setIsLoadingRubric] = useState(true)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [apiKey, setApiKey] = useState(() =>
    typeof localStorage !== 'undefined'
      ? localStorage.getItem(ANTHROPIC_API_KEY_STORAGE) || ''
      : '',
  )
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)
  const [history, setHistory] = useState([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [hasLoadedHistory, setHasLoadedHistory] = useState(false)
  const [selectedHistory, setSelectedHistory] = useState(null)

  const rubricWithLabels = useMemo(() => {
    return rubric.map((c) => {
      const tk = `rubric_${c.id}`
      const tr = t(tk)
      const translated = tr !== tk ? tr : null
      return {
        ...c,
        label: translated ?? c.label,
      }
    })
  }, [rubric, t])

  useEffect(() => {
    loadEvaluationCriteria().then((criteriaFromOntology) => {
      if (criteriaFromOntology && criteriaFromOntology.length > 0) {
        setRubric(criteriaFromOntology)
        setCriteria(criteriaStateFromRubric(criteriaFromOntology))
      }
      setIsLoadingRubric(false)
    })
  }, [])

  useEffect(() => {
    if (!hasLoadedHistory) return
    void saveEvaluations(history)
  }, [history, hasLoadedHistory])

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

  const totals = useMemo(() => computeTotals(criteria, rubric), [criteria, rubric])

  const saveCurrent = () => {
    const createdAt = Date.now()
    const snapshot = {
      id: createId(),
      createdAt,
      criteria: rubric.reduce((acc, c) => {
        const min = c.min ?? 1
        const max = c.max ?? 20
        acc[c.id] = {
          score: clampScore(criteria[c.id]?.score ?? min, min, max),
          comments: criteria[c.id]?.comments ?? '',
        }
        return acc
      }, {}),
      ...totals,
    }

    setHistory((prev) => [snapshot, ...prev])
  }

  const runAiEvaluation = async () => {
    const key =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(ANTHROPIC_API_KEY_STORAGE)
        : null
    if (!key) {
      setShowApiKeyModal(true)
      return
    }
    setIsEvaluating(true)
    try {
      const criteriaText = rubric
        .map(
          (c) =>
            `- ${c.label} (${c.min ?? 1}-${c.max ?? 20} points): ${c.description || ''}`,
        )
        .join('\n')

      const scoresText = rubric
        .map((c) => {
          const max = c.max ?? 20
          return `- ${c.label}: ${criteria[c.id]?.score ?? c.min ?? 1}/${max} — "${criteria[c.id]?.comments || 'No feedback yet'}"`
        })
        .join('\n')

      const response = await fetch(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1500,
            messages: [
              {
                role: 'user',
                content: `You are an expert software engineering professor evaluating a capstone project called ZeroCollab — a P2P Project Management PWA built with React, WebRTC/PeerJS, IndexedDB, and OWL ontologies.

Evaluation criteria (from ontology):
${criteriaText}

Current scores and feedback:
${scoresText}

For each criterion:
1. Validate or adjust the score if needed
2. Write specific, evidence-based feedback (2-3 sentences)
3. Give one concrete improvement suggestion

IMPORTANT: Use exactly these criterion keys: ${rubric.map((c) => c.id).join(', ')}

Respond in this exact JSON format with no markdown or code blocks:
{
  "criteria": {
    "criterion_key": {
      "suggestedScore": number,
      "feedback": "string"
    }
  },
  "overallFeedback": "string"
}`,
              },
            ],
          }),
        },
      )

      const data = await response.json()
      console.log('[Evaluation] Anthropic response:', data)

      if (!response.ok) {
        throw new Error(`API error ${response.status}: ${JSON.stringify(data)}`)
      }

      const text = data.content?.[0]?.text || ''
      if (!text) throw new Error('Empty response from AI')

      const clean = text.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)

      if (parsed.criteria) {
        setCriteria((prev) => {
          const next = { ...prev }
          for (const [aiKey, val] of Object.entries(parsed.criteria)) {
            if (!val || typeof val !== 'object') continue

            const applyToKey = (targetKey) => {
              if (!next[targetKey] || !prev[targetKey]) return
              const crit = rubric.find((c) => c.id === targetKey)
              const min = crit?.min ?? 1
              const max = crit?.max ?? 20
              next[targetKey] = {
                score: clampScore(
                  val.suggestedScore ?? prev[targetKey].score,
                  min,
                  max,
                ),
                comments: val.feedback ?? prev[targetKey].comments,
              }
            }

            if (next[aiKey]) {
              applyToKey(aiKey)
              continue
            }
            const matchedKey = Object.keys(next).find(
              (k) =>
                k.toLowerCase().includes(aiKey.toLowerCase()) ||
                aiKey.toLowerCase().includes(k.toLowerCase()) ||
                k.toLowerCase().replace(/_/g, '') ===
                  aiKey.toLowerCase().replace(/_/g, ''),
            )
            if (matchedKey) applyToKey(matchedKey)
          }
          return next
        })
      }
      if (parsed?.overallFeedback) {
        alert(parsed.overallFeedback)
      }
    } catch (err) {
      console.error('[Evaluation] Full error:', err)
      alert(`AI evaluation failed: ${err.message}`)
    } finally {
      setIsEvaluating(false)
    }
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight text-[rgb(var(--zc-text))] sm:text-3xl">
        {t('page_evaluation_title')}
      </h1>
      <p className="mt-2 text-sm text-[rgb(var(--zc-muted))] sm:text-base">
        {t('page_evaluation_subtitle')}
      </p>

      {isLoadingHistory ? (
        <div className="mt-6 rounded-xl border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-6 text-sm text-[rgb(var(--zc-muted2))]">
          {t('loading_eval_history')}
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
                {t('eval_rubric')}
              </h2>
              <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                {t('eval_rubric_sub')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={runAiEvaluation}
                disabled={isEvaluating || isLoadingRubric}
              >
                {isEvaluating ? t('eval_ai_loading') : t('eval_ai')}
              </Button>
              <Button onClick={saveCurrent} disabled={isLoadingRubric}>
                {t('eval_save')}
              </Button>
            </div>
          </div>

          {isLoadingRubric ? (
            <div className="rounded-xl border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-6 text-sm text-[rgb(var(--zc-muted2))]">
              {t('loading_rubric')}
            </div>
          ) : (
            <div className="grid gap-4">
              {rubricWithLabels.map((criterion) => (
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
          )}
        </div>

        <div className="space-y-6">
          <EvaluationHistory
            items={history}
            onSelect={(e) => setSelectedHistory(e)}
          />
          <div className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)] p-4">
            <p className="text-sm font-semibold text-[rgb(var(--zc-text))]">
              {t('eval_notes_title')}
            </p>
            <p className="mt-2 text-sm text-[rgb(var(--zc-muted))]">
              {t('eval_notes_body')}
            </p>
          </div>
        </div>
      </div>

      <Modal
        open={!!selectedHistory}
        onClose={() => setSelectedHistory(null)}
        title={t('eval_snapshot_title')}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setSelectedHistory(null)}>
              {t('modal_close')}
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
              {rubricWithLabels.map((c) => {
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
                        {t('eval_no_feedback')}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
        title={t('eval_api_key_title')}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowApiKeyModal(false)}>
              {t('btn_cancel')}
            </Button>
            <Button
              onClick={() => {
                if (typeof localStorage !== 'undefined') {
                  localStorage.setItem(ANTHROPIC_API_KEY_STORAGE, apiKey)
                }
                setShowApiKeyModal(false)
              }}
            >
              {t('btn_save')}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-[rgb(var(--zc-muted))]">
            Enter your Anthropic API key. Get one at console.anthropic.com
          </p>
          <input
            type="password"
            className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            placeholder="sk-ant-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
      </Modal>
    </section>
  )
}
