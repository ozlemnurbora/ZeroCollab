import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button.jsx'
import { Modal } from '../components/ui/Modal.jsx'
import { EvaluationHistory } from '../components/evaluation/EvaluationHistory.jsx'
import { EvaluationSummary } from '../components/evaluation/EvaluationSummary.jsx'
import {
  loadEvaluationsForProject,
  syncEvaluationsForProject,
  saveEvaluation,
  deleteEvaluationById,
} from '../components/evaluation/evaluationStorage.js'
import { useLanguage } from '../utils/LanguageContext.jsx'
import { useAuth } from '../utils/AuthContext.jsx'
import { useWorkspace } from '../utils/WorkspaceContext.jsx'
import { addLogEntry } from '../utils/logService.js'
import { loadOntologyText, loadGradeThresholds, loadSubmissionScopes } from '../utils/ontologyLoader.js'
import { prioritizeChunksForScope } from '../utils/filePrioritizer.js'
import { inferSubmissionScope } from '../utils/scopeInference.js'
import { extractRichDocumentText } from '../utils/documentExtractors.js'
import {
  canRunEvaluation,
  recordEvaluationRun,
} from '../utils/tokenEconomics/quotaGuardService.js'

const ANTHROPIC_API_KEY_STORAGE = 'zc-anthropic-key'

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
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className={[
            'h-2.5 flex-1 rounded-sm transition-colors',
            i < filled ? tone : 'bg-[rgb(var(--zc-border)/0.6)]',
          ].join(' ')}
        />
      ))}
    </div>
  )
}

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID)
    return crypto.randomUUID()
  return `eval_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function EvaluationPage() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const ownerUserId = user?.id ?? null
  const { activeProject, memberProjectIds = [] } = useWorkspace()
  const projectId = activeProject?.id ?? null
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
  const [uploadedFileNames, setUploadedFileNames] = useState([])
  const [fileContents, setFileContents] = useState('')
  const [gradeThresholds, setGradeThresholds] = useState(null)
  const [evalLogs, setEvalLogs] = useState([])
  const [evalProgress, setEvalProgress] = useState(0)
  const [submissionScopes, setSubmissionScopes] = useState([])
  const [selectedScopeKey, setSelectedScopeKey] = useState('')
  const [inferredScopeKey, setInferredScopeKey] = useState(null)
  const [isInferringScope, setIsInferringScope] = useState(false)
  const [scopeConfirmOpen, setScopeConfirmOpen] = useState(false)

  const addLog = (message, type = 'info') => {
    console.log(`[Evaluation] ${message}`)
    setEvalLogs((prev) => [
      ...prev,
      { message, type, time: new Date().toLocaleTimeString() },
    ])
  }

  useEffect(() => {
    loadOntologyText().then((text) => {
      if (text) setOntologyText(text)
    })
    loadGradeThresholds().then((grades) => {
      if (grades) setGradeThresholds(grades)
    })
  }, [])

  useEffect(() => {
    void (async () => {
      const scopes = await loadSubmissionScopes()
      setSubmissionScopes(scopes)
    })()
  }, [])

  useEffect(() => {
    if (!projectId) {
      setHistory([])
      setHasLoadedHistory(false)
      setIsLoadingHistory(false)
      return
    }
    let cancelled = false
    setIsLoadingHistory(true)
    void (async () => {
      const local = await loadEvaluationsForProject(projectId)
      if (cancelled) return
      setHistory(local)
      setIsLoadingHistory(false)
      setHasLoadedHistory(true)

      const merged = await syncEvaluationsForProject(projectId, memberProjectIds, projectId)
      if (cancelled) return
      setHistory(merged)
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, (memberProjectIds || []).join(',')])

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
    setUploadedFileNames(files.map((f) => f.name))

    const SKIP_DIRS = [
      'node_modules',
      '.git',
      'dist',
      'dev-dist',
      'build',
      '.next',
      '__pycache__',
      '.cache',
      'coverage',
    ]
    const SOURCE_EXTENSIONS = [
      '.js',
      '.jsx',
      '.ts',
      '.tsx',
      '.py',
      '.ttl',
      '.md',
      '.html',
      '.css',
      '.json',
      '.txt',
      '.vue',
      '.svelte',
      '.pdf',
      '.docx',
      '.doc',
    ]
    // Priority: source code first, config last
    const PRIORITY = {
      '.jsx': 10,
      '.tsx': 10,
      '.js': 9,
      '.ts': 9,
      '.py': 9,
      '.pdf': 9,
      '.docx': 9,
      '.doc': 9,
      '.ttl': 8,
      '.md': 7,
      '.html': 6,
      '.css': 5,
      '.json': 4,
      '.txt': 3,
    }

    const allChunks = [] // { path, content, priority }

    const getPriority = (path) => {
      const ext = path.slice(path.lastIndexOf('.')).toLowerCase()
      return PRIORITY[ext] || 1
    }

    const processText = (path, content) => {
      // Split into chunks of ~800 chars with overlap
      const chunkSize = 800
      const overlap = 100
      if (content.length <= chunkSize) {
        allChunks.push({ path, content, priority: getPriority(path) })
      } else {
        for (let i = 0; i < content.length; i += chunkSize - overlap) {
          const chunk = content.slice(i, i + chunkSize)
          if (chunk.trim().length > 50) {
            allChunks.push({
              path: `${path}#chunk${Math.floor(i / chunkSize)}`,
              content: chunk,
              priority: getPriority(path),
            })
          }
        }
      }
    }

    const shouldSkip = (path) => {
      return SKIP_DIRS.some(
        (dir) =>
          path.includes(`/${dir}/`) ||
          path.includes(`\\${dir}\\`) ||
          path.startsWith(`${dir}/`),
      )
    }

    for (const file of files) {
      const nameLower = file.name.toLowerCase()

      if (nameLower.endsWith('.zip')) {
        try {
          const JSZip = (await import('jszip')).default
          const zip = await JSZip.loadAsync(file)
          const filePromises = []
          zip.forEach((relativePath, zipEntry) => {
            if (zipEntry.dir) return
            if (shouldSkip(relativePath)) return
            const lastDot = relativePath.lastIndexOf('.')
            const ext =
              lastDot >= 0
                ? `.${relativePath.slice(lastDot + 1).toLowerCase()}`
                : ''
            if (!SOURCE_EXTENSIONS.includes(ext)) return

            // Inside zips, .pdf and .docx are also extracted via the rich
            // extractors. We need the raw blob for those — use 'blob' instead
            // of 'text' for binary types.
            if (ext === '.pdf' || ext === '.docx' || ext === '.doc') {
              filePromises.push(
                zipEntry
                  .async('blob')
                  .then(async (blob) => {
                    const fileLike = new File([blob], relativePath)
                    const text = await extractRichDocumentText(fileLike)
                    if (text) processText(relativePath, text)
                  })
                  .catch(() => {}),
              )
            } else {
              filePromises.push(
                zipEntry
                  .async('text')
                  .then((content) => {
                    processText(relativePath, content)
                  })
                  .catch(() => {}),
              )
            }
          })
          await Promise.all(filePromises)
        } catch (err) {
          console.error('ZIP read error:', err)
        }
      } else if (nameLower.endsWith('.pdf') || nameLower.endsWith('.docx') || nameLower.endsWith('.doc')) {
        try {
          const text = await extractRichDocumentText(file)
          if (text) processText(file.name, text)
        } catch (err) {
          console.error('Rich document extract error:', err)
        }
      } else {
        try {
          const text = await file.text()
          processText(file.name, text)
        } catch {}
      }
    }

    // Sort by priority (highest first)
    allChunks.sort((a, b) => b.priority - a.priority)

    // Store chunks for RAG use
    window._evalChunks = allChunks
    console.log(`[RAG] Total chunks: ${allChunks.length}`)

    // Also create a summary for display
    const fileNames = [...new Set(allChunks.map((c) => c.path.split('#')[0]))]
    console.log(`[RAG] Files indexed: ${fileNames.length}`)

    // Build initial context (top priority files, up to 8000 chars)
    const topChunks = allChunks.slice(0, 40)
    const initialContext = topChunks
      .map((c) => `=== ${c.path} ===\n${c.content}`)
      .join('\n\n')
    setFileContents(initialContext)
    setUploadedFiles([`${fileNames.length} files indexed (${allChunks.length} chunks)`])
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

    // Determine effective scope (selected, inferred, or null)
    let effectiveScopeKey = selectedScopeKey
    if (!effectiveScopeKey) {
      const chunks = window._evalChunks || []
      if (chunks.length === 0) {
        alert(t('eval_no_project'))
        return
      }
      if (submissionScopes.length === 0) {
        addLog('Ontology has no submission scopes — proceeding with full project mode.', 'warning')
        effectiveScopeKey = ''
      } else {
        setIsInferringScope(true)
        addLog('Scanning files to infer submission scope...', 'info')
        const guess = await inferSubmissionScope(chunks, submissionScopes)
        setIsInferringScope(false)
        if (guess) {
          setInferredScopeKey(guess)
          setScopeConfirmOpen(true)
          addLog(`AI suggests: ${guess}. Waiting for your confirmation...`, 'info')
          return
        }
        // Inference failed — proceed without scope
        effectiveScopeKey = ''
        addLog('Could not infer scope; proceeding with full-project mode.', 'warning')
      }
    }

    const effectiveScope = submissionScopes.find((s) => s.key === effectiveScopeKey) || null

    setEvalLogs([])
    setEvalProgress(0)
    addLog('Step 1/4: Loading evaluation rubric and analyzing project files...', 'info')
    setEvalProgress(15)

    // RAG: get relevant chunks for evaluation
    const getRelevantChunks = (maxChars = 40000) => {
      const rawChunks = window._evalChunks || []
      if (rawChunks.length === 0) return ''

      const chunks = effectiveScope
        ? prioritizeChunksForScope(rawChunks, effectiveScope)
        : rawChunks

      const isNarrowScope =
        effectiveScope && effectiveScope.key !== 'full_project'
      const perFileLimit = isNarrowScope ? 4 : 1
      const fillCap = isNarrowScope ? perFileLimit + 2 : perFileLimit + 1

      let result = ''
      const perFileCount = new Map()
      const charLimit = Math.floor(maxChars * 0.85)

      const writeChunk = (chunk) => {
        const filePath = String(chunk.path ?? '').split('#')[0]
        if (!filePath) return false
        if (result.length + chunk.content.length > charLimit) return false
        result += `\n=== ${filePath} ===\n${chunk.content}\n`
        perFileCount.set(filePath, (perFileCount.get(filePath) ?? 0) + 1)
        return true
      }

      // GUARANTEED categories — always detected by file pattern, regardless of
      // folder layout. These must always be represented in the AI's context.
      const guaranteedCategoryOf = (path) => {
        const p = String(path || '').toLowerCase()
        if (p.includes('__tests__/') || p.includes('.test.') || p.includes('.spec.')) return 'test'
        if (p.endsWith('.ttl') || p.endsWith('.owl') || p.endsWith('.rdf') || p.includes('/ontology/')) return 'ontology'
        if (p.endsWith('.md') || p.endsWith('.pdf') || p.endsWith('.docx') || p.includes('readme')) return 'doc'
        if (
          p.endsWith('.config.js') ||
          p.endsWith('.config.ts') ||
          p.endsWith('vite.config.js') ||
          p.endsWith('vitest.config.js') ||
          p.endsWith('package.json') ||
          p.endsWith('tsconfig.json') ||
          p.endsWith('manifest.json')
        ) return 'config'
        // Token / payment / quota / currency / hedera / web3 files — these
        // tend to be a small number of crucial files that the round-robin
        // would otherwise leave half-buried in the auto-folder pile.
        if (
          p.includes('tokeneconomics') ||
          p.includes('token-economics') ||
          p.includes('/tokens/') ||
          p.includes('quotaservice') ||
          p.includes('quotarules') ||
          p.includes('quotaguard') ||
          p.includes('quotausage') ||
          p.includes('tokentier') ||
          p.includes('tokenconfig') ||
          p.includes('tokenprofile') ||
          p.includes('mirrornode') ||
          p.includes('hedera') ||
          p.includes('/payment') ||
          p.includes('/currency') ||
          p.includes('/wallet') ||
          p.includes('zctoken')
        ) return 'tokenomics'
        // Agile / scrum artefacts — sprint boards, backlog, roadmap, burndown.
        // Same treatment as tokenomics: a guaranteed bucket so these files
        // always reach the AI even when they're outnumbered by source folders.
        if (
          p.includes('/sprint') ||
          p.includes('sprint.') ||
          p.includes('sprintboard') ||
          p.includes('sprintplanning') ||
          p.includes('sprintburndown') ||
          p.includes('sprinttask') ||
          p.includes('/kanban') ||
          p.includes('kanbanboard') ||
          p.includes('kanban-schema') ||
          p.includes('/backlog') ||
          p.includes('productbacklog') ||
          p.includes('backlogitem') ||
          p.includes('/roadmap') ||
          p.includes('productroadmap') ||
          p.includes('burndown') ||
          p.includes('definitionofready') ||
          p.includes('definitionofdone') ||
          p.includes('storypoint') ||
          p.includes('userstory') ||
          p.includes('user-story') ||
          p.includes('epic')
        ) return 'agile'
        return null
      }

      // AUTO categories — derived from the project's top-level folder structure.
      // For each file path NOT covered by a guaranteed category, extract the
      // first "meaningful" folder segment and use that as the category name.
      const folderCategoryOf = (path) => {
        const p = String(path || '').replace(/^\/+/, '')
        const parts = p.split('/').filter(Boolean)
        if (parts.length === 0) return 'root'

        const skipTopLevel = new Set([
          'src', 'lib', 'app', 'public', 'assets', 'static', 'dist',
          'build', 'node_modules', '.git', 'packages', 'apps',
        ])
        // Folders that, when they appear, mean "look one level deeper" — because
        // their direct children are the actual domain areas (e.g. utils/blockchain
        // is more meaningful than just "utils").
        const descendInto = new Set([
          'utils', 'lib', 'helpers', 'common', 'modules', 'features',
          'components', 'widgets', 'pages', 'routes', 'views',
        ])

        let i = 0
        while (i < parts.length - 1 && skipTopLevel.has(parts[i].toLowerCase())) i += 1
        // If the segment is a generic container, look one more level down (but
        // only if there's a child folder, not a leaf file).
        if (i < parts.length - 2 && descendInto.has(parts[i].toLowerCase())) i += 1

        if (i >= parts.length - 1) return 'root'
        let name = parts[i].toLowerCase()

        // Light aliasing only for true infrastructure folders.
        if (name === 'hooks') return 'hooks'
        if (name === 'context' || name === 'contexts' || name === 'providers' || name === 'store' || name === 'state') return 'state'
        if (name === 'services' || name === 'api' || name === 'clients') return 'services'
        if (name === 'styles' || name === 'css' || name === 'theme') return 'styles'
        if (name === 'supabase' || name === 'migrations' || name === 'db' || name === 'database' || name === 'prisma') return 'database'
        // Everything else — including tokeneconomics, blockchain, sprint, calendar,
        // chat, kanban, recipes, astronomy, contracts — KEEPS its real folder name.
        return name
      }

      const categoryOf = (path) => guaranteedCategoryOf(path) || folderCategoryOf(path)

      if (isNarrowScope) {
        // Narrow scope: deep reads from boosted files, then fill.
        for (const chunk of chunks) {
          const boost = chunk.scopeBoost ?? 0
          if (boost <= 0) continue
          const filePath = String(chunk.path ?? '').split('#')[0]
          if (!filePath) continue
          if ((perFileCount.get(filePath) ?? 0) >= perFileLimit) continue
          if (result.length + chunk.content.length > charLimit) break
          writeChunk(chunk)
        }
        for (const chunk of chunks) {
          if (result.length >= maxChars) break
          const filePath = String(chunk.path ?? '').split('#')[0]
          if (!filePath) continue
          if ((perFileCount.get(filePath) ?? 0) >= fillCap) continue
          if (result.length + chunk.content.length > maxChars) break
          writeChunk(chunk)
        }
      } else {
        // Full project / no scope: hybrid round-robin.
        // Step 1: bucket every chunk by category (guaranteed first, then auto-folder).
        const buckets = new Map()
        for (const chunk of chunks) {
          const filePath = String(chunk.path ?? '').split('#')[0]
          if (!filePath) continue
          const cat = categoryOf(filePath)
          if (!buckets.has(cat)) buckets.set(cat, [])
          buckets.get(cat).push(chunk)
        }

        // Step 2: rotation order — guaranteed first, then auto-folders by size desc.
        const guaranteedOrder = ['test', 'ontology', 'tokenomics', 'agile', 'doc', 'config']
        const autoCategories = Array.from(buckets.keys())
          .filter((k) => !guaranteedOrder.includes(k))
          .sort((a, b) => (buckets.get(b)?.length ?? 0) - (buckets.get(a)?.length ?? 0))
        const categoryOrder = [
          ...guaranteedOrder.filter((k) => buckets.has(k)),
          ...autoCategories,
        ]

        // Step 3: round-robin, one chunk per category per pass, repeat until full.
        let madeProgress = true
        while (madeProgress && result.length < charLimit) {
          madeProgress = false
          for (const cat of categoryOrder) {
            const list = buckets.get(cat)
            if (!list || list.length === 0) continue
            let pickedIdx = -1
            for (let i = 0; i < list.length; i += 1) {
              const c = list[i]
              const fp = String(c.path ?? '').split('#')[0]
              if (!fp) continue
              if ((perFileCount.get(fp) ?? 0) >= fillCap) continue
              pickedIdx = i
              break
            }
            if (pickedIdx === -1) continue
            const chunk = list[pickedIdx]
            list.splice(pickedIdx, 1)
            if (writeChunk(chunk)) madeProgress = true
            if (result.length >= charLimit) break
          }
        }
      }

      return result
    }

    // Build RAG context - get relevant code for key evaluation areas
    const ragContext = getRelevantChunks(
      effectiveScopeKey === 'full_project' || !effectiveScopeKey ? 55000 : 40000,
    )
    const indexedChunks = window._evalChunks || []
    const indexedFiles = new Set(
      indexedChunks
        .map((c) => String(c.path ?? '').split('#')[0])
        .filter(Boolean),
    )
    addLog(
      `Step 2/4: RAG indexed ${indexedChunks.length} chunks across ${indexedFiles.size} files.`,
      'info',
    )
    setEvalProgress(30)

    if (effectiveScope) {
      const enrichedForLog = prioritizeChunksForScope(window._evalChunks || [], effectiveScope)
      const boostedFiles = new Set(
        enrichedForLog
          .filter((c) => (c.scopeBoost ?? 0) > 0)
          .map((c) => String(c.path ?? '').split('#')[0])
          .filter(Boolean),
      )
      addLog(
        `Scope "${effectiveScope.label}" matched ${boostedFiles.size} files in the upload.`,
        boostedFiles.size === 0 ? 'warning' : 'info',
      )
    }

    const uniqueFilesInPrompt = new Set()
    for (const m of ragContext.matchAll(/=== ([^=]+?) ===/g)) {
      uniqueFilesInPrompt.add(m[1].trim().split('#')[0])
    }
    addLog(
      `Sent ${uniqueFilesInPrompt.size} unique files to AI in ${ragContext.length.toLocaleString()} chars.`,
      'info',
    )

    const projectContext = [
      projectInfo ? `Project Description:\n${projectInfo}` : '',
      ragContext
        ? `\nProject Source Code (most relevant sections):\n${ragContext}`
        : fileContents
          ? `\nProject Files:\n${fileContents}`
          : '',
    ].filter(Boolean).join('\n')

    if (!projectContext.trim()) {
      alert(t('eval_no_project'))
      return
    }

    if (!canRunEvaluation()) {
      alert(
        'Your current tier has reached the AI evaluation limit. Hold more ZC tokens to unlock more evaluations.',
      )
      return
    }

    setIsEvaluating(true)
    try {
      addLog('Step 3/4: Sending to AI for evaluation...', 'info')
      setEvalProgress(45)
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
          max_tokens: 5000,
          temperature: 0.1,
          messages: [
            {
              role: 'user',
              content: `You are an expert software engineering professor evaluating a student project.

You have access to an evaluation ontology that defines quality dimensions and methodology.
The ontology dimensions are EXAMPLES and GUIDELINES — not a fixed list.

=== EVALUATION ONTOLOGY ===
${ontologyText}
=== END ONTOLOGY ===

=== SUBMISSION SCOPE ===
${effectiveScope
  ? `The user has indicated this submission is: ${effectiveScope.label}\n\nFocus: ${effectiveScope.focus}`
  : 'No specific scope provided — evaluate as a full project, detecting applicable dimensions from the files.'}
=== END SCOPE ===

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
- For Full project scope, identify AT LEAST 8 dimensions, and as many MORE as the codebase justifies — there is NO upper limit. ALWAYS consider these CROSS-CUTTING dimensions if evidence appears: testing, documentation, security, performance, accessibility/i18n. ADDITIONALLY, identify DOMAIN-SPECIFIC dimensions for every distinct functional area present in the codebase — e.g., agile / scrum / sprint workflow as a FIRST-CLASS dimension if sprint/kanban/backlog/roadmap/burndown code is present (score it on its own, not folded into Functionality — projects with SprintBoardPage, ProductBacklogPage, sprint planning, burndown charts, Definition of Ready, INVEST criteria, or kanban schema deserve a dedicated Agile / Project Management dimension), blockchain or smart-contract code if .sol/contract files appear, token economy / virtual currency / quota system if token/tier/quota/payment files appear (score it as its own dimension, not as a subset of functionality), machine learning if model code or training scripts appear, real-time communication if WebRTC/WebSocket code is present, semantic web if ontology/.ttl files are present, e-commerce if checkout code is present, scientific computing if simulation code is present, and so on. Use the file paths and folder names you can see to figure out the project's domain — do not assume it's a generic web app. CRITICAL: if a project has MULTIPLE major functional areas (e.g., both agile workflow AND token economy AND real-time communication), include EACH as its own dimension — do NOT drop one to stay under any count. Do not collapse the assessment into 5-6 broad categories.
- Scores must vary based on actual quality — do not give identical scores
- Always include the weight for each dimension in your response
- If the SUBMISSION SCOPE is anything other than "Full project", prefix each dimension label with the scope context. For example, with "Testing only" scope, "Code Quality" becomes "Code Quality (test code)", "Documentation" becomes "Documentation (in tests)". This makes scope-restricted scoring unambiguous to the reader.

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
      addLog('Step 4/4: Processing AI response...', 'info')
      setEvalProgress(80)
      if (!response.ok)
        throw new Error(`API error ${response.status}: ${JSON.stringify(data)}`)

      const text = data.content?.[0]?.text || ''
      const jsonStart = text.indexOf('{')
      const jsonEnd = text.lastIndexOf('}')
      if (jsonStart === -1 || jsonEnd === -1)
        throw new Error('Invalid JSON response from AI')
      const clean = text.slice(jsonStart, jsonEnd + 1)
      const parsed = JSON.parse(clean)
      setEvalProgress(100)
      const criteriaCount = Object.keys(parsed.criteria || {}).length
      const newDimCount = Object.values(parsed.criteria || {}).filter(
        (v) => v.isNewDimension,
      ).length
      addLog(
        `Evaluation complete! ${criteriaCount} dimensions (${newDimCount} new). Score: ${parsed.normalizedTotal}/100`,
        'success',
      )

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
        projectId,
        authorUserId: ownerUserId,
        authorName: user?.email?.split('@')[0] || '',
        packageType: effectiveScopeKey || null,
        uploadedFiles: Array.isArray(uploadedFileNames) ? uploadedFileNames.slice(0, 20) : [],
        createdAt: Date.now(),
        criteria: parsed.criteria,
        total: parsed.normalizedTotal || 0,
        max: 100,
        percentage: parsed.normalizedTotal || 0,
        overallFeedback: parsed.overallFeedback || '',
      }
      setHistory((prev) => [snapshot, ...prev])
      void saveEvaluation(snapshot)
      void addLogEntry({
        action: 'evaluation.created',
        category: 'system',
        severity: 'success',
        message: `Evaluation completed: ${snapshot.total}/100`,
        userId: ownerUserId,
        userName: user?.email?.split('@')[0] || '',
        projectId,
        projectName: activeProject?.name || '',
        entityType: 'evaluation',
        entityId: snapshot.id,
      })
      recordEvaluationRun()
    } catch (err) {
      console.error('[EvaluationPage] AI error:', err)
      addLog(`Failed: ${err.message}`, 'error')
      alert(`AI evaluation failed: ${err.message}`)
    } finally {
      setIsEvaluating(false)
    }
  }

  return (
    <section>
      <h1 className="bg-gradient-to-r from-indigo-500 to-fuchsia-500 bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-3xl">
        {t('page_evaluation_title')}
      </h1>
      {activeProject ? (
        <div className="mt-1 inline-flex items-center gap-2 rounded-full bg-indigo-500/15 px-3 py-1">
          <span className={`h-2 w-2 rounded-full ${activeProject.color}`} />
          <span className="text-xs font-medium text-indigo-300">
            {activeProject.name}
          </span>
        </div>
      ) : null}
      <p className="mt-2 text-sm text-[rgb(var(--zc-muted))] sm:text-base">
        {t('page_evaluation_subtitle')}
      </p>

      {isLoadingHistory ? (
        <div className="mt-6 rounded-xl border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-6 text-sm text-[rgb(var(--zc-muted2))]">
          {t('loading_eval_history')}
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <EvaluationSummary
            total={hasEvaluated ? totalScore : 0}
            max={100}
            percentage={hasEvaluated ? totalScore : 0}
            grade={getGrade(hasEvaluated ? totalScore : 0)}
          />

          <div className="overflow-hidden rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)] p-4">
            <div
              className="-mx-4 -mt-4 mb-3 h-0.5 rounded-t bg-gradient-to-r from-emerald-500/60 via-indigo-500/60 to-fuchsia-500/60"
              aria-hidden="true"
            />
            <h2 className="bg-gradient-to-r from-indigo-500 to-fuchsia-500 bg-clip-text text-base font-semibold text-transparent">
              {t('eval_project_label')}
            </h2>
            <p className="mt-1 text-xs text-[rgb(var(--zc-muted))]">
              {t('eval_project_hint')}
            </p>
            <div className="mb-4 mt-3">
              <label className="mb-1 block text-sm font-medium text-[rgb(var(--zc-text))]">
                Submission scope <span className="text-[rgb(var(--zc-muted))]">(optional)</span>
              </label>
              <select
                value={selectedScopeKey}
                onChange={(e) => setSelectedScopeKey(e.target.value)}
                className="w-full rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
              >
                <option value="">Let AI decide from uploaded files</option>
                {submissionScopes.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-[rgb(var(--zc-muted))]">
                Tell AI what you uploaded so it focuses on the right things. Leave blank and AI will scan filenames and ask you to confirm.
              </p>
            </div>
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
              <div>
                <label
                  htmlFor="eval-file-input"
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-indigo-500/50 bg-gradient-to-r from-indigo-500/15 to-fuchsia-500/15 px-4 py-2 text-sm font-medium text-indigo-600 transition hover:border-indigo-500/70 hover:from-indigo-500/25 hover:to-fuchsia-500/25 dark:text-indigo-300"
                >
                  <span aria-hidden="true">📎</span>
                  <span>Choose files</span>
                </label>
                <input
                  id="eval-file-input"
                  type="file"
                  accept=".js,.jsx,.ts,.tsx,.html,.css,.json,.md,.txt,.py,.zip,.pdf,.docx,.doc"
                  multiple
                  onChange={(ev) => void handleFileUpload(ev)}
                  className="hidden"
                />
                <span className="ml-3 text-sm text-[rgb(var(--zc-muted))]">
                  {uploadedFileNames.length === 0
                    ? 'No files chosen'
                    : `${uploadedFileNames.length} file(s) selected`}
                </span>
              </div>
              <p className="mt-1 text-xs text-[rgb(var(--zc-muted))]">
                Upload a project zip, source files, or documents (.pdf, .docx, .md). Documents are useful for evaluating proposals, papers, and design docs.
              </p>
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
                className="bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-md hover:from-indigo-600 hover:to-fuchsia-600"
              >
                {isEvaluating ? t('eval_ai_loading') : t('eval_submit_project')}
              </Button>
            </div>
            {(isEvaluating || evalLogs.length > 0) && (
              <div className="mt-4 rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--zc-muted2))]">
                    Evaluation Log
                  </p>
                  {evalProgress > 0 && evalProgress < 100 && (
                    <span className="text-xs text-indigo-300">
                      {evalProgress}%
                    </span>
                  )}
                </div>
                {evalProgress > 0 && (
                  <div className="mb-2 h-1.5 w-full rounded-full bg-[rgb(var(--zc-border))]">
                    <div
                      className="h-1.5 rounded-full bg-indigo-500 transition-all duration-500"
                      style={{ width: `${evalProgress}%` }}
                    />
                  </div>
                )}
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {evalLogs.map((log, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="shrink-0 text-[rgb(var(--zc-subtle))]">
                        {log.time}
                      </span>
                      <span
                        className={
                          log.type === 'error'
                            ? 'text-rose-400'
                            : log.type === 'success'
                              ? 'text-emerald-400'
                              : 'text-[rgb(var(--zc-muted))]'
                        }
                      >
                        {log.message}
                      </span>
                    </div>
                  ))}
                  {isEvaluating && (
                    <div className="flex items-center gap-2 text-xs text-indigo-300">
                      <span className="animate-pulse">●</span>
                      <span>Processing...</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)] p-4">
            <div
              className="-mx-4 -mt-4 mb-3 h-0.5 rounded-t bg-gradient-to-r from-fuchsia-500/60 via-emerald-500/60 to-indigo-500/60"
              aria-hidden="true"
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="bg-gradient-to-r from-fuchsia-500 to-emerald-500 bg-clip-text text-base font-semibold text-transparent">
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
              <div className="mt-4 rounded-xl border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-8 text-center">
                <p className="text-sm font-medium text-[rgb(var(--zc-text))]">
                  {t('eval_empty_title')}
                </p>
                <p className="mt-2 text-xs text-[rgb(var(--zc-muted))]">
                  {t('eval_empty_hint')}
                </p>
              </div>
            ) : (
              <div className="mt-4 grid gap-4">
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

                    <div className="mt-3">
                      <ScoreBar
                        score={Number(criterion.rawScore) || 0}
                        max={Number(criterion.maxRawScore) || 10}
                      />
                    </div>

                    {criterion.feedback ? (
                      <p className="mt-3 text-sm text-[rgb(var(--zc-muted))]">
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
        </div>

        <div className="min-w-0 space-y-6">
          {!projectId ? (
            <div className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.25)] p-6 text-center">
              <p className="text-sm text-[rgb(var(--zc-muted))]">
                Select a project to view evaluations.
              </p>
            </div>
          ) : null}
          <EvaluationHistory
            items={history}
            onView={(e) => setSelectedHistory(e)}
            onDelete={(item) => {
              setHistory((prev) => prev.filter((h) => h.id !== item.id))
              void deleteEvaluationById(item)
              void addLogEntry({
                action: 'evaluation.deleted',
                category: 'system',
                severity: 'warning',
                message: `Deleted evaluation: ${item.total}/100`,
                userId: ownerUserId,
                userName: user?.email?.split('@')[0] || '',
                projectId,
                projectName: activeProject?.name || '',
                entityType: 'evaluation',
                entityId: item.id,
              })
            }}
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
              snapshot={selectedHistory}
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

                      {applicable ? (
                        <div className="mt-3">
                          <ScoreBar
                            score={Number(raw) || 0}
                            max={Number(maxRaw) || 10}
                          />
                        </div>
                      ) : null}

                      {feedback ? (
                        <p className="mt-3 whitespace-pre-wrap text-sm text-[rgb(var(--zc-muted))]">
                          {feedback}
                        </p>
                      ) : (
                        <p className="mt-3 text-sm text-[rgb(var(--zc-subtle))]">
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

      {scopeConfirmOpen ? (
        <Modal
          open
          onClose={() => setScopeConfirmOpen(false)}
          title="Confirm submission scope"
        >
          <div className="space-y-3">
            <p className="text-sm text-[rgb(var(--zc-text))]">
              AI scanned your files and suggests:
            </p>
            <div className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 p-3">
              <p className="text-sm font-medium text-indigo-200">
                {submissionScopes.find((s) => s.key === inferredScopeKey)?.label || inferredScopeKey}
              </p>
              <p className="mt-1 text-xs text-[rgb(var(--zc-muted))]">
                {submissionScopes.find((s) => s.key === inferredScopeKey)?.focus?.slice(0, 220) || ''}
              </p>
            </div>
            <label className="block text-xs font-medium text-[rgb(var(--zc-text))]">
              Or pick a different scope:
            </label>
            <select
              value={inferredScopeKey || ''}
              onChange={(e) => setInferredScopeKey(e.target.value)}
              className="w-full rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))]"
            >
              {submissionScopes.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setScopeConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const chosen = inferredScopeKey
                  setScopeConfirmOpen(false)
                  setSelectedScopeKey(chosen || '')
                  // Re-trigger the evaluation now that the scope is locked in
                  void runAiEvaluation()
                }}
              >
                Use this scope
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  )
}
