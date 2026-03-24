import { useEffect, useMemo, useState } from 'react'
import { ASSIGNEES } from './kanbanConstants.js'
import { Button } from '../ui/Button.jsx'
import { Modal } from '../ui/Modal.jsx'
import { useLanguage } from '../../utils/LanguageContext.jsx'

const initialForm = {
  title: '',
  description: '',
  assignee: ASSIGNEES[0],
  dueDate: '',
}

export function AddTaskModal({ open, onClose, onCreate, initialValues }) {
  const { t } = useLanguage()
  const [form, setForm] = useState(initialForm)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm({
      ...initialForm,
      ...(initialValues ?? {}),
      assignee: (initialValues?.assignee ?? initialForm.assignee) || ASSIGNEES[0],
    })
    setTouched(false)
  }, [open, initialValues])

  const errors = useMemo(() => {
    const next = {}
    if (!form.title.trim()) next.title = t('error_title_required')
    if (!form.assignee) next.assignee = t('error_assignee_required')
    return next
  }, [form, t])

  const canSubmit = Object.keys(errors).length === 0

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
              onCreate?.({
                title: form.title.trim(),
                description: form.description.trim(),
                assignee: form.assignee,
                dueDate: form.dueDate || '',
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
              {t('label_assignee')}
            </label>
            <select
              className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              value={form.assignee}
              onChange={(e) =>
                setForm((s) => ({ ...s, assignee: e.target.value }))
              }
              onBlur={() => setTouched(true)}
            >
              {ASSIGNEES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {touched && errors.assignee ? (
              <p className="mt-1 text-xs text-rose-300">{errors.assignee}</p>
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
              {t('label_due_date')}
            </label>
            <input
              type="date"
              className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              value={form.dueDate}
              onChange={(e) =>
                setForm((s) => ({ ...s, dueDate: e.target.value }))
              }
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
