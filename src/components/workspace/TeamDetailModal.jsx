import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal.jsx'
import { Button } from '../ui/Button.jsx'
import { useWorkspace } from '../../utils/WorkspaceContext.jsx'
import { useAuth } from '../../utils/AuthContext.jsx'
import {
  sendTeamInvitation,
  generateTeamPairingCode,
  getTeamPairingCode,
} from '../../utils/invitationManager.js'
import { logRoleChange } from '../../utils/roleAudit.js'
import {
  getRoleLabel,
  isAdminRole,
  isManagerRole,
  normalizeTeamRole,
} from '../../utils/roleOntology.js'

export function TeamDetailModal({ open, onClose, team, onUpdate, onDelete, onLeave }) {
  const { selectTeam, kickTeamMember, updateTeamMemberRole, reloadTeams } = useWorkspace()
  const { user } = useAuth()
  const [name, setName] = useState(team?.name || '')
  const [members, setMembers] = useState(team?.members || [])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteStatus, setInviteStatus] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [pairingCode, setPairingCode] = useState('')
  const [pairingCodeStatus, setPairingCodeStatus] = useState('')
  const [pairingCodeError, setPairingCodeError] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [memberRemoveError, setMemberRemoveError] = useState('')
  const [removingMemberKey, setRemovingMemberKey] = useState('')
  const [roleUpdateError, setRoleUpdateError] = useState('')
  const isOwner =
    !!user?.id &&
    !!team &&
    (team.owner_id === user.id || team.ownerId === user.id)

  useEffect(() => {
    if (!team) return
    const syncTimer = window.setTimeout(() => {
      setName(team.name || '')
      setMembers(team.members || [])
    }, 0)
    return () => window.clearTimeout(syncTimer)
  }, [team])

  useEffect(() => {
    if (open) return
    const resetEditTimer = window.setTimeout(() => {
      setIsEditing(false)
    }, 0)
    return () => window.clearTimeout(resetEditTimer)
  }, [open])

  useEffect(() => {
    if (!open || !team?.id || !isOwner) return

    let cancelled = false
    void (async () => {
      try {
        const activeCode = await getTeamPairingCode(team.id)
        if (!cancelled) {
          setPairingCode(activeCode?.code || '')
          setPairingCodeError('')
        }
      } catch (err) {
        if (!cancelled) {
          setPairingCode('')
          setPairingCodeError(err?.message || 'Failed to load pairing code.')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, team?.id, isOwner])

  if (!team) return null

  const removeMemberLocallyAfterSuccess = (member) => {
    setMembers((prev) => {
      if (typeof member === 'string') {
        return prev.filter((x) => x !== member)
      }

      const targetUserId = member?.userId || ''
      const targetEmail = member?.email || ''
      const targetName = member?.name || ''

      return prev.filter((x) => {
        if (typeof x === 'string') return true

        if (targetUserId && x?.userId) return x.userId !== targetUserId
        if (targetEmail && x?.email) return x.email !== targetEmail
        if (targetName && x?.name) return x.name !== targetName

        return x !== member
      })
    })
  }

  const handleKickMember = async (member, memberKey, memberUserId) => {
    setMemberRemoveError('')

    if (!isOwner) return
    if (!memberUserId) {
      setMemberRemoveError('Cannot remove this member (missing userId).')
      return
    }
    if (memberUserId === (team.owner_id || team.ownerId)) {
      setMemberRemoveError('Owner cannot remove themselves.')
      return
    }

    try {
      setRemovingMemberKey(memberKey)
      await kickTeamMember(team.id, memberUserId)
      removeMemberLocallyAfterSuccess(member)
    } catch (err) {
      console.error('[TeamDetailModal] remove member failed:', err)
      setMemberRemoveError(err?.message || 'Failed to remove member.')
    } finally {
      setRemovingMemberKey('')
    }
  }

  const handleSave = () => {
    onUpdate?.({ ...team, name, members })
    setIsEditing(false)
  }

  const resolveMemberRole = (member, memberUserId) => {
    const isTeamOwner = !!memberUserId && memberUserId === (team.owner_id || team.ownerId)
    return normalizeTeamRole(member?.role, isTeamOwner, member?.customRole)
  }

  const getTeamRoleBadgeClass = (role) => {
    if (isAdminRole(role)) {
      return 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
    }
    if (isManagerRole(role)) {
      return 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
    }
    return 'bg-slate-500/20 text-slate-300 border border-slate-500/30'
  }

  const normalizedMemberKey = (m) => {
    if (typeof m === 'string') return m.trim().toLowerCase()
    return (m?.email || m?.userId || m?.name || '').toString().trim().toLowerCase()
  }

  const uniqueMemberCount = (() => {
    const set = new Set()
    for (const m of members || []) {
      const k = normalizedMemberKey(m)
      if (k) set.add(k)
    }
    return Math.max(1, set.size)
  })()

  const canActivateTeam = uniqueMemberCount >= 3

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !user?.email) return
    setInviteError('')

    const email = inviteEmail.trim().toLowerCase()
    const existingKeys = new Set((members || []).map(normalizedMemberKey).filter(Boolean))
    if (existingKeys.has(email)) {
      setInviteError('This user is already a member.')
      return
    }

    if (uniqueMemberCount + 1 > 9) {
      setInviteError('Team can have maximum 9 members.')
      return
    }

    try {
      setInviteStatus('sending')
      await sendTeamInvitation(
        team.id,
        team.name,
        null,
        null,
        user.email,
        email
      )
      setInviteStatus('sent')
      setInviteEmail('')
      setTimeout(() => setInviteStatus(''), 3000)
    } catch (err) {
      console.error('[TeamInvite] error:', err)
      setInviteStatus('error')
      setTimeout(() => setInviteStatus(''), 3000)
    }
  }

  const handleGeneratePairingCode = async () => {
    if (!isOwner) return

    try {
      setPairingCodeStatus('generating')
      setPairingCodeError('')
      const code = await generateTeamPairingCode(team.id)
      setPairingCode(code)
      setPairingCodeStatus('generated')
      window.setTimeout(() => setPairingCodeStatus(''), 3000)
    } catch (err) {
      console.error('[TeamDetailModal] generate pairing code error:', err)
      setPairingCodeStatus('')
      setPairingCodeError(err?.message || 'Failed to generate pairing code.')
    }
  }

  const handleCopyPairingCode = async () => {
    if (!pairingCode) return
    try {
      await navigator.clipboard.writeText(pairingCode)
      setPairingCodeStatus('copied')
      window.setTimeout(() => setPairingCodeStatus(''), 2000)
    } catch (err) {
      console.error('[TeamDetailModal] copy pairing code error:', err)
      setPairingCodeError('Could not copy code.')
    }
  }

  const currentUserMember = (members || []).find((m) => {
    if (!m || typeof m === 'string') return false
    return m.userId === user?.id
  })
  const currentUserTeamRole = normalizeTeamRole(
    currentUserMember?.role,
    user?.id && user.id === (team.owner_id || team.ownerId),
    currentUserMember?.customRole,
  )
  const canManageRoles = isOwner || isAdminRole(currentUserTeamRole)

  const handleTeamRoleChange = async (member, newRole) => {
    if (!member?.userId) return
    const targetIsOwner = member.userId === (team.owner_id || team.ownerId)
    if (targetIsOwner) return
    if (!canManageRoles) return

    const oldRole = resolveMemberRole(member, member.userId)
    if (oldRole === newRole) return

    setRoleUpdateError('')

    const selectedCustomRole = newRole === 'team_manager' ? 'team_manager' : null

    try {
      await updateTeamMemberRole(team.id, member.userId, selectedCustomRole)
    } catch (error) {
      setRoleUpdateError(error?.message || 'Failed to update team role.')
      return
    }

    setMembers((prev) =>
      (prev || []).map((m) => {
        if (!m || typeof m === 'string') return m
        if (m.userId !== member.userId) return m
        return { ...m, customRole: selectedCustomRole }
      }),
    )
    if (typeof reloadTeams === 'function') {
      await reloadTeams()
    }

    await logRoleChange({
      entityType: 'team',
      entityId: team.id,
      targetUserId: member.userId,
      changedBy: user.id,
      oldRole,
      newRole,
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit Team' : team.name}
      footer={
        <div className="flex items-center justify-between gap-2">
          {isOwner ? (
            <Button
              variant="danger"
              onClick={() => {
                onDelete?.(team.id)
                onClose?.()
              }}
            >
              Delete Team
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
                <Button
                  onClick={() => {
                    if (!canActivateTeam) return
                    selectTeam(team)
                    onClose?.()
                  }}
                  disabled={!canActivateTeam}
                  title={
                    !canActivateTeam
                      ? 'Add at least 3 members before activating this team.'
                      : undefined
                  }
                >
                  Set as Active Team
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
        {isEditing && isOwner ? (
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
          {uniqueMemberCount < 3 ? (
            <p className="mb-2 text-xs text-amber-300">
              Team should have at least 3 members.
            </p>
          ) : null}
          <div className="mb-3 space-y-1">
            {members.length === 0 && (
              <p className="text-xs text-[rgb(var(--zc-subtle))]">No members yet.</p>
            )}
            {members.map((member) => {
              const memberName =
                typeof member === 'string'
                  ? member
                  : member?.name || member?.email || 'Unknown'

              const memberUserId =
                typeof member === 'string' ? '' : member?.userId || ''

              const memberKey =
                typeof member === 'string'
                  ? member
                  : member?.userId ||
                    member?.email ||
                    member?.name ||
                    JSON.stringify(member)

              const memberInitial = memberName?.[0]?.toUpperCase() || '?'

              const resolvedRole =
                typeof member === 'string'
                  ? 'team_member'
                  : resolveMemberRole(member, memberUserId)

              const isTeamAdmin = resolvedRole === 'team_admin'

              const canKick =
                isEditing && isOwner && !!memberUserId && !isTeamAdmin

              const isRemoving = removingMemberKey === memberKey

              return (
                <div
                  key={memberKey}
                  className="flex items-center justify-between gap-3 rounded-lg bg-[rgb(var(--zc-border)/0.3)] px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/30 text-xs font-medium text-indigo-300">
                      {memberInitial}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-[rgb(var(--zc-text))] truncate">
                          {memberName}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] ${getTeamRoleBadgeClass(resolvedRole)}`}
                        >
                          {getRoleLabel(resolvedRole, 'en')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {canManageRoles &&
                    !!memberUserId &&
                    !isTeamAdmin ? (
                      <select
                        value={resolvedRole}
                        onChange={(e) => {
                          void handleTeamRoleChange(member, e.target.value)
                        }}
                        className="rounded border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 py-1 text-xs text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                      >
                        <option value="team_manager">
                          {getRoleLabel('team_manager', 'en')}
                        </option>
                        <option value="team_member">
                          {getRoleLabel('team_member', 'en')}
                        </option>
                      </select>
                    ) : null}
                    {canKick ? (
                      <button
                        type="button"
                        onClick={() => void handleKickMember(member, memberKey, memberUserId)}
                        className="text-xs text-rose-400 hover:text-rose-300"
                        aria-label="Remove member"
                        disabled={isRemoving}
                      >
                        {isRemoving ? '…' : '✕'}
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
          {roleUpdateError ? (
            <p className="mt-1 text-xs text-rose-400">{roleUpdateError}</p>
          ) : null}
          {isEditing && memberRemoveError ? (
            <p className="mt-1 text-xs text-rose-400">{memberRemoveError}</p>
          ) : null}
          {isEditing && isOwner ? (
            <div className="mt-3 border-t border-[rgb(var(--zc-border))] pt-3">
              <p className="text-xs font-medium text-[rgb(var(--zc-muted))] mb-2">
                Team Pairing Code
              </p>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleGeneratePairingCode}
                  disabled={pairingCodeStatus === 'generating'}
                >
                  {pairingCodeStatus === 'generating'
                    ? 'Generating...'
                    : 'Generate Pairing Code'}
                </Button>
                {pairingCode ? (
                  <>
                    <code className="rounded bg-[rgb(var(--zc-border)/0.3)] px-2 py-1 text-xs text-[rgb(var(--zc-text))]">
                      {pairingCode}
                    </code>
                    <button
                      type="button"
                      onClick={() => void handleCopyPairingCode()}
                      className="rounded border border-[rgb(var(--zc-border))] px-2 py-1 text-[10px] text-[rgb(var(--zc-muted))] hover:text-[rgb(var(--zc-text))]"
                    >
                      Copy
                    </button>
                  </>
                ) : null}
              </div>
              {pairingCodeStatus === 'generated' ? (
                <p className="mt-1 text-xs text-emerald-400">✓ Pairing code generated.</p>
              ) : null}
              {pairingCodeStatus === 'copied' ? (
                <p className="mt-1 text-xs text-emerald-400">✓ Copied.</p>
              ) : null}
              {pairingCodeError ? (
                <p className="mt-1 text-xs text-rose-400">{pairingCodeError}</p>
              ) : null}
            </div>
          ) : null}
          {isEditing && isOwner ? (
            <div className="mt-3 border-t border-[rgb(var(--zc-border))] pt-3">
              <p className="text-xs font-medium text-[rgb(var(--zc-muted))] mb-2">
                Invite by Email
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                  placeholder="Enter email address..."
                  className="flex-1 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
                <Button
                  onClick={handleInvite}
                  disabled={
                    !inviteEmail.trim() ||
                    !user?.email ||
                    inviteStatus === 'sending' ||
                    uniqueMemberCount >= 9
                  }
                >
                  {inviteStatus === 'sending' ? 'Sending...' : 'Invite'}
                </Button>
              </div>
              {inviteError ? (
                <p className="mt-1 text-xs text-rose-400">{inviteError}</p>
              ) : null}
              {inviteStatus === 'sent' && (
                <p className="mt-1 text-xs text-emerald-400">✓ Invitation sent!</p>
              )}
              {inviteStatus === 'error' && (
                <p className="mt-1 text-xs text-rose-400">Failed to send invitation.</p>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
