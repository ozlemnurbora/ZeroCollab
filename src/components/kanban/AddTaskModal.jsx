import { useEffect, useMemo, useState } from 'react'
import { ASSIGNEES } from './kanbanConstants.js'
import { Button } from '../ui/Button.jsx'
import { Modal } from '../ui/Modal.jsx'

const initialForm = {
  title: '',
  description: '',
  assignee: ASSIGNEES[0],
  dueDate: '',
}

export function AddTaskModal({ open, onClose, onCreate, initialValues }) {
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
    if (!form.title.trim()) next.title = 'Title is required.'
    if (!form.assignee) next.assignee = 'Assignee is required.'
    return next
  }, [form])

  const canSubmit = Object.keys(errors).length === 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add task"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
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
            Create task
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <div>
          <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
            Title
          </label>
          <input
            className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            placeholder="e.g. Prepare sprint planning"
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
            Description
          </label>
          <textarea
            className="mt-1 min-h-[96px] w-full resize-y rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            placeholder="Add details, context, links..."
            value={form.description}
            onChange={(e) =>
              setForm((s) => ({ ...s, description: e.target.value }))
            }
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
              Assignee
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
              Due date
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
              Optional. Stored locally for now.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  )
}

