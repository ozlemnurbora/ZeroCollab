import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal.jsx'
import { Button } from '../ui/Button.jsx'
import { useWorkspace } from '../../utils/WorkspaceContext.jsx'
import { sendProjectInvitation } from '../../utils/invitationManager.js'
import { useAuth } from '../../utils/AuthContext.jsx'
import { fetchProjectMembers } from '../../utils/workspaceDB.js'

function memberTypeLabel(member) {
  if (member.role === 'owner') return 'Manager'
  if (member.memberSource === 'team') return 'Team Member'
  if (member.memberSource === 'direct') return 'Direct Member'
  return 'Member'
}

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
  const [teamAssignError, setTeamAssignError] = useState('')
  const [projectMembers, setProjectMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)

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

  useEffect(() => {
    if (!open || !project?.id) {
      if (!open) setProjectMembers([])
      return
    }
    let cancelled = false
    setMembersLoading(true)
    void fetchProjectMembers(project.id)
      .then((list) => {
        if (!cancelled) {
          setProjectMembers(Array.isArray(list) ? list : [])
        }
      })
      .catch(() => {
        if (!cancelled) setProjectMembers([])
      })
      .finally(() => {
        if (!cancelled) setMembersLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, project?.id])

  if (!project) return null

  const ownerUserId = project.owner_id || project.ownerId || ''

  const isOwner =
    !!user?.id &&
    (project.owner_id === user.id ||
      project.ownerId === user.id ||
      (project.ownerId == null &&
        project.owner_id == null &&
        !project.isShared))

  /** Mirrors project_members.member_source from fetchMyProjects (fallback for legacy rows). */
  const membershipSource =
    project.memberSource ??
    (project.role === 'owner' ? 'owner' : 'team')

  const canInviteToProject = isOwner

  const canLeaveProject = !isOwner && membershipSource === 'direct'

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

  const ownerFromMembers = projectMembers.find((m) => m.role === 'owner')
  const ownerNameResolved =
    ownerFromMembers?.name ||
    resolveUserName(ownerUserId) ||
    project.ownerEmail ||
    'Unknown'
  const showYouSuffix = !!user?.id && ownerUserId && ownerUserId === user.id

  const toggleTeam = (teamId) => {
    setTeamAssignError('')
    setSelectedTeamIds((prev) => {
      const isRemoving = prev.includes(teamId)
      if (isRemoving) return prev.filter((id) => id !== teamId)

      const team = (teams || []).find((t) => t.id === teamId)
      const memberCount = Array.isArray(team?.members) ? team.members.length : 0
      if (memberCount < 3) {
        setTeamAssignError(
          'Team must have at least 3 members before assigning to a project.',
        )
        return prev
      }

      return [...prev, teamId]
    })
  }

  const handleSave = () => {
    onUpdate?.({ ...project, name, description, teamIds: selectedTeamIds })
    setIsEditing(false)
  }

  const handleInvite = async () => {
    if (!canInviteToProject) return
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
          ) : canLeaveProject && user?.id ? (
            <Button
              variant="danger"
              onClick={() => {
                onLeave?.(project.id)
                onClose?.()
              }}
            >
              Leave Project
            </Button>
          ) : (
            <div className="min-w-[1px]" aria-hidden="true" />
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
                {isOwner ? (
                  <Button onClick={() => setIsEditing(true)}>Edit</Button>
                ) : null}
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

        <div>
          <p className="mb-2 text-sm font-medium text-[rgb(var(--zc-muted))]">
            Project Members
          </p>
          {membersLoading ? (
            <p className="text-xs text-[rgb(var(--zc-subtle))]">Loading members…</p>
          ) : projectMembers.length === 0 ? (
            <p className="text-xs text-[rgb(var(--zc-subtle))]">No members to show.</p>
          ) : (
            <ul className="space-y-1.5">
              {[...projectMembers]
                .sort((a, b) => {
                  if (a.role === 'owner' && b.role !== 'owner') return -1
                  if (a.role !== 'owner' && b.role === 'owner') return 1
                  return (a.name || '').localeCompare(b.name || '')
                })
                .map((member) => {
                  const key = member.userId || member.email || member.name
                  return (
                    <li
                      key={key}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-[rgb(var(--zc-border)/0.25)] px-3 py-2 text-sm"
                    >
                      <span className="text-[rgb(var(--zc-text))]">{member.name}</span>
                      <span className="text-[10px] text-[rgb(var(--zc-subtle))]">
                        {memberTypeLabel(member)}
                      </span>
                    </li>
                  )
                })}
            </ul>
          )}
        </div>

        {isEditing && isOwner ? (
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
              {teamAssignError ? (
                <p className="mb-2 text-xs text-rose-400">{teamAssignError}</p>
              ) : null}
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
            {canInviteToProject ? (
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
            ) : null}
          </>
        )}
      </div>
    </Modal>
  )
}
