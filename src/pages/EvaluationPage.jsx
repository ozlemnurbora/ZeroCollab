import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button.jsx'
import { Modal } from '../components/ui/Modal.jsx'
import { EvaluationHistory } from '../components/evaluation/EvaluationHistory.jsx'
import { EvaluationSummary } from '../components/evaluation/EvaluationSummary.jsx'
import {
  loadEvaluations,
  saveEvaluations,
} from '../components/evaluation/evaluationStorage.js'
import { useLanguage } from '../utils/LanguageContext.jsx'
import { loadOntologyText, loadGradeThresholds } from '../utils/ontologyLoader.js'

const ANTHROPIC_API_KEY_STORAGE = 'zc-anthropic-key'

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID)
    return crypto.randomUUID()
  return `eval_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function EvaluationPage() {
  const { t } = useLanguage()
  const [aiCriteria, setAiCriteria] = useState([])
  const [ontologyText, setOntologyText] = useState('')
  const [totalScore, setTotalScore] = useState(null)
  const [overallFeedback, setOverallFeedback] = useState('')
  const [hasEvaluated, setHasEvaluated] = useState(false)
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

  useEffect(() => {
    loadOntologyText().then((text) => {
      if (text) setOntologyText(text)
    })
    loadGradeThresholds().then((grades) => {
      if (grades) setGradeThresholds(grades)
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

  const runAiEvaluation = async () => {
    const key =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(ANTHROPIC_API_KEY_STORAGE)
        : null
    if (!key) {
      setShowApiKeyModal(true)
      return
    }

    const projectContext = [
      projectInfo ? `Project Description:\n${projectInfo}` : '',
      fileContents ? `\nProject Files:\n${fileContents}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    if (!projectContext.trim()) {
      alert(t('eval_no_project'))
      return
    }

    setIsEvaluating(true)
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 3500,
          messages: [
            {
              role: 'user',
              content: `You are an expert software engineering professor evaluating a student project.

You have access to an evaluation ontology that defines quality dimensions and methodology.
The ontology dimensions are EXAMPLES and GUIDELINES — not a fixed list.

=== EVALUATION ONTOLOGY ===
${ontologyText}
=== END ONTOLOGY ===

=== PROJECT TO EVALUATE ===
${projectContext}
=== END PROJECT ===

YOUR TASK:
1. Read the project files carefully and identify ALL significant technical aspects
2. For each aspect, determine if it matches a dimension in the ontology OR if it requires a NEW dimension not in the ontology
3. Use ontology dimensions when they match. CREATE NEW dimensions when the project has important aspects not covered by the ontology
4. For NEW dimensions you create: assign a weight between 1.0 and 2.0 based on complexity
5. Score each applicable dimension from 1 to 10 using the scoringGuideline from ontology (or your own judgment for new dimensions)
6. Calculate normalizedTotal using WEIGHTED formula: (sum of rawScore*weight) / (sum of weights * 10) * 100
7. Write specific evidence-based feedback for each dimension referencing actual code

IMPORTANT RULES:
- Do NOT skip important project aspects just because they are not in the ontology
- If you create a new dimension, give it a clear descriptive label
- Scores must vary based on actual quality — do not give identical scores
- Always include the weight for each dimension in your response

Respond with ONLY this JSON format, no markdown:
{
  "detectedDimensions": ["key1", "key2"],
  "criteria": {
    "dimension_key": {
      "label": "Human readable label",
      "rawScore": 7,
      "maxRawScore": 10,
      "weight": 1.5,
      "isNewDimension": false,
      "feedback": "Specific evidence-based feedback."
    }
  },
  "normalizedTotal": 72,
  "overallFeedback": "3-4 sentence overall assessment."
}`,
            },
          ],
        }),
      })

      const data = await response.json()
      if (!response.ok)
        throw new Error(`API error ${response.status}: ${JSON.stringify(data)}`)

      const text = data.content?.[0]?.text || ''
      const clean = text.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)

      const newCriteria = Object.entries(parsed.criteria || {}).map(
        ([key, val]) => ({
          id: key,
          label: val.label || key,
          rawScore: val.rawScore || 0,
          maxRawScore: val.maxRawScore || 10,
          weight: typeof val.weight === 'number' ? val.weight : 1,
          isNewDimension: Boolean(val.isNewDimension),
          feedback: val.feedback || '',
        }),
      )

      setAiCriteria(newCriteria)
      setTotalScore(parsed.normalizedTotal || 0)
      setOverallFeedback(parsed.overallFeedback || '')
      setHasEvaluated(true)

      const snapshot = {
        id: createId(),
        createdAt: Date.now(),
        criteria: parsed.criteria,
        total: parsed.normalizedTotal || 0,
        max: 100,
        percentage: parsed.normalizedTotal || 0,
        overallFeedback: parsed.overallFeedback || '',
      }
      setHistory((prev) => [snapshot, ...prev])
    } catch (err) {
      console.error('[EvaluationPage] AI error:', err)
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
            total={hasEvaluated ? totalScore : 0}
            max={100}
            percentage={hasEvaluated ? totalScore : 0}
            grade={getGrade(hasEvaluated ? totalScore : 0)}
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
                disabled={isEvaluating}
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
                disabled={isEvaluating}
              >
                {isEvaluating ? t('eval_ai_loading') : t('eval_ai')}
              </Button>
            </div>
          </div>

          {!hasEvaluated ? (
            <div className="rounded-xl border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-8 text-center">
              <p className="text-sm font-medium text-[rgb(var(--zc-text))]">
                {t('eval_empty_title')}
              </p>
              <p className="mt-2 text-xs text-[rgb(var(--zc-muted))]">
                {t('eval_empty_hint')}
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {aiCriteria.map((criterion) => (
                <div
                  key={criterion.id}
                  className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-[rgb(var(--zc-text))]">
                        {criterion.label}
                      </h3>
                      {criterion.isNewDimension ? (
                        <p className="mt-0.5 text-[11px] text-amber-400/90">
                          New dimension
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-[11px] text-[rgb(var(--zc-muted))]">
                        w={criterion.weight}
                      </span>
                      <span className="rounded-md bg-indigo-500/15 px-3 py-1 text-sm font-medium text-indigo-300">
                        {criterion.rawScore} / {criterion.maxRawScore}
                      </span>
                    </div>
                  </div>
                  {criterion.feedback ? (
                    <p className="mt-2 text-sm text-[rgb(var(--zc-muted))]">
                      {criterion.feedback}
                    </p>
                  ) : null}
                </div>
              ))}
              {overallFeedback ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                  <p className="text-sm font-semibold text-emerald-300">
                    Overall Assessment
                  </p>
                  <p className="mt-2 text-sm text-[rgb(var(--zc-muted))]">
                    {overallFeedback}
                  </p>
                </div>
              ) : null}
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
              {Object.entries(selectedHistory.criteria || {}).map(
                ([id, v]) => {
                  const label = v?.label ?? id
                  const raw = v?.rawScore ?? v?.score
                  const maxRaw = v?.maxRawScore ?? v?.max ?? 10
                  const feedback = v?.feedback ?? v?.comments ?? ''
                  const applicable = v?.applicable !== false
                  const weight = v?.weight
                  const isNew = Boolean(v?.isNewDimension)
                  return (
                    <div
                      key={id}
                      className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[rgb(var(--zc-text))]">
                            {label}
                          </p>
                          {isNew ? (
                            <p className="mt-0.5 text-[11px] text-amber-400/90">
                              New dimension
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {typeof weight === 'number' ? (
                            <span className="text-[11px] text-[rgb(var(--zc-muted))]">
                              w={weight}
                            </span>
                          ) : null}
                          <span className="rounded-md bg-[rgb(var(--zc-bg)/0.4)] px-2 py-1 text-xs text-[rgb(var(--zc-muted))] ring-1 ring-inset ring-[rgb(var(--zc-border))]">
                            {!applicable ? (
                              <span className="text-[rgb(var(--zc-subtle))]">
                                {t('eval_not_applicable')}
                              </span>
                            ) : (
                              <>
                                {raw ?? 0} / {maxRaw}
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                      {feedback ? (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-[rgb(var(--zc-muted))]">
                          {feedback}
                        </p>
                      ) : (
                        <p className="mt-2 text-sm text-[rgb(var(--zc-subtle))]">
                          {t('eval_no_feedback')}
                        </p>
                      )}
                    </div>
                  )
                },
              )}
            </div>
            {selectedHistory.overallFeedback ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                <p className="text-sm font-semibold text-emerald-300">
                  Overall Assessment
                </p>
                <p className="mt-2 text-sm text-[rgb(var(--zc-muted))]">
                  {selectedHistory.overallFeedback}
                </p>
              </div>
            ) : null}
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
