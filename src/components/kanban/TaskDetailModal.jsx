import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../ui/Modal.jsx'
import { Button } from '../ui/Button.jsx'
import { useLanguage } from '../../utils/LanguageContext.jsx'
import { useAuth } from '../../utils/AuthContext.jsx'
import { loadMessages, saveMessage } from '../chat/chatStorage.js'
import { broadcastMessage } from '../../utils/hubManager.js'
import { on, P2P_EVENTS, sendToAllPeers } from '../../utils/p2pManager.js'
import {
  normalizeStoryPointsValue,
  storyPointOptionsForValue,
} from './taskStorage.js'

function normalizeCalendarType(v) {
  return v === 'general' ? 'general' : 'personal'
}

function createMessageId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function formatMessageTime(timestamp) {
  const parsed = Number(timestamp)
  if (!Number.isFinite(parsed)) return ''
  try {
    return new Date(parsed).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function isTaskChatMessage(message, taskId, projectId) {
  if (!message || message.kind !== 'task-chat') return false
  if (message.taskId !== taskId) return false
  return (message.projectId ?? null) === (projectId ?? null)
}

function getItemTypeLabel(itemType) {
  const map = {
    epic: 'Epic',
    feature: 'Feature',
    user_story: 'User Story',
    task: 'Task',
  }
  return map[itemType] || 'Task'
}

function getBacklogStateLabel(backlogState) {
  const map = {
    new: 'New',
    refined: 'Refined',
    ready: 'Ready',
  }
  return map[backlogState] || 'New'
}

function getPriorityLabel(priority) {
  if (priority === 'should') return 'Should-have'
  if (priority === 'could') return 'Could-have'
  if (priority === 'wont') return 'Won’t-have'
  return 'Must-have'
}

export function TaskDetailModal({
  open,
  onClose,
  task,
  onUpdate,
  onDelete,
  customCalendars,
  initialEdit = false,
}) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const [isEditing, setIsEditing] = useState(!!initialEdit)
  const [form, setForm] = useState(() => (task ? { ...task } : null))
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const currentUserId = user?.id || null
  const currentUserName =
    String(user?.user_metadata?.full_name || '').trim() ||
    String(user?.email || '').split('@')[0] ||
    t('chat_anonymous')
  const taskChannelId = task?.id ? `task:${task.id}` : ''

  const calendarOptions = useMemo(() => {
    const base = [
      { id: 'personal', name: t('cal_calendar_personal') },
      { id: 'general', name: t('cal_calendar_general') },
    ]
    const customs = Array.isArray(customCalendars)
      ? customCalendars.map((c) => ({ id: c.id, name: c.name }))
      : []
    return [...base, ...customs]
  }, [customCalendars, t])

  const calendarDisplay = useMemo(() => {
    const id = task?.calendarId || task?.calendarType || 'personal'
    const match = calendarOptions.find((c) => c.id === id)
    return match?.name || id
  }, [calendarOptions, task])

  useEffect(() => {
    if (!open) return
    setIsEditing(!!initialEdit)
    setForm(task ? { ...task } : null)
    setInput('')
  }, [open, task, initialEdit])

  useEffect(() => {
    if (!open || !task?.id || !currentUserId) {
      if (!open || !task?.id) setMessages([])
      return
    }
    let cancelled = false
    void (async () => {
      const all = await loadMessages(currentUserId)
      if (cancelled) return
      const filtered = (Array.isArray(all) ? all : [])
        .filter((m) => isTaskChatMessage(m, task.id, task.projectId))
        .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      setMessages(filtered)
    })()
    return () => {
      cancelled = true
    }
  }, [open, task?.id, task?.projectId, currentUserId])

  useEffect(() => {
    if (!open || !task?.id || !currentUserId) return
    const pushIncoming = (incoming) => {
      if (!isTaskChatMessage(incoming, task.id, task.projectId)) return
      setMessages((prev) => {
        if (prev.some((m) => m.id === incoming.id)) return prev
        return [...prev, incoming].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      })
      void saveMessage({ ...incoming, ownerUserId: currentUserId }, currentUserId)
    }

    const offP2PMessage = on(P2P_EVENTS.MESSAGE, ({ data }) => {
      if (data?.type !== 'chat-message') return
      pushIncoming(data.payload)
    })
    const onHubMessage = (e) => {
      const incoming = e.detail
      if (!incoming || incoming.action === 'task-sync' || incoming.action === 'task-delete')
        return
      pushIncoming(incoming)
    }
    window.addEventListener('hub:message', onHubMessage)

    return () => {
      offP2PMessage()
      window.removeEventListener('hub:message', onHubMessage)
    }
  }, [open, task?.id, task?.projectId, currentUserId])

  const handleSendMessage = async () => {
    const text = input.trim()
    if (!text || !task?.id || !currentUserId) return
    const message = {
      id: createMessageId(),
      channelId: taskChannelId,
      taskId: task.id,
      projectId: task.projectId ?? null,
      sender: currentUserName,
      senderUserId: currentUserId,
      text,
      createdAt: Date.now(),
      kind: 'task-chat',
      ownerUserId: currentUserId,
    }
    await saveMessage(message, currentUserId)
    setMessages((prev) =>
      [...prev, message].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)),
    )
    setInput('')
    sendToAllPeers({ type: 'chat-message', payload: message })
    void broadcastMessage(message).catch((err) =>
      console.error('[TaskDetailModal] task chat broadcast failed:', err),
    )
  }

  if (!task) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title={t('task_detail_title')}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              {t('btn_close')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[rgb(var(--zc-muted))]">{t('loading_tasks')}</p>
      </Modal>
    )
  }

  const value = form || task
  const itemType = value.itemType || 'task'
  const backlogState = value.backlogState || 'new'
  const priority = value.priority || 'must'
  const userStoryText =
    (value.userStoryText || '').trim() ||
    (value.userStoryRole || value.userStoryCapability || value.userStoryBenefit
      ? `As a ${(value.userStoryRole || '').trim()}, I want ${(value.userStoryCapability || '').trim()}, so that ${(value.userStoryBenefit || '').trim()}.`
      : '')

  const commitSave = () => {
    if (!form) return
    const calendarId = (form.calendarId || '').trim()
    const calendarType = normalizeCalendarType(form.calendarType)
    const nextCalendarType =
      calendarId && calendarId !== 'general' && calendarId !== 'personal'
        ? 'personal'
        : calendarType

    onUpdate?.(task.id, {
      title: (form.title || '').trim(),
      description: (form.description || '').trim(),
      assignee: (form.assignee || '').trim(),
      priority: form.priority || 'must',
      itemType: form.itemType || 'task',
      backlogState: form.backlogState || 'new',
      acceptanceCriteria: (form.acceptanceCriteria || '').trim(),
      userStoryRole: form.userStoryRole || '',
      userStoryCapability: form.userStoryCapability || '',
      userStoryBenefit: form.userStoryBenefit || '',
      userStoryText:
        (form.itemType || 'task') === 'user_story'
          ? `As a ${(form.userStoryRole || '').trim()}, I want ${(form.userStoryCapability || '').trim()}, so that ${(form.userStoryBenefit || '').trim()}.`
          : form.userStoryText || '',
      startDate: form.startDate || '',
      dueDate: form.dueDate || '',
      status: form.status || 'todo',
      calendarId: calendarId || '',
      calendarType: nextCalendarType,
      storyPoints: normalizeStoryPointsValue(
        form.storyPoints ?? form.story_points ?? 0,
      ),
    })
    setIsEditing(false)
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setIsEditing(false)
        onClose?.()
      }}
      title={t('task_detail_title')}
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="secondary"
            onClick={() => onDelete?.(task.id)}
            className="text-rose-200 hover:text-rose-100"
          >
            {t('task_delete')}
          </Button>

          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsEditing(false)
                    setForm(task ? { ...task } : null)
                  }}
                >
                  {t('btn_cancel')}
                </Button>
                <Button onClick={commitSave}>{t('task_save')}</Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={onClose}>
                  {t('btn_close')}
                </Button>
                <Button onClick={() => setIsEditing(true)}>{t('task_edit')}</Button>
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="grid gap-4">
        <div>
          <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
            {t('label_title')}
          </label>
          <input
            disabled={!isEditing}
            value={value.title || ''}
            onChange={(e) =>
              setForm((s) => ({ ...(s || {}), title: e.target.value }))
            }
            className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-70"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
              {t('task_assignee')}
            </label>
            {isEditing ? (
              <input
                type="text"
                value={value.assignee || ''}
                onChange={(e) =>
                  setForm((s) => ({ ...(s || {}), assignee: e.target.value }))
                }
                className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            ) : (
              <p className="mt-2 text-sm text-[rgb(var(--zc-text))]">
                {(value.assignee || '').trim() || t('task_no_date')}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
              {t('label_calendar')}
            </label>
            {isEditing ? (
              <select
                value={value.calendarId || value.calendarType || 'personal'}
                onChange={(e) =>
                  setForm((s) => ({
                    ...(s || {}),
                    calendarId: e.target.value,
                    calendarType:
                      e.target.value === 'general' ? 'general' : 'personal',
                  }))
                }
                className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              >
                {calendarOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-2 text-sm text-[rgb(var(--zc-text))]">{calendarDisplay}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
              {t('task_start_date')}
            </label>
            <input
              type="date"
              disabled={!isEditing}
              value={value.startDate || ''}
              onChange={(e) =>
                setForm((s) => ({ ...(s || {}), startDate: e.target.value }))
              }
              className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-70"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
              {t('label_due_date')}
            </label>
            <input
              type="date"
              disabled={!isEditing}
              value={value.dueDate || ''}
              onChange={(e) =>
                setForm((s) => ({ ...(s || {}), dueDate: e.target.value }))
              }
              className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-70"
            />
          </div>
        </div>

        <section className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] p-3">
          <h3 className="text-sm font-semibold text-[rgb(var(--zc-text))]">Backlog Item</h3>
          {isEditing ? (
            <div className="mt-3 grid gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
                    Backlog Item Type
                  </label>
                  <select
                    value={itemType}
                    onChange={(e) =>
                      setForm((s) => ({ ...(s || {}), itemType: e.target.value }))
                    }
                    className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  >
                    <option value="epic">Epic</option>
                    <option value="feature">Feature</option>
                    <option value="user_story">User Story</option>
                    <option value="task">Task</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
                    Backlog State
                  </label>
                  <select
                    value={backlogState}
                    onChange={(e) =>
                      setForm((s) => ({ ...(s || {}), backlogState: e.target.value }))
                    }
                    className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  >
                    <option value="new">New</option>
                    <option value="refined">Refined</option>
                    <option value="ready">Ready</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) =>
                    setForm((s) => ({ ...(s || {}), priority: e.target.value }))
                  }
                  className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                >
                  <option value="must">Must-have</option>
                  <option value="should">Should-have</option>
                  <option value="could">Could-have</option>
                  <option value="wont">Won’t-have</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
                  Story Points
                </label>
                <select
                  value={normalizeStoryPointsValue(
                    value.storyPoints ?? value.story_points ?? 0,
                  )}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...(s || {}),
                      storyPoints: Number(e.target.value),
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                >
                  {storyPointOptionsForValue(
                    value.storyPoints ?? value.story_points ?? 0,
                  ).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              {itemType === 'user_story' ? (
                <div className="grid gap-4">
                  <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
                    User Story
                  </label>
                  <input
                    value={value.userStoryRole || ''}
                    onChange={(e) =>
                      setForm((s) => ({ ...(s || {}), userStoryRole: e.target.value }))
                    }
                    placeholder="As a [role]"
                    className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                  <input
                    value={value.userStoryCapability || ''}
                    onChange={(e) =>
                      setForm((s) => ({ ...(s || {}), userStoryCapability: e.target.value }))
                    }
                    placeholder="I want [capability]"
                    className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                  <input
                    value={value.userStoryBenefit || ''}
                    onChange={(e) =>
                      setForm((s) => ({ ...(s || {}), userStoryBenefit: e.target.value }))
                    }
                    placeholder="So that [benefit]"
                    className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
              ) : null}

              <div>
                <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
                  Acceptance Criteria
                </label>
                <textarea
                  value={value.acceptanceCriteria || ''}
                  onChange={(e) =>
                    setForm((s) => ({ ...(s || {}), acceptanceCriteria: e.target.value }))
                  }
                  placeholder={'- Criterion 1\n- Criterion 2\n- Criterion 3'}
                  className="mt-1 min-h-[100px] w-full resize-y rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-2 text-sm">
              <p className="text-[rgb(var(--zc-text))]">
                <span className="text-[rgb(var(--zc-muted))]">Backlog Item Type: </span>
                {getItemTypeLabel(itemType)}
              </p>
              <p className="text-[rgb(var(--zc-text))]">
                <span className="text-[rgb(var(--zc-muted))]">Backlog State: </span>
                {getBacklogStateLabel(backlogState)}
              </p>
              <p className="text-[rgb(var(--zc-text))]">
                <span className="text-[rgb(var(--zc-muted))]">Priority: </span>
                {getPriorityLabel(priority)}
              </p>
              <p className="text-[rgb(var(--zc-text))]">
                <span className="text-[rgb(var(--zc-muted))]">Story Points: </span>
                {normalizeStoryPointsValue(
                  value.storyPoints ?? value.story_points ?? 0,
                )}
              </p>
              {itemType === 'user_story' && userStoryText ? (
                <p className="text-[rgb(var(--zc-text))]">
                  <span className="text-[rgb(var(--zc-muted))]">User Story: </span>
                  {userStoryText}
                </p>
              ) : null}
              {value.acceptanceCriteria ? (
                <div>
                  <p className="text-[rgb(var(--zc-muted))]">Acceptance Criteria</p>
                  <p className="whitespace-pre-wrap text-[rgb(var(--zc-text))]">
                    {value.acceptanceCriteria}
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </section>

        <div>
          <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
            {t('label_status')}
          </label>
          {isEditing ? (
            <select
              value={value.status || 'todo'}
              onChange={(e) =>
                setForm((s) => ({ ...(s || {}), status: e.target.value }))
              }
              className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              <option value="todo">{t('status_todo')}</option>
              <option value="in_progress">{t('status_in_progress')}</option>
              <option value="in_review">{t('status_in_review')}</option>
              <option value="done">{t('status_done')}</option>
            </select>
          ) : (
            <p className="mt-2 text-sm text-[rgb(var(--zc-text))]">
              {value.status === 'done'
                ? t('status_done')
                : value.status === 'in_progress'
                  ? t('status_in_progress')
                  : value.status === 'in_review'
                    ? t('status_in_review')
                    : t('status_todo')}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
            {t('label_description')}
          </label>
          <textarea
            disabled={!isEditing}
            value={value.description || ''}
            onChange={(e) =>
              setForm((s) => ({ ...(s || {}), description: e.target.value }))
            }
            className="mt-1 min-h-[120px] w-full resize-y rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-70"
          />
        </div>

        <section className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] p-3">
          <h3 className="text-sm font-semibold text-[rgb(var(--zc-text))]">Task Chat</h3>
          <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
            {messages.length === 0 ? (
              <p className="text-xs text-[rgb(var(--zc-muted2))]">
                No messages yet for this task.
              </p>
            ) : (
              messages.map((message) => {
                const mine = currentUserId && message.senderUserId === currentUserId
                return (
                  <div
                    key={message.id}
                    className={`max-w-[92%] rounded-lg border px-3 py-2 text-sm ${
                      mine
                        ? 'ml-auto border-indigo-400/30 bg-indigo-500/15'
                        : 'mr-auto border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-[rgb(var(--zc-muted))]">
                        {message.sender || t('chat_anonymous')}
                      </span>
                      <span className="text-[11px] text-[rgb(var(--zc-subtle))]">
                        {formatMessageTime(message.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-[rgb(var(--zc-text))]">
                      {message.text}
                    </p>
                  </div>
                )
              })
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void handleSendMessage()
                }
              }}
              placeholder="Write a message..."
              className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
            <Button onClick={() => void handleSendMessage()} disabled={!input.trim()}>
              Send
            </Button>
          </div>
        </section>
      </div>
    </Modal>
  )
}

