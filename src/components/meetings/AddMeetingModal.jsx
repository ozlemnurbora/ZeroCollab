import { useEffect, useMemo, useState } from 'react'
import { Button } from '../ui/Button.jsx'
import { Modal } from '../ui/Modal.jsx'
import { detectConflicts, formatConflictSummary } from '../../utils/calendar/conflictDetection.js'
import { TIMEZONE_OPTIONS, detectLocalTimezone, getTimezoneAbbreviation, convertTime } from '../../utils/calendar/timezoneUtils.js'

const initialForm = {
  title: '',
  date: '',
  time: '',
  duration: 60,
  recurring: 'none',
  calendarType: 'general',
  description: '',
  timezone: detectLocalTimezone(),
}

export function AddMeetingModal({ open, onClose, onCreate, existingMeetings = [], existingTasks = [] }) {
  const [form, setForm] = useState(initialForm)
  const [showTimezonePreview, setShowTimezonePreview] = useState(false)
  const [previewTimezone, setPreviewTimezone] = useState('')

  useEffect(() => {
    if (!open) return
    const resetTimer = window.setTimeout(() => {
      setForm({ ...initialForm, timezone: detectLocalTimezone() })
    }, 0)
    return () => window.clearTimeout(resetTimer)
  }, [open])

  const conflictResult = useMemo(() => {
    if (!form.date || !form.time) return { hasConflict: false, conflicts: [] }
    return detectConflicts(form, existingMeetings, existingTasks, { checkTasks: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.date, form.time, form.duration, existingMeetings, existingTasks])

  const timezonePreviewResult = useMemo(() => {
    if (!form.time || !form.date || !previewTimezone || previewTimezone === form.timezone) return null
    return convertTime(form.time, form.date, form.timezone, previewTimezone)
  }, [form.time, form.date, form.timezone, previewTimezone])

  const localTzAbbr = getTimezoneAbbreviation(form.timezone)
  // formatConflictSummary is exposed for callers that need a one-line summary
  // (e.g. localized toast/banner). Currently the modal renders its own inline
  // warning list, so we just keep the reference to satisfy lint while keeping
  // the import for future i18n hookup.
  void formatConflictSummary

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
        <div className="flex items-center justify-end gap-2">
          {conflictResult.hasConflict && (
            <span className="mr-auto text-xs text-amber-400">
              ⚠ {conflictResult.conflicts.length} conflict{conflictResult.conflicts.length > 1 ? 's' : ''} detected
            </span>
          )}
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
            <label className="mb-1 block text-sm font-medium text-[rgb(var(--zc-muted))]">
              Time
              {form.time && (
                <span className="ml-1 font-normal text-[rgb(var(--zc-subtle))]">({localTzAbbr})</span>
              )}
            </label>
            <input
              type="time"
              className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              value={form.time}
              onChange={(e) => setForm((s) => ({ ...s, time: e.target.value }))}
            />
          </div>
        </div>

        {conflictResult.hasConflict && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-base leading-none">⚠️</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-amber-300">Scheduling Conflict Detected</p>
                <ul className="mt-1.5 space-y-1">
                  {conflictResult.conflicts.map((c) => (
                    <li key={c.id} className="text-xs text-amber-200/80">
                      <span className="font-medium">{c.title}</span>
                      {c.type === 'meeting' && <span className="text-amber-200/60"> — {c.time}</span>}
                      {c.type === 'task' && <span className="text-amber-200/60"> — task due this date</span>}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[11px] text-amber-200/50">
                  You can still schedule this meeting, but be aware of the overlap.
                </p>
              </div>
            </div>
          </div>
        )}

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
          <label className="mb-1 block text-sm font-medium text-[rgb(var(--zc-muted))]">Time Zone</label>
          <select
            className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            value={form.timezone}
            onChange={(e) => setForm((s) => ({ ...s, timezone: e.target.value }))}
          >
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label} ({tz.offsetLabel})</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-[rgb(var(--zc-subtle))]">
            Auto-detected: {localTzAbbr}. Change if scheduling for another timezone.
          </p>
        </div>

        {form.time && form.date && (
          <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.25)] px-3 py-2.5">
            <button
              type="button"
              onClick={() => setShowTimezonePreview((v) => !v)}
              className="flex w-full items-center gap-2 text-left text-xs font-medium text-[rgb(var(--zc-muted2))] hover:text-[rgb(var(--zc-text))]"
            >
              <span className="text-base leading-none">🌍</span>
              <span>View in another time zone</span>
              <span className="ml-auto text-[10px]">{showTimezonePreview ? '▲' : '▼'}</span>
            </button>
            {showTimezonePreview && (
              <div className="mt-2 space-y-2 border-t border-[rgb(var(--zc-border))] pt-2">
                <select
                  className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 py-1.5 text-xs text-[rgb(var(--zc-text))] focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                  value={previewTimezone}
                  onChange={(e) => setPreviewTimezone(e.target.value)}
                >
                  <option value="">Select a timezone to compare...</option>
                  {TIMEZONE_OPTIONS.filter((tz) => tz.value !== form.timezone).map((tz) => (
                    <option key={tz.value} value={tz.value}>{tz.label} ({tz.offsetLabel})</option>
                  ))}
                </select>
                {timezonePreviewResult && (
                  <div className="flex items-center gap-3 rounded-md bg-[rgb(var(--zc-border)/0.3)] px-3 py-2">
                    <div className="text-center">
                      <p className="text-xs text-[rgb(var(--zc-subtle))]">{getTimezoneAbbreviation(form.timezone)}</p>
                      <p className="text-lg font-semibold text-[rgb(var(--zc-text))]">{form.time}</p>
                    </div>
                    <span className="text-[rgb(var(--zc-subtle))]">→</span>
                    <div className="text-center">
                      <p className="text-xs text-[rgb(var(--zc-subtle))]">{getTimezoneAbbreviation(previewTimezone)}</p>
                      <p className="text-lg font-semibold text-indigo-300">{timezonePreviewResult.time}</p>
                      {timezonePreviewResult.dayShift !== 0 && (
                        <p className="text-[10px] text-amber-400">
                          {timezonePreviewResult.dayShift > 0 ? '+1 day' : '-1 day'} ({timezonePreviewResult.date})
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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
