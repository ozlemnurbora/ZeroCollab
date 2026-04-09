import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal.jsx'
import { Button } from '../ui/Button.jsx'

export function TeamDetailModal({ open, onClose, team, onUpdate, onDelete }) {
  const [name, setName] = useState(team?.name || '')
  const [members, setMembers] = useState(team?.members || [])
  const [newMember, setNewMember] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    if (!team) return
    setName(team.name || '')
    setMembers(team.members || [])
  }, [team])

  useEffect(() => {
    if (!open) setIsEditing(false)
  }, [open])

  if (!team) return null

  const addMember = () => {
    const m = newMember.trim()
    if (!m || members.includes(m)) return
    setMembers((prev) => [...prev, m])
    setNewMember('')
  }

  const removeMember = (member) => {
    setMembers((prev) => prev.filter((x) => x !== member))
  }

  const handleSave = () => {
    onUpdate?.({ ...team, name, members })
    setIsEditing(false)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit Team' : team.name}
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="danger"
            onClick={() => {
              onDelete?.(team.id)
              onClose?.()
            }}
          >
            Delete Team
          </Button>
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsEditing(false)
                    setMembers(team.members || [])
                    setName(team.name || '')
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleSave}>Save</Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={onClose}>
                  Close
                </Button>
                <Button onClick={() => setIsEditing(true)}>Edit</Button>
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {isEditing ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-[rgb(var(--zc-muted))]">
              Team Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-sm font-medium text-[rgb(var(--zc-muted))]">
            Members ({members.length})
          </p>
          <div className="mb-3 space-y-1">
            {members.length === 0 && (
              <p className="text-xs text-[rgb(var(--zc-subtle))]">No members yet.</p>
            )}
            {members.map((member) => (
              <div
                key={member}
                className="flex items-center justify-between rounded-lg bg-[rgb(var(--zc-border)/0.3)] px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/30 text-xs font-medium text-indigo-300">
                    {member[0]?.toUpperCase()}
                  </div>
                  <span className="text-sm text-[rgb(var(--zc-text))]">{member}</span>
                </div>
                {isEditing ? (
                  <button
                    type="button"
                    onClick={() => removeMember(member)}
                    className="text-xs text-rose-400 hover:text-rose-300"
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          {isEditing ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={newMember}
                onChange={(e) => setNewMember(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addMember()}
                placeholder="Add member name..."
                className="flex-1 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
              <Button onClick={addMember}>Add</Button>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
