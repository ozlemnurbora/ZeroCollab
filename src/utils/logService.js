/**
 * Log Service — system-wide audit trail.
 *
 * Stores forensic "who did what, when" records in IndexedDB. Mirrors the
 * shape of `notificationService.js` (open DB, append record, dispatch a
 * CustomEvent, polling refresh) but is deliberately a separate store so
 * that clearing the user-facing notification bell can never wipe the
 * audit trail.
 *
 * Public API:
 *   addLogEntry(entry)        async — append one log, returns the log or null
 *   getLogs(filters)          async — newest-first, filterable, capped by limit
 *   getLogCount(filters)      async — count after filters (unbounded)
 *   clearLogs()               async — wipes every log
 *   exportLogsAsJson()        async — full log array, newest-first, no limit
 *   formatLogTime(timestamp)  sync  — { relative, absolute } pair
 *
 * Logging must NEVER throw or block — every public function wraps its work
 * in try/catch and returns a benign value on failure.
 */

import { fetchRemoteLogs, insertRemoteLog } from './logRemoteStorage.js'

const DB_NAME = 'zerocollab-logs'
const STORE_NAME = 'logs'
const DB_VERSION = 1
const MAX_LOG_ENTRIES = 5000

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('timestamp', 'timestamp', { unique: false })
        store.createIndex('category', 'category', { unique: false })
        store.createIndex('severity', 'severity', { unique: false })
        store.createIndex('projectId', 'projectId', { unique: false })
        store.createIndex('userId', 'userId', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function createLogId() {
  return `log_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
}

function matchesFilters(log, filters) {
  if (!log) return false
  if (filters.category && filters.category !== 'all' && log.category !== filters.category) return false
  if (filters.severity && filters.severity !== 'all' && log.severity !== filters.severity) return false
  if (filters.projectId && log.projectId !== filters.projectId) return false
  if (filters.userId && log.userId !== filters.userId) return false
  if (filters.entityType && log.entityType !== filters.entityType) return false
  if (typeof filters.since === 'number' && (log.timestamp || 0) < filters.since) return false
  if (typeof filters.until === 'number' && (log.timestamp || 0) > filters.until) return false
  if (filters.search) {
    const needle = String(filters.search).toLowerCase()
    const haystack = [
      log.message,
      log.action,
      log.entityName,
      log.userName,
    ]
      .map((v) => String(v ?? '').toLowerCase())
      .join(' ')
    if (!haystack.includes(needle)) return false
  }
  return true
}

export async function addLogEntry(entry) {
  try {
    const action = entry && typeof entry.action === 'string' ? entry.action.trim() : ''
    if (!action) return null
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const log = {
      id: createLogId(),
      action,
      category: entry.category || 'system',
      severity: entry.severity || 'info',
      message: entry.message || '',
      userId: entry.userId ?? null,
      userName: entry.userName || '',
      projectId: entry.projectId ?? null,
      projectName: entry.projectName || '',
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      entityName: entry.entityName || '',
      metadata: entry.metadata ?? null,
      timestamp: Date.now(),
    }
    store.put(log)
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = reject
    })
    window.dispatchEvent(new CustomEvent('zc-log', { detail: log }))
    // Fire-and-forget share to teammates. Project-scoped logs only; workspace
    // events (projectId null) return early inside insertRemoteLog. Non-blocking
    // and never throws, so it can't break local logging.
    void insertRemoteLog(log)
    void enforceMaxEntries()
    return log
  } catch (err) {
    console.error('[LogService] addLogEntry error:', err)
    return null
  }
}

export async function getLogs(filters = {}) {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const all = await new Promise((resolve, reject) => {
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const limit = Number.isFinite(filters.limit) && filters.limit > 0 ? filters.limit : 500
    const filtered = (Array.isArray(all) ? all : []).filter((log) => matchesFilters(log, filters))
    filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    return filtered.slice(0, limit)
  } catch (err) {
    console.error('[LogService] getLogs error:', err)
    return []
  }
}

/**
 * Merged local + remote logs for a single project. Gives each member the union
 * of their own (instant, local) actions and teammates' (remote) actions, deduped
 * by id, filtered, and sorted newest-first. Never throws.
 */
export async function getProjectLogs(projectId, filters = {}) {
  try {
    if (!projectId) return []
    const limit = Number.isFinite(filters.limit) && filters.limit > 0 ? filters.limit : 500
    const [remote, local] = await Promise.all([
      fetchRemoteLogs(projectId, { limit }),
      getLogs({ ...filters, projectId, limit: Math.max(limit, 5000) }),
    ])
    const byId = new Map()
    // Local first so a local entry (which carries projectName and is already
    // localized) wins over its remote twin when both exist.
    for (const log of Array.isArray(local) ? local : []) {
      if (log && log.id) byId.set(log.id, log)
    }
    for (const log of Array.isArray(remote) ? remote : []) {
      if (log && log.id && !byId.has(log.id)) byId.set(log.id, log)
    }
    const merged = Array.from(byId.values()).filter((log) => matchesFilters(log, filters))
    merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    return merged.slice(0, limit)
  } catch (err) {
    console.error('[LogService] getProjectLogs error:', err)
    return []
  }
}

export async function getLogCount(filters = {}) {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const all = await new Promise((resolve, reject) => {
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    return (Array.isArray(all) ? all : []).filter((log) => matchesFilters(log, filters)).length
  } catch (err) {
    console.error('[LogService] getLogCount error:', err)
    return 0
  }
}

export async function clearLogs() {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.clear()
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = reject
    })
    window.dispatchEvent(new CustomEvent('zc-log', { detail: { type: 'cleared' } }))
  } catch (err) {
    console.error('[LogService] clearLogs error:', err)
  }
}

export async function clearLogsForProject(projectId) {
  try {
    if (!projectId) return
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const all = await new Promise((resolve, reject) => {
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    // Delete only this project's entries — preserve other projects and
    // null-project (auth/personal) logs.
    for (const log of Array.isArray(all) ? all : []) {
      if (log && log.id && log.projectId === projectId) {
        store.delete(log.id)
      }
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = reject
    })
    window.dispatchEvent(new CustomEvent('zc-log', { detail: { type: 'cleared', projectId } }))
  } catch (err) {
    console.error('[LogService] clearLogsForProject error:', err)
  }
}

export async function exportLogsAsJson() {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const all = await new Promise((resolve, reject) => {
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const list = Array.isArray(all) ? [...all] : []
    list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    return list
  } catch (err) {
    console.error('[LogService] exportLogsAsJson error:', err)
    return []
  }
}

export function formatLogTime(timestamp, t) {
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || ts <= 0) {
    return { relative: '', absolute: '' }
  }
  const tr = (key, vars, fallback) =>
    typeof t === 'function' ? t(key, vars) : fallback
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60000)
  let relative
  if (minutes < 1) relative = tr('logs_time_just_now', undefined, 'just now')
  else if (minutes < 60)
    relative = tr('logs_time_min_ago', { n: minutes }, `${minutes}m ago`)
  else {
    const hours = Math.floor(minutes / 60)
    if (hours < 24)
      relative = tr('logs_time_hour_ago', { n: hours }, `${hours}h ago`)
    else {
      const days = Math.floor(hours / 24)
      if (days < 7)
        relative = tr('logs_time_day_ago', { n: days }, `${days}d ago`)
      else relative = new Date(ts).toLocaleDateString()
    }
  }
  let absolute = ''
  try {
    absolute = new Date(ts).toLocaleString()
  } catch {
    absolute = ''
  }
  return { relative, absolute }
}

async function enforceMaxEntries() {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const count = await new Promise((resolve, reject) => {
      const req = store.count()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    if (count <= MAX_LOG_ENTRIES) return
    const toRemove = count - MAX_LOG_ENTRIES
    const index = store.index('timestamp')
    await new Promise((resolve, reject) => {
      let deleted = 0
      const cursorReq = index.openCursor()
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (!cursor || deleted >= toRemove) {
          resolve()
          return
        }
        cursor.delete()
        deleted += 1
        cursor.continue()
      }
      cursorReq.onerror = () => reject(cursorReq.error)
    })
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = reject
    })
  } catch (err) {
    console.error('[LogService] enforceMaxEntries error:', err)
  }
}
