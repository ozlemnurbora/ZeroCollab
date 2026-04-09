import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../ui/Modal.jsx'
import { Button } from '../ui/Button.jsx'
import { useLanguage } from '../../utils/LanguageContext.jsx'

function normalizeCalendarType(v) {
  return v === 'general' ? 'general' : 'personal'
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
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState(null)

  useEffect(() => {
    if (!open) return
    setIsEditing(!!initialEdit)
    setForm(task ? { ...task } : null)
  }, [open, task, initialEdit])

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
      startDate: form.startDate || '',
      dueDate: form.dueDate || '',
      status: form.status || 'todo',
      calendarId: calendarId || '',
      calendarType: nextCalendarType,
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
              <option value="done">{t('status_done')}</option>
            </select>
          ) : (
            <p className="mt-2 text-sm text-[rgb(var(--zc-text))]">
              {value.status === 'done'
                ? t('status_done')
                : value.status === 'in_progress'
                  ? t('status_in_progress')
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
      </div>
    </Modal>
  )
}

