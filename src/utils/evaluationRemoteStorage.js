import { getEvaluationsForProject, replaceEvaluationsForProject } from './database.js'
import { supabase } from './supabase.js'
import {
  isProjectEvaluation,
  projectIdAllowedForEvaluations,
} from '../components/evaluation/evaluationCoreUtils.js'

const TABLE = 'project_evaluations'

function devLog(...args) {
  if (import.meta.env?.DEV) console.log(...args)
}

/**
 * Map a client evaluation object to a Supabase row (snake_case).
 */
export function normalizeEvaluationForRemote(evalItem) {
  if (!evalItem || !isProjectEvaluation(evalItem)) return null
  const id = evalItem.id != null ? String(evalItem.id).trim() : ''
  if (!id) return null
  const projectId = String(evalItem.projectId ?? evalItem.project_id ?? '').trim()
  if (!projectId) return null

  let createdMs = Date.now()
  const raw = evalItem.createdAt ?? evalItem.created_at
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    createdMs = raw
  } else if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw)
    if (Number.isFinite(n)) createdMs = n
    else {
      const p = Date.parse(raw)
      if (Number.isFinite(p)) createdMs = p
    }
  }

  const authorUserId = evalItem.authorUserId ?? evalItem.author_user_id ?? evalItem.ownerUserId
  const authorName = evalItem.authorName ?? evalItem.author_name ?? ''
  const packageType = evalItem.packageType ?? evalItem.package_type ?? null

  const criteria = Array.isArray(evalItem.criteria)
    ? evalItem.criteria
    : evalItem.criteria && typeof evalItem.criteria === 'object'
      ? Object.entries(evalItem.criteria).map(([k, v]) => ({ id: k, ...v }))
      : []

  return {
    id,
    project_id: projectId,
    author_user_id: authorUserId ? String(authorUserId) : null,
    author_name: authorName ? String(authorName) : null,
    package_type: packageType ? String(packageType) : null,
    total: Number.isFinite(Number(evalItem.total)) ? Math.round(Number(evalItem.total)) : 0,
    max: Number.isFinite(Number(evalItem.max)) ? Math.round(Number(evalItem.max)) : 100,
    percentage: Number.isFinite(Number(evalItem.percentage)) ? Math.round(Number(evalItem.percentage)) : 0,
    overall_feedback: String(evalItem.overallFeedback ?? evalItem.overall_feedback ?? ''),
    criteria,
    payload: {
      ...(typeof evalItem.payload === 'object' && evalItem.payload ? evalItem.payload : {}),
      uploadedFiles: Array.isArray(evalItem.uploadedFiles) ? evalItem.uploadedFiles : [],
    },
    created_at: new Date(createdMs).toISOString(),
  }
}

/**
 * Reconstruct a client object from a Supabase row.
 */
export function mapRemoteEvaluation(row) {
  if (!row?.id) return null
  const projectId = row.project_id != null ? String(row.project_id) : ''
  if (!projectId) return null

  const createdRaw = row.created_at
  let createdAt = Date.now()
  if (createdRaw) {
    const parsed = Date.parse(createdRaw)
    if (Number.isFinite(parsed)) createdAt = parsed
  }

  return {
    id: String(row.id),
    projectId,
    authorUserId: row.author_user_id ?? null,
    authorName: row.author_name ?? '',
    packageType: row.package_type ?? null,
    uploadedFiles: Array.isArray(row.payload?.uploadedFiles) ? row.payload.uploadedFiles : [],
    total: Number(row.total ?? 0),
    max: Number(row.max ?? 100),
    percentage: Number(row.percentage ?? 0),
    overallFeedback: String(row.overall_feedback ?? ''),
    criteria: Array.isArray(row.criteria) ? row.criteria : [],
    payload: row.payload && typeof row.payload === 'object' ? row.payload : {},
    createdAt,
  }
}

export async function upsertEvaluation(evalItem) {
  const row = normalizeEvaluationForRemote(evalItem)
  if (!row) return { ok: false, error: new Error('invalid evaluation') }

  const { error } = await supabase.from(TABLE).upsert(row, { onConflict: 'id' })
  if (error) {
    console.error('[evaluationRemoteStorage] upsert failed:', error)
    return { ok: false, error }
  }
  return { ok: true, error: null }
}

export async function deleteRemoteEvaluation(evaluationId) {
  if (!evaluationId) return { ok: false, error: new Error('missing id') }
  const { error } = await supabase.from(TABLE).delete().eq('id', String(evaluationId))
  if (error) {
    console.error('[evaluationRemoteStorage] delete failed:', error)
    return { ok: false, error }
  }
  return { ok: true, error: null }
}

export async function fetchEvaluationsForProject(projectId) {
  const pid = projectId != null ? String(projectId).trim() : ''
  if (!pid) return []

  devLog('[EvaluationBackfill] fetching remote', { projectId: pid })

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('project_id', pid)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[evaluationRemoteStorage] fetch failed:', error)
    return []
  }

  const rows = Array.isArray(data) ? data : []
  devLog('[EvaluationBackfill] fetched count', rows.length)

  const out = []
  for (const row of rows) {
    const m = mapRemoteEvaluation(row)
    if (m && isProjectEvaluation(m)) out.push(m)
  }
  return out
}

export async function persistMergedEvaluationsForProject(projectId, mergedItems) {
  if (!projectId) return
  await replaceEvaluationsForProject(projectId, Array.isArray(mergedItems) ? mergedItems : [])
}

export function canFetchRemoteEvaluations(projectId, memberProjectIds, activeProjectId) {
  return projectIdAllowedForEvaluations(projectId, memberProjectIds, activeProjectId)
}
