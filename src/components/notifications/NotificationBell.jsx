import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  clearAllNotifications,
  formatNotificationTime,
} from '../../utils/notificationService.js'
import { useAuth } from '../../utils/AuthContext.jsx'
import { useWorkspace } from '../../utils/WorkspaceContext.jsx'
import { generateNotificationsForUser } from '../../utils/notificationGenerator.js'

export function NotificationBell() {
  const { user } = useAuth()
  const { projects } = useWorkspace()
  const userId = user?.id ?? null
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const panelRef = useRef(null)

  const refresh = useCallback(async () => {
    const items = await getNotifications(30, userId)
    setNotifications(items)
    const count = await getUnreadCount(userId)
    setUnreadCount(count)
  }, [userId])

  useEffect(() => {
    refresh()
    const handler = () => refresh()
    window.addEventListener('zc-notification', handler)
    // Poll every 30 seconds
    const interval = setInterval(refresh, 30000)
    return () => {
      window.removeEventListener('zc-notification', handler)
      clearInterval(interval)
    }
  }, [refresh])

  // Derive notifications from the synced Activity Log: on load, on every new
  // log (`zc-log`), and on a 30s poll. Guarded so concurrent runs can't double up.
  useEffect(() => {
    if (!user?.id) return undefined
    let running = false
    let pending = false
    const run = async () => {
      if (running) {
        pending = true
        return
      }
      running = true
      try {
        await generateNotificationsForUser(user, projects)
      } finally {
        running = false
        if (pending) {
          pending = false
          void run()
        }
      }
    }
    void run()
    const onLog = () => void run()
    window.addEventListener('zc-log', onLog)
    const interval = setInterval(() => void run(), 30000)
    return () => {
      window.removeEventListener('zc-log', onLog)
      clearInterval(interval)
    }
  }, [user, projects])

  // Close panel on outside click
  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  const handleMarkAllRead = async () => {
    await markAllAsRead()
    refresh()
  }

  const handleClearAll = async () => {
    await clearAllNotifications()
    refresh()
  }

  const handleClickNotification = async (notif) => {
    if (!notif.read) {
      await markAsRead(notif.id)
      refresh()
    }
  }

  const getNotifIcon = (type) => {
    switch (type) {
      case 'task_moved': return '📋'
      case 'task_assigned': return '📋'
      case 'task_created': return '➕'
      case 'task_deleted': return '🗑️'
      case 'sprint_completed': return '🏁'
      case 'meeting_created': return '📅'
      default: return '🔔'
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="relative rounded-md p-1.5 text-[rgb(var(--zc-muted))] hover:bg-[rgb(var(--zc-border)/0.5)] hover:text-[rgb(var(--zc-text))] transition"
      >
        <span className="text-lg">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-2 w-80 rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel))] shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[rgb(var(--zc-border))] px-4 py-2.5">
            <h3 className="text-sm font-semibold text-[rgb(var(--zc-text))]">
              🔔 Notifications
              {unreadCount > 0 && (
                <span className="ml-1.5 rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-400">
                  {unreadCount} new
                </span>
              )}
            </h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="rounded px-2 py-0.5 text-[10px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition"
                >
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="rounded px-2 py-0.5 text-[10px] font-semibold bg-rose-600 text-white hover:bg-rose-700 transition"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Notification List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[rgb(var(--zc-muted2))]">
                No notifications yet
              </div>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif.id}
                  type="button"
                  onClick={() => handleClickNotification(notif)}
                  className={`w-full px-4 py-2.5 text-left border-b border-[rgb(var(--zc-border)/0.5)] hover:bg-[rgb(var(--zc-border)/0.2)] transition ${!notif.read ? 'bg-indigo-500/5' : ''}`}
                >
                  <div className="flex gap-2">
                    <span className="mt-0.5 text-sm shrink-0">{getNotifIcon(notif.type)}</span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs ${!notif.read ? 'font-semibold text-[rgb(var(--zc-text))]' : 'text-[rgb(var(--zc-muted))]'}`}>
                        {notif.message}
                      </p>
                      <p className="mt-0.5 text-[10px] text-[rgb(var(--zc-subtle))]">
                        {formatNotificationTime(notif.timestamp)}
                      </p>
                    </div>
                    {!notif.read && (
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-400"></span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
