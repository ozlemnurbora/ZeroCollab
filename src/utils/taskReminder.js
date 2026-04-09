const REMINDER_KEY = 'zc-sent-reminders'

function getSentReminders() {
  try {
    return JSON.parse(localStorage.getItem(REMINDER_KEY) || '[]')
  } catch {
    return []
  }
}

function markReminderSent(taskId) {
  const sent = getSentReminders()
  if (!sent.includes(taskId)) {
    sent.push(taskId)
    localStorage.setItem(REMINDER_KEY, JSON.stringify(sent))
  }
}

function wasReminderSent(taskId) {
  return getSentReminders().includes(taskId)
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const permission = await Notification.requestPermission()
  return permission === 'granted'
}

export function checkTaskReminders(tasks) {
  console.log('[Reminder] checking', tasks?.length, 'tasks')
  console.log(
    '[Reminder] notification permission:',
    'Notification' in window ? Notification.permission : 'unsupported',
  )

  if (!('Notification' in window)) {
    console.log('[Reminder] Notifications not supported')
    return
  }
  if (Notification.permission !== 'granted') {
    console.log('[Reminder] Permission not granted:', Notification.permission)
    return
  }

  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowDateStr = tomorrow.toISOString().slice(0, 10)

  console.log('[Reminder] now:', now.toISOString())
  console.log('[Reminder] tomorrow (UTC date):', tomorrowDateStr)

  const list = Array.isArray(tasks) ? tasks : []
  for (const task of list) {
    if (!task.dueDate || task.status === 'done') continue
    if (wasReminderSent(task.id)) continue

    if (task.dueDate === tomorrowDateStr) {
      console.log('[Reminder] SENDING notification for:', task.title)
      try {
        new Notification('ZeroCollab — Görev Hatırlatıcı', {
          body: `"${task.title}" görevi yarın son bulacak (${task.dueDate})`,
          icon: '/icons/icon-192x192.png',
          tag: `task-reminder-${task.id}`,
        })
        markReminderSent(task.id)
      } catch (err) {
        console.error('[Reminder] notification error:', err)
      }
    }
  }
}

export function startReminderChecker(getTasksFn) {
  const run = () => {
    const list = getTasksFn?.()
    checkTaskReminders(Array.isArray(list) ? list : [])
  }
  run()
  const interval = setInterval(run, 60 * 60 * 1000)
  return () => clearInterval(interval)
}
