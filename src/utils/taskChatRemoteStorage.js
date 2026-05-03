import { loadMessages, saveMessages } from '../components/chat/chatStorage.js'
import { supabase } from './supabase.js'
import {
  isTaskChatMessage,
  isTaskChatMessageForTask,
  mergeTaskChatMessages,
  projectIdAllowedForTaskChat,
} from './taskChatUtils.js'

const TABLE = 'task_chat_messages'

function devLog(...args) {
  if (import.meta.env?.DEV) console.log(...args)
}

/**
 * Map a client task-chat message to a Supabase row (snake_case).
 * @returns {object | null}
 */
export function normalizeTaskChatMessageForRemote(message) {
  if (!message || !isTaskChatMessage(message)) return null
  const id = message.id != null ? String(message.id).trim() : ''
  if (!id) return null
  const projectId = String(message.projectId ?? message.project_id ?? '').trim()
  const taskId = String(message.taskId ?? message.task_id ?? '').trim()
  if (!projectId || !taskId) return null

  let createdMs = Date.now()
  const raw = message.createdAt ?? message.created_at
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

  const senderUserId =
    message.senderUserId != null
      ? String(message.senderUserId)
      : message.sender_user_id != null
        ? String(message.sender_user_id)
        : null
  const senderName =
    message.sender != null
      ? String(message.sender)
      : message.sender_name != null
        ? String(message.sender_name)
        : ''

  const text = String(message.text ?? '').trim()
  if (!text) return null

  const payload = {
    kind: 'task-chat',
    channelId: message.channelId ?? message.channel_id ?? `task:${taskId}`,
    ...(typeof message.payload === 'object' && message.payload ? message.payload : {}),
  }

  return {
    id,
    project_id: projectId,
    task_id: taskId,
    sender_user_id: senderUserId,
    sender_name: senderName || null,
    text,
    created_at: new Date(createdMs).toISOString(),
    payload,
  }
}

/**
 * Reconstruct a client message from a Supabase row.
 * Does not set ownerUserId (local store stamps that for the viewer).
 */
export function mapRemoteTaskChatMessage(row) {
  if (!row?.id) return null
  const projectId = row.project_id != null ? String(row.project_id) : ''
  const taskId = row.task_id != null ? String(row.task_id) : ''
  if (!projectId || !taskId) return null

  const p = row.payload && typeof row.payload === 'object' ? row.payload : {}
  const createdRaw = row.created_at
  let createdAt = Date.now()
  if (createdRaw) {
    const parsed = Date.parse(createdRaw)
    if (Number.isFinite(parsed)) createdAt = parsed
  }

  return {
    id: String(row.id),
    kind: p.kind || 'task-chat',
    channelId: p.channelId ?? p.channel_id ?? `task:${taskId}`,
    taskId,
    projectId,
    sender: row.sender_name ?? p.sender ?? '',
    senderUserId: row.sender_user_id ?? p.senderUserId ?? null,
    text: String(row.text ?? ''),
    createdAt,
    payload: Object.keys(p).length ? p : undefined,
  }
}

/**
 * Upsert one task-chat row to Supabase (idempotent by message id).
 */
export async function upsertTaskChatMessage(message) {
  const row = normalizeTaskChatMessageForRemote(message)
  if (!row) return { ok: false, error: new Error('invalid task-chat message') }

  const { error } = await supabase.from(TABLE).upsert(row, { onConflict: 'id' })
  if (error) {
    console.error('[taskChatRemoteStorage] upsert failed:', error)
    return { ok: false, error }
  }
  return { ok: true, error: null }
}

/**
 * Fetch remote task chat for a task (RLS enforces project membership).
 */
export async function fetchTaskChatMessagesForTask(projectId, taskId) {
  const pid = projectId != null ? String(projectId).trim() : ''
  const tid = taskId != null ? String(taskId).trim() : ''
  if (!pid || !tid) return []

  devLog('[TaskChatBackfill] fetching remote messages', { projectId: pid, taskId: tid })

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('project_id', pid)
    .eq('task_id', tid)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[taskChatRemoteStorage] fetch failed:', error)
    devLog('[TaskChatBackfill] fetched count', 0)
    return []
  }

  const rows = Array.isArray(data) ? data : []
  devLog('[TaskChatBackfill] fetched count', rows.length)

  const out = []
  for (const row of rows) {
    const m = mapRemoteTaskChatMessage(row)
    if (m && isTaskChatMessage(m)) out.push(m)
  }
  return out
}

/**
 * Replace this user's IndexedDB slice for one task thread with merged messages.
 */
export async function persistMergedTaskChatForTask(ownerUserId, taskId, projectId, mergedMessages) {
  if (!ownerUserId || !taskId || projectId == null || String(projectId).trim() === '') return
  const merged = Array.isArray(mergedMessages) ? mergedMessages : []
  const all = await loadMessages(ownerUserId)
  const without = all.filter((m) => !isTaskChatMessageForTask(m, taskId, projectId))
  await saveMessages([...without, ...merged], ownerUserId)
}

export function canFetchRemoteTaskChat(projectId, memberProjectIds, activeProjectId) {
  return projectIdAllowedForTaskChat(projectId, memberProjectIds, activeProjectId)
}
