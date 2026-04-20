import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal.jsx'
import { Button } from '../ui/Button.jsx'
import { useWorkspace } from '../../utils/WorkspaceContext.jsx'
import { sendProjectInvitation } from '../../utils/invitationManager.js'
import { useAuth } from '../../utils/AuthContext.jsx'

export function ProjectDetailModal({
  open,
  onClose,
  project,
  teams,
  onUpdate,
  onDelete,
  onLeave,
}) {
  const { selectProject } = useWorkspace()
  const { user } = useAuth()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteStatus, setInviteStatus] = useState('')
  const [name, setName] = useState(project?.name || '')
  const [description, setDescription] = useState(project?.description || '')
  const [selectedTeamIds, setSelectedTeamIds] = useState(
    project?.teamIds || [],
  )
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    if (!project) return
    const syncTimer = window.setTimeout(() => {
      setName(project.name || '')
      setDescription(project.description || '')
      setSelectedTeamIds(project.teamIds || [])
    }, 0)
    return () => window.clearTimeout(syncTimer)
  }, [project])

  useEffect(() => {
    if (open) return
    const resetEditTimer = window.setTimeout(() => {
      setIsEditing(false)
    }, 0)
    return () => window.clearTimeout(resetEditTimer)
  }, [open])

  if (!project) return null

  const ownerUserId = project.owner_id || project.ownerId || ''

  const isOwner =
    !!user?.id &&
    (project.owner_id === user.id ||
      project.ownerId === user.id ||
      (project.ownerId == null &&
        project.owner_id == null &&
        !project.isShared))

  const resolveUserName = (userId) => {
    if (!userId) return ''

    if (user?.id && userId === user.id) {
      const email = user.email || ''
      return email ? email.split('@')[0] : 'You'
    }

    const teamList = Array.isArray(teams) ? teams : []
    for (const team of teamList) {
      const members = Array.isArray(team?.members) ? team.members : []
      for (const m of members) {
        if (!m || typeof m === 'string') continue
        if (m.userId && m.userId === userId) {
          return m.name || m.email || ''
        }
      }
    }

    return ''
  }

  const ownerNameResolved =
    resolveUserName(ownerUserId) || project.ownerEmail || 'Unknown'
  const showYouSuffix = !!user?.id && ownerUserId && ownerUserId === user.id

  const toggleTeam = (teamId) => {
    setSelectedTeamIds((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId],
    )
  }

  const handleSave = () => {
    onUpdate?.({ ...project, name, description, teamIds: selectedTeamIds })
    setIsEditing(false)
  }

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return
    try {
      setInviteStatus('sending')
      await sendProjectInvitation(
        project.id,
        project.name,
        user.email,
        inviteEmail.trim()
      )
      setInviteStatus('sent')
      setInviteEmail('')
      setTimeout(() => setInviteStatus(''), 3000)
    } catch (err) {
      console.error('[Invite] error:', err)
      setInviteStatus('error')
      setTimeout(() => setInviteStatus(''), 3000)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit Project' : project.name}
      footer={
        <div className="flex items-center justify-between gap-2">
          {isOwner ? (
            <Button
              variant="danger"
              onClick={() => {
                onDelete?.(project.id)
                onClose?.()
              }}
            >
              Delete Project
            </Button>
          ) : (
            <Button
              variant="danger"
              onClick={() => {
                onLeave?.(project.id)
                onClose?.()
              }}
            >
              Leave Project
            </Button>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {isEditing ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setName(project.name || '')
                    setDescription(project.description || '')
                    setSelectedTeamIds(project.teamIds || [])
                    setIsEditing(false)
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleSave}>Save</Button>
              </>
            ) : (
              <>
                <Button
                  onClick={() => {
                    selectProject(project)
                    onClose?.()
                  }}
                >
                  Set as Active Project
                </Button>
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
        <div className="flex items-center gap-2 text-xs text-[rgb(var(--zc-subtle))]">
          <span>Project Manager:</span>
          <span className="text-[rgb(var(--zc-muted))]">
            {ownerNameResolved}
            {showYouSuffix ? ' (You)' : ''}
          </span>
          <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] text-indigo-300">
            Manager
          </span>
        </div>

        {isEditing ? (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-[rgb(var(--zc-muted))]">
                Project Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[rgb(var(--zc-muted))]">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[rgb(var(--zc-muted))]">
                Assign Teams
              </label>
              <div className="space-y-1">
                {teams?.length === 0 && (
                  <p className="text-xs text-[rgb(var(--zc-subtle))]">
                    No teams created yet.
                  </p>
                )}
                {teams?.map((team) => (
                  <label
                    key={team.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-[rgb(var(--zc-border)/0.3)]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTeamIds.includes(team.id)}
                      onChange={() => toggleTeam(team.id)}
                      className="rounded"
                    />
                    <span className={`h-2 w-2 rounded-full ${team.color}`} />
                    <span className="text-sm text-[rgb(var(--zc-text))]">
                      {team.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            {project.description ? (
              <p className="text-sm text-[rgb(var(--zc-muted))]">
                {project.description}
              </p>
            ) : null}
            <div>
              <p className="mb-2 text-sm font-medium text-[rgb(var(--zc-muted))]">
                Assigned Teams
              </p>
              {selectedTeamIds.length === 0 ? (
                <p className="text-xs text-[rgb(var(--zc-subtle))]">
                  No teams assigned. Click Edit to assign teams.
                </p>
              ) : (
                <div className="space-y-1">
                  {teams
                    ?.filter((t) => selectedTeamIds.includes(t.id))
                    .map((team) => (
                      <div
                        key={team.id}
                        className="flex items-center gap-2 rounded-lg bg-[rgb(var(--zc-border)/0.3)] px-2 py-2"
                      >
                        <span className={`h-2 w-2 rounded-full ${team.color}`} />
                        <span className="text-sm text-[rgb(var(--zc-text))]">
                          {team.name}
                        </span>
                        <span className="ml-auto text-xs text-[rgb(var(--zc-subtle))]">
                          {team.members?.length || 0} members
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
            <div className="mt-4">
              <p className="text-sm font-medium text-[rgb(var(--zc-muted))] mb-2">
                Invite to Project
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleInvite()}
                  placeholder="Enter email address..."
                  className="flex-1 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
                <Button onClick={handleInvite} disabled={!inviteEmail.trim() || inviteStatus === 'sending'}>
                  {inviteStatus === 'sending' ? 'Sending...' : 'Invite'}
                </Button>
              </div>
              {inviteStatus === 'sent' && (
                <p className="mt-1 text-xs text-emerald-400">✓ Invitation sent!</p>
              )}
              {inviteStatus === 'error' && (
                <p className="mt-1 text-xs text-rose-400">Failed to send invitation.</p>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
