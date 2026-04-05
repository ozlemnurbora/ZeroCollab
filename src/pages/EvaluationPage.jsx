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
import {
  loadEvaluationCriteria,
  loadGradeThresholds,
} from '../utils/ontologyLoader.js'

const ANTHROPIC_API_KEY_STORAGE = 'zc-anthropic-key'

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID)
    return crypto.randomUUID()
  return `eval_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function criteriaStateFromRubric(rubric) {
  return rubric.reduce((acc, c) => {
    acc[c.id] = {
      score: c.defaultScore ?? 0,
      comments: '',
      applicable: true,
    }
    return acc
  }, {})
}

function resolveCriterionKey(prev, aiKey) {
  if (prev[aiKey] !== undefined) return aiKey
  return (
    Object.keys(prev).find(
      (k) =>
        k.toLowerCase().includes(aiKey.toLowerCase()) ||
        aiKey.toLowerCase().includes(k.toLowerCase()) ||
        k.toLowerCase().replace(/_/g, '') ===
          aiKey.toLowerCase().replace(/_/g, ''),
    ) ?? aiKey
  )
}

/** Merge AI JSON `criteria` (applicable / suggestedScore / feedback) into criterion state. */
function mergeAiCriteriaResponse(prev, parsedCriteria, rubricRef) {
  const next = { ...prev }
  if (!parsedCriteria || typeof parsedCriteria !== 'object') return next

  for (const [aiKey, val] of Object.entries(parsedCriteria)) {
    if (!val || typeof val !== 'object') continue
    const matchedKey = resolveCriterionKey(prev, aiKey)
    if (next[matchedKey] === undefined) continue

    const crit = rubricRef.find((c) => c.id === matchedKey)
    const min = crit?.min ?? 1
    const max = crit?.max ?? 20
    const applicable = val.applicable !== false

    let score
    if (!applicable) {
      score = null
    } else if (
      val.suggestedScore != null &&
      val.suggestedScore !== '' &&
      Number.isFinite(Number(val.suggestedScore))
    ) {
      score = clampScore(val.suggestedScore, min, max)
    } else {
      const prevScore = prev[matchedKey]?.score
      score =
        prevScore === null || prevScore === undefined
          ? 0
          : clampScore(prevScore, min, max)
    }

    next[matchedKey] = {
      score,
      comments: val.feedback ?? prev[matchedKey]?.comments ?? '',
      applicable,
    }
  }
  return next
}

export function EvaluationPage() {
  const { t } = useLanguage()
  const [rubric, setRubric] = useState(RUBRIC)
  const [criteria, setCriteria] = useState(() => criteriaStateFromRubric(RUBRIC))
  /** Scores shown in summary: defaults until AI evaluation completes, then last AI scores only. */
  const [displayCriteria, setDisplayCriteria] = useState(() =>
    criteriaStateFromRubric(RUBRIC),
  )
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
  const [projectInfo, setProjectInfo] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [fileContents, setFileContents] = useState('')
  const [gradeThresholds, setGradeThresholds] = useState(null)

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
    void loadGradeThresholds().then((grades) => {
      if (grades) setGradeThresholds(grades)
    })
    loadEvaluationCriteria().then((criteriaFromOntology) => {
      const fromOntology =
        Array.isArray(criteriaFromOntology) && criteriaFromOntology.length > 0
      const effective = fromOntology ? criteriaFromOntology : RUBRIC
      const source = fromOntology
        ? 'ontology (/ontology/zerocollab-evaluation.ttl)'
        : criteriaFromOntology == null
          ? 'fallback: loadEvaluationCriteria() returned null or failed'
          : 'fallback: empty criteria array — using RUBRIC constant'

      // eslint-disable-next-line no-console
      console.log('[Evaluation] Rubric loaded:', {
        source,
        count: effective.length,
        criteria: effective,
      })

      setRubric(effective)
      const initial = criteriaStateFromRubric(effective)
      setCriteria(initial)
      setDisplayCriteria(initial)
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

  const summaryTotals = useMemo(
    () => computeTotals(displayCriteria, rubric),
    [displayCriteria, rubric],
  )

  const snapshotTotals = useMemo(
    () => computeTotals(criteria, rubric),
    [criteria, rubric],
  )

  const getGrade = (percentage) => {
    if (!gradeThresholds || gradeThresholds.length === 0) {
      if (percentage >= 90) return { label: 'A', name: 'Excellent' }
      if (percentage >= 85) return { label: 'A-', name: 'Excellent' }
      if (percentage >= 80) return { label: 'B+', name: 'Strong' }
      if (percentage >= 75) return { label: 'B', name: 'Strong' }
      if (percentage >= 70) return { label: 'B-', name: 'Strong' }
      if (percentage >= 65) return { label: 'C+', name: 'Satisfactory' }
      if (percentage >= 60) return { label: 'C', name: 'Satisfactory' }
      if (percentage >= 55) return { label: 'C-', name: 'Satisfactory' }
      if (percentage >= 50) return { label: 'D+', name: 'Needs Improvement' }
      if (percentage >= 45) return { label: 'D', name: 'Needs Improvement' }
      if (percentage >= 40) return { label: 'D-', name: 'Needs Improvement' }
      return { label: 'F', name: 'Insufficient' }
    }
    const threshold = gradeThresholds.find((g) => percentage >= g.minPercentage)
    return threshold || { label: 'F', name: 'Insufficient' }
  }

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    setUploadedFiles(files.map((f) => f.name))

    const contents = []

    for (const file of files) {
      if (file.name.toLowerCase().endsWith('.zip')) {
        try {
          const JSZip = (await import('jszip')).default
          const zip = await JSZip.loadAsync(file)
          const zipContents = []

          const textExtensions = [
            '.js',
            '.jsx',
            '.ts',
            '.tsx',
            '.html',
            '.css',
            '.json',
            '.md',
            '.txt',
            '.py',
            '.ttl',
          ]

          const filePromises = []
          zip.forEach((relativePath, zipEntry) => {
            if (!zipEntry.dir) {
              const lastDot = relativePath.lastIndexOf('.')
              const ext =
                lastDot >= 0
                  ? `.${relativePath.slice(lastDot + 1).toLowerCase()}`
                  : ''
              if (
                textExtensions.includes(ext) &&
                !relativePath.includes('node_modules') &&
                !relativePath.includes('.git')
              ) {
                filePromises.push(
                  zipEntry
                    .async('text')
                    .then((content) => {
                      const truncated =
                        content.length > 1500
                          ? `${content.slice(0, 1500)}...[truncated]`
                          : content
                      zipContents.push(`\n=== ${relativePath} ===\n${truncated}`)
                    })
                    .catch(() => {}),
                )
              }
            }
          })

          await Promise.all(filePromises)

          const allZipContent = zipContents.join('\n')
          const limitedContent =
            allZipContent.length > 15000
              ? `${allZipContent.slice(0, 15000)}\n...[content truncated to fit AI context]`
              : allZipContent

          contents.push(`\n\n=== ZIP: ${file.name} ===\n${limitedContent}`)
        } catch (err) {
          console.error('ZIP read error:', err)
          contents.push(`[ZIP file: ${file.name} - could not read contents]`)
        }
      } else {
        try {
          const text = await file.text()
          const truncated =
            text.length > 2000
              ? `${text.slice(0, 2000)}...[truncated]`
              : text
          contents.push(`\n\n=== FILE: ${file.name} ===\n${truncated}`)
        } catch {
          contents.push(`[Binary file: ${file.name}]`)
        }
      }
    }
    setFileContents(contents.join('\n'))
  }

  const saveCurrent = () => {
    const createdAt = Date.now()
    const snapshot = {
      id: createId(),
      createdAt,
      criteria: rubric.reduce((acc, c) => {
        const min = c.min ?? 1
        const max = c.max ?? 20
        const entry = criteria[c.id]
        const applicable = entry?.applicable !== false
        const raw = entry?.score
        let score
        if (!applicable) {
          score = null
        } else if (raw === null || raw === undefined) {
          score = 0
        } else {
          score = clampScore(raw, min, max)
        }
        acc[c.id] = {
          score,
          comments: entry?.comments ?? '',
          applicable,
        }
        return acc
      }, {}),
      ...snapshotTotals,
    }

    setHistory((prev) => [snapshot, ...prev])
  }

  const runAiEvaluation = async () => {
    const projectContext = `
