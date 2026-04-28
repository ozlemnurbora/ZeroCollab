import { useEffect, useState } from 'react'
import { useAuth } from '../../utils/AuthContext.jsx'
import { useWorkspace } from '../../utils/WorkspaceContext.jsx'
import {
  getMyInvitations,
  getMyTeamInvitations,
  joinTeamWithCode,
  respondToInvitation,
  respondToTeamInvitation,
  subscribeToInvitations,
  subscribeToTeamInvitations,
} from '../../utils/invitationManager.js'
import { supabase } from '../../utils/supabase.js'
import { joinProjectAsMember } from '../../utils/workspaceDB.js'

export function InvitationsPanel() {
  const { user } = useAuth()
  const { reloadProjects, reloadTeams } = useWorkspace()
  const [invitations, setInvitations] = useState([])
  const [teamInvitations, setTeamInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [joinCode, setJoinCode] = useState('')
  const [joinStatus, setJoinStatus] = useState('')
  const [joinError, setJoinError] = useState('')

  useEffect(() => {
    if (!user) return

    Promise.all([getMyInvitations(), getMyTeamInvitations()]).then(([projectInv, teamInv]) => {
      setInvitations(projectInv)
      setTeamInvitations(teamInv)
      setLoading(false)
    })

    const unsubscribe = subscribeToInvitations(user.email, (newInvitation) => {
      setInvitations(prev => [newInvitation, ...prev])
    })

    const unsubTeam = subscribeToTeamInvitations(user.email, (newInvitation) => {
      setTeamInvitations(prev => [newInvitation, ...prev])
    })

    return () => {
      unsubscribe()
      unsubTeam()
    }
  }, [user])

  const handleAccept = async (invitation) => {
    try {
      await respondToInvitation(invitation.id, 'accepted')

      const acceptedProjects = JSON.parse(
        localStorage.getItem('zc-accepted-projects') || '[]',
      )
      if (!acceptedProjects.includes(invitation.project_id)) {
        acceptedProjects.push(invitation.project_id)
        localStorage.setItem('zc-accepted-projects', JSON.stringify(acceptedProjects))
      }

      try {
        await joinProjectAsMember(
          invitation.project_id,
          user.id,
          user.email,
          'member',
        )
      } catch (e) {
        console.warn('[Invite] join project (may already be a member):', e)
      }
      await reloadProjects()

      setInvitations(prev => prev.filter(i => i.id !== invitation.id))
    } catch (err) {
      console.error('[Invite] accept error:', err)
    }
  }

  const handleDecline = async (invitation) => {
    try {
      await respondToInvitation(invitation.id, 'declined')
      setInvitations(prev => prev.filter(i => i.id !== invitation.id))
    } catch (err) {
      console.error('[Invite] decline error:', err)
    }
  }

  const handleAcceptTeam = async (invitation) => {
    try {
      await respondToTeamInvitation(invitation.id, 'accepted')

      const { error } = await supabase.from('team_members').upsert(
        {
          team_id: invitation.team_id,
          user_id: user.id,
          user_email: user.email,
          display_name: user.email.split('@')[0],
        },
        { onConflict: 'team_id,user_id' },
      )

      if (error)
        console.error('[InvitationsPanel] team member insert error:', error)

      const { data: projectTeams } = await supabase
        .from('project_teams')
        .select('project_id')
        .eq('team_id', invitation.team_id)

      if (projectTeams && projectTeams.length > 0) {
        for (const pt of projectTeams) {
          const { data: existingPm, error: pmSelErr } = await supabase
            .from('project_members')
            .select('role, member_source')
            .eq('project_id', pt.project_id)
            .eq('user_id', user.id)
            .maybeSingle()

          if (pmSelErr) {
            console.error('[InvitationsPanel] project_members lookup:', pmSelErr)
            continue
          }
          if (existingPm?.role === 'owner') continue
          if (existingPm?.member_source === 'direct') continue

          const { error: pmError } = await supabase.from('project_members').upsert(
            {
              project_id: pt.project_id,
              user_id: user.id,
              user_email: user.email,
              role: 'member',
              member_source: 'team',
            },
            { onConflict: 'project_id,user_id' },
          )

          if (pmError)
            console.error(
              '[InvitationsPanel] project member insert error:',
              pmError,
            )
        }
      }

      setTeamInvitations((prev) => prev.filter((i) => i.id !== invitation.id))

      await Promise.all([reloadProjects(), reloadTeams()])
    } catch (err) {
      console.error('[TeamInvite] accept error:', err)
    }
  }

  const handleJoinWithCode = async () => {
    if (!joinCode.trim()) return

    try {
      setJoinStatus('joining')
      setJoinError('')
      await joinTeamWithCode(joinCode)
      setJoinCode('')
      setJoinStatus('success')
      await Promise.all([reloadTeams(), reloadProjects()])
      window.setTimeout(() => setJoinStatus(''), 3000)
    } catch (err) {
      console.error('[InvitationsPanel] joinTeamWithCode error:', err)
      setJoinStatus('')
      setJoinError(err?.message || 'Failed to join with code.')
    }
  }

  const totalPending = invitations.length + teamInvitations.length
  if (loading) return null

  return (
    <div className="mx-3 mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      {totalPending > 0 ? (
        <>
          <p className="text-xs font-semibold text-amber-300 mb-2">
            📬 {totalPending} pending invitation{totalPending > 1 ? 's' : ''}
          </p>
          <div className="space-y-2">
            {invitations.map(inv => (
              <div key={inv.id} className="rounded-md bg-[rgb(var(--zc-border)/0.3)] p-2">
                <p className="text-xs text-[rgb(var(--zc-text))] font-medium">{inv.project_name}</p>
                <p className="text-[10px] text-[rgb(var(--zc-muted))] mt-0.5">
                  from {inv.inviter_email}
                </p>
                <div className="flex gap-1 mt-2">
                  <button
                    onClick={() => handleAccept(inv)}
                    className="flex-1 rounded bg-emerald-500/20 px-2 py-1 text-[10px] font-medium text-emerald-300 hover:bg-emerald-500/30"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleDecline(inv)}
                    className="flex-1 rounded bg-rose-500/10 px-2 py-1 text-[10px] font-medium text-rose-400 hover:bg-rose-500/20"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
            {teamInvitations.map(inv => (
              <div key={inv.id} className="rounded-md bg-[rgb(var(--zc-border)/0.3)] p-2">
                <p className="text-xs text-[rgb(var(--zc-text))] font-medium">
                  Team: {inv.team_name}
                </p>
                {inv.project_name && (
                  <p className="text-[10px] text-[rgb(var(--zc-muted))] mt-0.5">
                    Project: {inv.project_name}
                  </p>
                )}
                <p className="text-[10px] text-[rgb(var(--zc-muted))] mt-0.5">
                  from {inv.inviter_email}
                </p>
                <div className="flex gap-1 mt-2">
                  <button
                    onClick={() => handleAcceptTeam(inv)}
                    className="flex-1 rounded bg-emerald-500/20 px-2 py-1 text-[10px] font-medium text-emerald-300 hover:bg-emerald-500/30"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() =>
                      respondToTeamInvitation(inv.id, 'declined').then(() =>
                        setTeamInvitations(prev => prev.filter(i => i.id !== inv.id)),
                      )
                    }
                    className="flex-1 rounded bg-rose-500/10 px-2 py-1 text-[10px] font-medium text-rose-400 hover:bg-rose-500/20"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
      <div className={`${totalPending > 0 ? 'mt-3 border-t border-amber-500/20 pt-3' : ''}`}>
        <p className="text-xs font-medium text-amber-200 mb-2">Join Team with Code</p>
        <div className="flex gap-1">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoinWithCode()}
            placeholder="ZC-123456"
            className="flex-1 rounded border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 py-1 text-xs text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
          <button
            onClick={() => void handleJoinWithCode()}
            disabled={!joinCode.trim() || joinStatus === 'joining'}
            className="rounded bg-indigo-500/20 px-2 py-1 text-[10px] font-medium text-indigo-300 hover:bg-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {joinStatus === 'joining' ? 'Joining...' : 'Join'}
          </button>
        </div>
        {joinStatus === 'success' ? (
          <p className="mt-1 text-xs text-emerald-400">✓ Joined team successfully.</p>
        ) : null}
        {joinError ? (
          <p className="mt-1 text-xs text-rose-400">{joinError}</p>
        ) : null}
      </div>
    </div>
  )
}
