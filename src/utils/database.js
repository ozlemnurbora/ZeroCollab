import { openDB } from 'idb'

import { CHAT_STORAGE_KEYS } from '../components/chat/chatConstants.js'
import { EVALUATION_STORAGE_KEY } from '../components/evaluation/evaluationConstants.js'
import { TASKS_STORAGE_KEY } from '../components/kanban/kanbanConstants.js'
import {
  PEER_ID_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
} from '../components/settings/settingsConstants.js'

const DB_NAME = 'zerocollab-db'
const DB_VERSION = 2

const STORES = {
  tasks: 'tasks',
  messages: 'messages',
  evaluations: 'evaluations',
  settings: 'settings',
  meetings: 'meetings',
}

// Keys stored inside the "settings" object store
const SETTINGS_KEYS = {
  migrated: '__migratedFromLocalStorage_v1',
  appSettings: 'appSettings',
  peerId: 'peerId',
  chatUser: 'chatUser',
  chatChannel: 'chatChannel',
}

let dbPromise = null

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function migrateFromLocalStorageIfNeeded(db) {
  const already = await db.get(STORES.settings, SETTINGS_KEYS.migrated)
  if (already?.value) return

  // Import existing localStorage data (best-effort; do not delete localStorage keys).
  try {
    const rawTasks = localStorage.getItem(TASKS_STORAGE_KEY)
    const tasks = Array.isArray(safeJsonParse(rawTasks)) ? safeJsonParse(rawTasks) : []
    if (tasks.length) {
      const tx = db.transaction(STORES.tasks, 'readwrite')
      await tx.store.clear()
      for (const t of tasks) {
        if (t && typeof t === 'object' && t.id) await tx.store.put(t)
      }
      await tx.done
    }

    const rawMsgs = localStorage.getItem(CHAT_STORAGE_KEYS.messages)
    const msgs = Array.isArray(safeJsonParse(rawMsgs)) ? safeJsonParse(rawMsgs) : []
    if (msgs.length) {
      const tx = db.transaction(STORES.messages, 'readwrite')
      await tx.store.clear()
      for (const m of msgs) {
        if (m && typeof m === 'object' && m.id) await tx.store.put(m)
      }
      await tx.done
    }

    const rawEvals = localStorage.getItem(EVALUATION_STORAGE_KEY)
    const evals = Array.isArray(safeJsonParse(rawEvals)) ? safeJsonParse(rawEvals) : []
    if (evals.length) {
      const tx = db.transaction(STORES.evaluations, 'readwrite')
      await tx.store.clear()
      for (const e of evals) {
        if (e && typeof e === 'object' && e.id) await tx.store.put(e)
      }
      await tx.done
    }

    const rawSettings = localStorage.getItem(SETTINGS_STORAGE_KEY)
    const settingsObj = rawSettings ? safeJsonParse(rawSettings) : null
    if (settingsObj && typeof settingsObj === 'object') {
      await db.put(STORES.settings, { key: SETTINGS_KEYS.appSettings, value: settingsObj })
    }

    const peerId = localStorage.getItem(PEER_ID_STORAGE_KEY)
    if (peerId) await db.put(STORES.settings, { key: SETTINGS_KEYS.peerId, value: peerId })

    const chatUser = localStorage.getItem(CHAT_STORAGE_KEYS.user)
    if (chatUser) await db.put(STORES.settings, { key: SETTINGS_KEYS.chatUser, value: chatUser })

    const chatChannel = localStorage.getItem(CHAT_STORAGE_KEYS.channel)
    if (chatChannel) {
      await db.put(STORES.settings, {
        key: SETTINGS_KEYS.chatChannel,
        value: chatChannel,
      })
    }
  } catch {
    // ignore migration errors
  } finally {
    // Mark migration done regardless to avoid repeated work.
    try {
      await db.put(STORES.settings, { key: SETTINGS_KEYS.migrated, value: true })
    } catch {
      // ignore
    }
  }
}

export async function getDatabase() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORES.tasks)) {
          db.createObjectStore(STORES.tasks, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(STORES.messages)) {
          db.createObjectStore(STORES.messages, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(STORES.evaluations)) {
          db.createObjectStore(STORES.evaluations, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(STORES.settings)) {
          db.createObjectStore(STORES.settings, { keyPath: 'key' })
        }
        if (!db.objectStoreNames.contains(STORES.meetings)) {
          db.createObjectStore(STORES.meetings, { keyPath: 'id' })
        }
      },
    })
      .then(async (db) => {
        await migrateFromLocalStorageIfNeeded(db)
        return db
      })
      .catch((e) => {
        dbPromise = null
        throw e
      })
  }
  return dbPromise
}