${projectInfo.trim() ? `Project Description:\n${projectInfo.trim()}\n` : ''}
${fileContents.trim() ? `\nProject Code Files:\n${fileContents.trim()}` : ''}
`.trim()

    if (!projectContext) {
      alert(t('eval_no_project'))
      return
    }

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

      const promptContent = `You are an expert software engineering professor evaluating a student project.

First, analyze the submitted project and determine which criteria are applicable.
If a criterion is not relevant to this project, mark it as not applicable.

Project files:
${projectContext}

Rubric criteria (from ontology):
${criteriaText}

For each criterion:
- If the criterion IS applicable: give a score and specific feedback
- If the criterion is NOT applicable: set applicable to false, suggestedScore to null

IMPORTANT rules:
- Non-applicable criteria must NOT count toward the total score
- Only score criteria that are relevant to the actual project
- Scores must vary based on actual quality, do not give same score to all

Use exactly these criterion keys: ${rubric.map((c) => c.id).join(', ')}

Respond in this exact JSON format with no markdown or code blocks (use double quotes for all keys and string values):
{
  "criteria": {
    "criterion_key": {
      "applicable": true,
      "suggestedScore": 12,
      "feedback": "string"
    }
  },
  "overallFeedback": "string"
}

For non-applicable criteria use: "applicable": false, "suggestedScore": null, and briefly explain why in "feedback".`

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
            max_tokens: 2800,
            messages: [
              {
                role: 'user',
                content: promptContent,
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
        setCriteria((prev) =>
          mergeAiCriteriaResponse(prev, parsed.criteria, rubric),
        )
        setDisplayCriteria((prev) =>
          mergeAiCriteriaResponse(prev, parsed.criteria, rubric),
        )
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
            total={summaryTotals.total}
            max={summaryTotals.max}
            percentage={summaryTotals.percentage}
            grade={getGrade(summaryTotals.percentage)}
          />

          <div className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)] p-4">
            <h2 className="text-sm font-semibold text-[rgb(var(--zc-text))]">
              {t('eval_project_label')}
            </h2>
            <p className="mt-1 text-xs text-[rgb(var(--zc-muted))]">
              {t('eval_project_hint')}
            </p>
            <textarea
              className="mt-3 min-h-[100px] w-full resize-y rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              placeholder={t('eval_project_placeholder')}
              value={projectInfo}
              onChange={(e) => setProjectInfo(e.target.value)}
              disabled={isLoadingRubric}
            />
            <div className="mt-3">
              <label className="mb-2 block text-sm font-medium text-[rgb(var(--zc-muted))]">
                {t('eval_upload_label')}
              </label>
              <input
                type="file"
                multiple
                accept=".js,.jsx,.ts,.tsx,.html,.css,.json,.md,.txt,.py,.zip"
                onChange={(ev) => void handleFileUpload(ev)}
                disabled={isLoadingRubric}
                className="block w-full cursor-pointer text-sm text-[rgb(var(--zc-muted))] file:mr-4 file:rounded-md file:border-0 file:bg-indigo-500/20 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-300 hover:file:bg-indigo-500/30"
              />
              {uploadedFiles.length > 0 ? (
                <p className="mt-1 text-xs text-emerald-400">
                  {uploadedFiles.length} file(s) loaded:{' '}
                  {uploadedFiles.join(', ')}
                </p>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={isEvaluating || isLoadingRubric}
                onClick={() => void runAiEvaluation()}
              >
                {isEvaluating ? t('eval_ai_loading') : t('eval_submit_project')}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[rgb(var(--zc-text))]">
                {t('eval_rubric')}
              </h2>
              <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                {t('eval_rubric_sub')}
              </p>
              <p className="mt-2 text-xs text-[rgb(var(--zc-muted))]">
                {t('eval_scores_ai_hint')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => void runAiEvaluation()}
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
            resolveGrade={getGrade}
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
              grade={getGrade(selectedHistory.percentage ?? 0)}
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
                        {v?.applicable === false ? (
                          <span className="text-[rgb(var(--zc-subtle))]">
                            {t('eval_not_applicable')}
                          </span>
                        ) : (
                          <>
                            {v?.score ?? 0} / {c.max ?? 10}
                          </>
                        )}
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
