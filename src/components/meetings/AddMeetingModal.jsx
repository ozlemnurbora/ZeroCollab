import { useEffect, useState } from 'react'
import { Button } from '../ui/Button.jsx'
import { Modal } from '../ui/Modal.jsx'

const initialForm = {
  title: '',
  date: '',
  time: '',
  duration: 60,
  recurring: 'none',
  calendarType: 'general',
  description: '',
}

export function AddMeetingModal({ open, onClose, onCreate }) {
  const [form, setForm] = useState(initialForm)

  useEffect(() => {
    if (!open) return
    const resetTimer = window.setTimeout(() => {
      setForm(initialForm)
    }, 0)
    return () => window.clearTimeout(resetTimer)
  }, [open])

  const handleSubmit = () => {
    if (!form.title.trim() || !form.date || !form.time) return
    onCreate({
      ...form,
      id: `meeting_${Date.now()}`,
      createdAt: Date.now(),
    })
    onClose?.()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Schedule Meeting"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit}>Schedule</Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[rgb(var(--zc-muted))]">Meeting Title</label>
          <input
            type="text"
            className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            placeholder="Weekly standup..."
            value={form.title}
            onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[rgb(var(--zc-muted))]">Date</label>
            <input
              type="date"
              className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              value={form.date}
              onChange={(e) => setForm((s) => ({ ...s, date: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[rgb(var(--zc-muted))]">Time</label>
            <input
              type="time"
              className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              value={form.time}
              onChange={(e) => setForm((s) => ({ ...s, time: e.target.value }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[rgb(var(--zc-muted))]">Duration (minutes)</label>
            <select
              className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              value={form.duration}
              onChange={(e) => setForm((s) => ({ ...s, duration: Number(e.target.value) }))}
            >
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
              <option value={120}>2 hours</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[rgb(var(--zc-muted))]">Recurring</label>
            <select
              className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              value={form.recurring}
              onChange={(e) => setForm((s) => ({ ...s, recurring: e.target.value }))}
            >
              <option value="none">No repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[rgb(var(--zc-muted))]">Calendar</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setForm((s) => ({ ...s, calendarType: 'general' }))}
              className={['flex-1 rounded-md border px-3 py-2 text-sm font-medium transition',
                form.calendarType === 'general'
                  ? 'border-indigo-500 bg-indigo-600 text-white'
                  : 'border-[rgb(var(--zc-border))] text-[rgb(var(--zc-muted))] hover:bg-[rgb(var(--zc-border)/0.4)]',
              ].join(' ')}
            >
              General
            </button>
            <button
              type="button"
              onClick={() => setForm((s) => ({ ...s, calendarType: 'personal' }))}
              className={['flex-1 rounded-md border px-3 py-2 text-sm font-medium transition',
                form.calendarType === 'personal'
                  ? 'border-emerald-500 bg-emerald-600 text-white'
                  : 'border-[rgb(var(--zc-border))] text-[rgb(var(--zc-muted))] hover:bg-[rgb(var(--zc-border)/0.4)]',
              ].join(' ')}
            >
              Personal
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[rgb(var(--zc-muted))]">Description (optional)</label>
          <textarea
            className="min-h-[80px] w-full resize-y rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            placeholder="Meeting agenda..."
            value={form.description}
            onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
          />
        </div>
      </div>
    </Modal>
  )
}
