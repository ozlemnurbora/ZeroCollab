import { useState, useEffect } from 'react'
import { Button } from '../ui/Button.jsx'
import { Modal } from '../ui/Modal.jsx'

export function MeetingDetailModal({ open, onClose, meeting, onUpdate, onDelete }) {
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState({})

  useEffect(() => {
    if (meeting) setForm(meeting)
    setIsEditing(false)
  }, [meeting])

  if (!meeting) return null

  const handleSave = () => {
    onUpdate?.({ ...meeting, ...form })
    setIsEditing(false)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit Meeting' : meeting.title}
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button variant="danger" onClick={() => { onDelete?.(meeting.id); onClose?.() }}>
            Delete Meeting
          </Button>
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <Button variant="secondary" onClick={() => setIsEditing(false)}>Cancel</Button>
                <Button onClick={handleSave}>Save</Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={onClose}>Close</Button>
                <Button onClick={() => setIsEditing(true)}>Edit</Button>
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="grid gap-4">
        {isEditing ? (
          <>
            <div>
              <label className="block text-sm font-medium text-[rgb(var(--zc-muted))] mb-1">Title</label>
              <input
                type="text"
                className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                value={form.title || ''}
                onChange={e => setForm(s => ({ ...s, title: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[rgb(var(--zc-muted))] mb-1">Date</label>
                <input
                  type="date"
                  className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  value={form.date || ''}
                  onChange={e => setForm(s => ({ ...s, date: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[rgb(var(--zc-muted))] mb-1">Time</label>
                <input
                  type="time"
                  className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  value={form.time || ''}
                  onChange={e => setForm(s => ({ ...s, time: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[rgb(var(--zc-muted))] mb-1">Duration</label>
                <select
                  className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  value={form.duration || 60}
                  onChange={e => setForm(s => ({ ...s, duration: Number(e.target.value) }))}
                >
                  <option value={15}>15 min</option>
                  <option value={30}>30 min</option>
                  <option value={60}>1 hour</option>
                  <option value={90}>1.5 hours</option>
                  <option value={120}>2 hours</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[rgb(var(--zc-muted))] mb-1">Recurring</label>
                <select
                  className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  value={form.recurring || 'none'}
                  onChange={e => setForm(s => ({ ...s, recurring: e.target.value }))}
                >
                  <option value="none">No repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[rgb(var(--zc-muted))] mb-1">Description</label>
              <textarea
                className="w-full min-h-[80px] resize-y rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                value={form.description || ''}
                onChange={e => setForm(s => ({ ...s, description: e.target.value }))}
              />
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-[rgb(var(--zc-border)/0.3)] p-3">
                <p className="text-xs text-[rgb(var(--zc-muted2))]">Date</p>
                <p className="text-sm font-medium text-[rgb(var(--zc-text))] mt-1">{meeting.date}</p>
              </div>
              <div className="rounded-lg bg-[rgb(var(--zc-border)/0.3)] p-3">
                <p className="text-xs text-[rgb(var(--zc-muted2))]">Time</p>
                <p className="text-sm font-medium text-[rgb(var(--zc-text))] mt-1">{meeting.time}</p>
              </div>
              <div className="rounded-lg bg-[rgb(var(--zc-border)/0.3)] p-3">
                <p className="text-xs text-[rgb(var(--zc-muted2))]">Duration</p>
                <p className="text-sm font-medium text-[rgb(var(--zc-text))] mt-1">{meeting.duration} min</p>
              </div>
              <div className="rounded-lg bg-[rgb(var(--zc-border)/0.3)] p-3">
                <p className="text-xs text-[rgb(var(--zc-muted2))]">Recurring</p>
                <p className="text-sm font-medium text-[rgb(var(--zc-text))] mt-1 capitalize">{meeting.recurring === 'none' ? 'No repeat' : meeting.recurring}</p>
              </div>
            </div>
            {meeting.description && (
              <div>
                <p className="text-xs text-[rgb(var(--zc-muted2))] mb-1">Description</p>
                <p className="text-sm text-[rgb(var(--zc-muted))]">{meeting.description}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-[rgb(var(--zc-muted2))] mb-1">Calendar</p>
              <span className={`text-xs rounded-full px-2 py-1 ${
                meeting.calendarType === 'general'
                  ? 'bg-indigo-500/15 text-indigo-300'
                  : 'bg-emerald-500/15 text-emerald-300'
              }`}>
                {meeting.calendarType}
              </span>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