function emitChange(detail) {
  try {
    window.dispatchEvent(new CustomEvent('zerocollab:idb', { detail }))
  } catch {
    // ignore
  }
}

// -------- Tasks store --------
export async function getTasks() {
  const db = await getDatabase()
  return (await db.getAll(STORES.tasks)) ?? []
}

export async function putTasks(tasks) {
  const db = await getDatabase()
  const tx = db.transaction(STORES.tasks, 'readwrite')
  await tx.store.clear()
  for (const t of tasks ?? []) {
    if (t && typeof t === 'object' && t.id) await tx.store.put(t)
  }
  await tx.done
  emitChange({ store: STORES.tasks })
}

export async function putTask(task) {
  const db = await getDatabase()
  await db.put(STORES.tasks, task)
  emitChange({ store: STORES.tasks, id: task?.id })
}

export async function deleteTask(id) {
  const db = await getDatabase()
  await db.delete(STORES.tasks, id)
  emitChange({ store: STORES.tasks, id })
}

export async function clearTasks() {
  const db = await getDatabase()
  await db.clear(STORES.tasks)
  emitChange({ store: STORES.tasks, cleared: true })
}

// -------- Messages store --------
export async function getMessages() {
  const db = await getDatabase()
  return (await db.getAll(STORES.messages)) ?? []
}

export async function putMessages(messages) {
  const db = await getDatabase()
  const tx = db.transaction(STORES.messages, 'readwrite')
  await tx.store.clear()
  for (const m of messages ?? []) {
    if (m && typeof m === 'object' && m.id) await tx.store.put(m)
  }
  await tx.done
  emitChange({ store: STORES.messages })
}

export async function putMessage(message) {
  const db = await getDatabase()
  await db.put(STORES.messages, message)
  emitChange({ store: STORES.messages, id: message?.id })
}

export async function deleteMessage(id) {
  const db = await getDatabase()
  await db.delete(STORES.messages, id)
  emitChange({ store: STORES.messages, id })
}

export async function clearMessages() {
  const db = await getDatabase()
  await db.clear(STORES.messages)
  emitChange({ store: STORES.messages, cleared: true })
}

// -------- Evaluations store --------
export async function getEvaluations() {
  const db = await getDatabase()
  return (await db.getAll(STORES.evaluations)) ?? []
}

export async function putEvaluations(items) {
  const db = await getDatabase()
  const tx = db.transaction(STORES.evaluations, 'readwrite')
  await tx.store.clear()
  for (const e of items ?? []) {
    if (e && typeof e === 'object' && e.id) await tx.store.put(e)
  }
  await tx.done
  emitChange({ store: STORES.evaluations })
}

export async function putEvaluation(item) {
  const db = await getDatabase()
  await db.put(STORES.evaluations, item)
  emitChange({ store: STORES.evaluations, id: item?.id })
}

export async function deleteEvaluation(id) {
  const db = await getDatabase()
  await db.delete(STORES.evaluations, id)
  emitChange({ store: STORES.evaluations, id })
}

export async function clearEvaluations() {
  const db = await getDatabase()
  await db.clear(STORES.evaluations)
  emitChange({ store: STORES.evaluations, cleared: true })
}

// -------- Settings store --------
export async function getSetting(key) {
  const db = await getDatabase()
  const record = await db.get(STORES.settings, key)
  return record?.value ?? null
}

export async function setSetting(key, value) {
  const db = await getDatabase()
  await db.put(STORES.settings, { key, value })
  emitChange({ store: STORES.settings, key })
}

export async function deleteSetting(key) {
  const db = await getDatabase()
  await db.delete(STORES.settings, key)
  emitChange({ store: STORES.settings, key, deleted: true })
}

export async function getAllSettings() {
  const db = await getDatabase()
  const rows = (await db.getAll(STORES.settings)) ?? []
  return rows.reduce((acc, row) => {
    acc[row.key] = row.value
    return acc
  }, {})
}

export const DATABASE_META = {
  name: DB_NAME,
  version: DB_VERSION,
  stores: STORES,
  settingsKeys: SETTINGS_KEYS,
}

