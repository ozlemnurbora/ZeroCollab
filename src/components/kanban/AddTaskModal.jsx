import { useEffect, useMemo, useState } from 'react'
import { Button } from '../ui/Button.jsx'
import { Modal } from '../ui/Modal.jsx'
import { useLanguage } from '../../utils/LanguageContext.jsx'

const initialForm = {
  title: '',
  description: '',
  assignee: '',
  startDate: '',
  dueDate: '',
  calendarId: 'personal',
  projectId: '',
  teamId: '',
}

export function AddTaskModal({
  open,
  onClose,
  onCreate,
  initialValues,
  customCalendars,
  activeProject,
  activeTeam,
}) {
  const { t } = useLanguage()
  const [form, setForm] = useState(initialForm)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!open) return
    const calId = initialValues?.calendarId || initialValues?.calendarType
    const calendarId = calId || initialForm.calendarId
    setForm({
      ...initialForm,
      ...(initialValues ?? {}),
      assignee: initialValues?.assignee ?? initialForm.assignee,
      calendarId,
      projectId: activeProject?.id || '',
      teamId: activeTeam?.id || '',
    })
    setTouched(false)
  }, [open, initialValues, activeProject, activeTeam])

  const errors = useMemo(() => {
    const next = {}
    if (!form.title.trim()) next.title = t('error_title_required')
    if (!form.assignee.trim()) next.assignee = t('error_assignee_required')
    return next
  }, [form, t])

  const canSubmit = Object.keys(errors).length === 0

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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('modal_add_task')}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('btn_cancel')}
          </Button>
          <Button
            onClick={() => {
              setTouched(true)
              if (!canSubmit) return
              const calendarId = form.calendarId || 'personal'
              const calendarType = calendarId === 'general' ? 'general' : 'personal'
              onCreate?.({
                title: form.title.trim(),
                description: form.description.trim(),
                assignee: form.assignee.trim(),
                startDate: form.startDate || '',
                dueDate: form.dueDate || '',
                calendarType,
                calendarId,
                projectId: form.projectId || '',
                teamId: form.teamId || '',
              })
              onClose?.()
            }}
          >
            {t('btn_create_task')}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        {activeProject && (
          <div className="flex items-center gap-2 rounded-lg bg-[rgb(var(--zc-border)/0.3)] px-3 py-2 text-xs">
            <span className={`h-2 w-2 rounded-full ${activeProject.color}`} />
            <span className="text-[rgb(var(--zc-muted))]">Project: </span>
            <span className="text-[rgb(var(--zc-text))] font-medium">{activeProject.name}</span>
            {activeTeam && (
              <>
                <span className="text-[rgb(var(--zc-subtle))]">·</span>
                <span className={`h-2 w-2 rounded-full ${activeTeam.color}`} />
                <span className="text-[rgb(var(--zc-text))] font-medium">{activeTeam.name}</span>
              </>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
            {t('label_title')}
          </label>
          <input
            className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            placeholder={t('placeholder_task_title')}
            value={form.title}
            onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
            onBlur={() => setTouched(true)}
          />
          {touched && errors.title ? (
            <p className="mt-1 text-xs text-rose-300">{errors.title}</p>
          ) : null}
        </div>

        <div>
          <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
            {t('label_calendar')}
          </label>
          <select
            className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            value={form.calendarId || 'personal'}
            onChange={(e) => setForm((s) => ({ ...s, calendarId: e.target.value }))}
          >
            {calendarOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
            {t('label_description')}
          </label>
          <textarea
            className="mt-1 min-h-[96px] w-full resize-y rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            placeholder={t('placeholder_task_desc')}
            value={form.description}
            onChange={(e) =>
              setForm((s) => ({ ...s, description: e.target.value }))
            }
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
            {t('label_assignee')}
          </label>
          <input
            type="text"
            className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            placeholder="Enter assignee name..."
            value={form.assignee}
            onChange={(e) => setForm((s) => ({ ...s, assignee: e.target.value }))}
            onBlur={() => setTouched(true)}
          />
          {touched && errors.assignee ? (
            <p className="mt-1 text-xs text-rose-300">{errors.assignee}</p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
              {t('task_start_date')}
            </label>
            <input
              type="date"
              className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              value={form.startDate}
              onChange={(e) =>
                setForm((s) => ({ ...s, startDate: e.target.value }))
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
              {t('label_due_date')}
            </label>
            <input
              type="date"
              className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              value={form.dueDate}
              onChange={(e) => setForm((s) => ({ ...s, dueDate: e.target.value }))}
            />
            <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
              {t('add_task_due_hint')}
            </p>
          </div>
        </div>
      </div>
    </Modal>
  )
}
