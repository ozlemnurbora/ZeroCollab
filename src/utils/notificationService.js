/**
 * Notification Service
 * Stores and manages in-app notifications in IndexedDB.
 */

const DB_NAME = 'zerocollab-notifications'
const STORE_NAME = 'notifications'
const DB_VERSION = 1

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('timestamp', 'timestamp', { unique: false })
        store.createIndex('read', 'read', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function addNotification({ type, title, message, taskId, taskTitle, fromUser, toStatus, fromStatus, recipientUserId, sourceLogId, projectName }) {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const notification = {
      id: `notif_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      type: type || 'task_update',
      title: title || 'Task Updated',
      message: message || '',
      taskId: taskId || null,
      taskTitle: taskTitle || '',
      fromUser: fromUser || 'Unknown',
      toStatus: toStatus || '',
      fromStatus: fromStatus || '',
      // Account scoping: which user this notification is FOR. null = legacy/unscoped.
      recipientUserId: recipientUserId || null,
      // Source activity-log id, used to de-duplicate generated notifications.
      sourceLogId: sourceLogId || null,
      projectName: projectName || '',
      timestamp: Date.now(),
      read: false,
    }
    store.put(notification)
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = reject
    })
    // Dispatch custom event so UI can react
    window.dispatchEvent(new CustomEvent('zc-notification', { detail: notification }))
    return notification
  } catch (err) {
    console.error('[NotificationService] addNotification error:', err)
    return null
  }
}

export async function getNotifications(limit = 50, recipientUserId) {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    let all = await new Promise((resolve, reject) => {
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    // Account scoping: when a recipientUserId is provided, only return that
    // account's notifications. Stored null/undefined recipients never match a
    // real user, so other accounts on the same machine never see them.
    if (recipientUserId) {
      all = all.filter((n) => n.recipientUserId === recipientUserId)
    }
    // Sort by timestamp descending (newest first)
    all.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    return all.slice(0, limit)
  } catch (err) {
    console.error('[NotificationService] getNotifications error:', err)
    return []
  }
}

export async function getUnreadCount(recipientUserId) {
  try {
    const all = await getNotifications(200, recipientUserId)
    return all.filter((n) => !n.read).length
  } catch {
    return 0
  }
}

/**
 * Return a Set of sourceLogId values already present in the store (optionally
 * scoped to a recipient). Used by the generator to avoid creating duplicate
 * notifications for the same activity log.
 */
export async function getExistingSourceLogIds(recipientUserId) {
  try {
    const all = await getNotifications(1000, recipientUserId)
    const ids = new Set()
    for (const n of all) {
      if (n.sourceLogId) ids.add(n.sourceLogId)
    }
    return ids
  } catch {
    return new Set()
  }
}

export async function markAsRead(notificationId) {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const existing = await new Promise((resolve, reject) => {
      const req = store.get(notificationId)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    if (existing) {
      existing.read = true
      store.put(existing)
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = reject
    })
  } catch (err) {
    console.error('[NotificationService] markAsRead error:', err)
  }
}

export async function markAllAsRead() {
  try {
    const all = await getNotifications(200)
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    for (const n of all) {
      if (!n.read) {
        n.read = true
        store.put(n)
      }
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = reject
    })
    window.dispatchEvent(new CustomEvent('zc-notification', { detail: { type: 'mark_all_read' } }))
  } catch (err) {
    console.error('[NotificationService] markAllAsRead error:', err)
  }
}

export async function clearAllNotifications() {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.clear()
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = reject
    })
    window.dispatchEvent(new CustomEvent('zc-notification', { detail: { type: 'cleared' } }))
  } catch (err) {
    console.error('[NotificationService] clearAllNotifications error:', err)
  }
}

export function formatNotificationTime(timestamp) {
  if (!timestamp) return ''
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}
