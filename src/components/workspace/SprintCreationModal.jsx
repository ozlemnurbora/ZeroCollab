import { useState } from 'react'
import { Modal } from '../ui/Modal.jsx'
import { Button } from '../ui/Button.jsx'

export function SprintCreationModal({ open, onClose, onCreate }) {
  const [durationWeeks, setDurationWeeks] = useState(2)
  const [sprintGoal, setSprintGoal] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleCreate = async () => {
    setError('')
    setIsSubmitting(true)
    try {
      await onCreate?.({
        durationWeeks: Number(durationWeeks),
        sprintGoal: sprintGoal.trim(),
      })
      setSprintGoal('')
      onClose?.()
    } catch (err) {
      setError(err?.message || 'Failed to create sprint.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Sprint"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleCreate()} disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Sprint'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        {error ? <p className="text-xs text-rose-400">{error}</p> : null}
        <div>
          <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
            Sprint duration
          </label>
          <select
            value={durationWeeks}
            onChange={(e) => setDurationWeeks(Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          >
            <option value={1}>1 week</option>
            <option value={2}>2 weeks</option>
            <option value={3}>3 weeks</option>
            <option value={4}>4 weeks</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
            Sprint Goal
          </label>
          <textarea
            value={sprintGoal}
            onChange={(e) => setSprintGoal(e.target.value)}
            className="mt-1 min-h-[96px] w-full resize-y rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
        </div>
      </div>
    </Modal>
  )
}

