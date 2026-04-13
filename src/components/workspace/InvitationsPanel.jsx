import { useEffect, useState } from 'react'
import { useAuth } from '../../utils/AuthContext.jsx'
import { useWorkspace } from '../../utils/WorkspaceContext.jsx'
import {
  getMyInvitations,
  getMyTeamInvitations,
  respondToInvitation,
  respondToTeamInvitation,
  subscribeToInvitations,
  subscribeToTeamInvitations,
} from '../../utils/invitationManager.js'

export function InvitationsPanel() {
  const { user } = useAuth()
  const { projects, updateProjects, updateTeams } = useWorkspace()
  const [invitations, setInvitations] = useState([])
  const [teamInvitations, setTeamInvitations] = useState([])
  const [loading, setLoading] = useState(true)

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
      
      // Add project to local workspace
      const newProject = {
        id: invitation.project_id,
        name: invitation.project_name,
        color: 'bg-indigo-500',
        createdAt: Date.now(),
        members: [],
        teamIds: [],
        isShared: true,
        invitedBy: invitation.inviter_email,
      }
      
      const currentProjects = JSON.parse(localStorage.getItem('zc-projects') || '[]')
      if (!currentProjects.find(p => p.id === invitation.project_id)) {
        const updated = [...currentProjects, newProject]
        localStorage.setItem('zc-projects', JSON.stringify(updated))
        updateProjects(updated)
      }

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

      const currentTeams = JSON.parse(localStorage.getItem('zc-teams') || '[]')
      const userName = user.email.split('@')[0]

      let updatedTeams
      const existingTeam = currentTeams.find(t => t.id === invitation.team_id)

      if (existingTeam) {
        updatedTeams = currentTeams.map(t => {
          if (t.id === invitation.team_id) {
            const members = t.members || []
            if (!members.includes(userName)) {
              return { ...t, members: [...members, userName] }
            }
          }
          return t
        })
      } else {
        const newTeam = {
          id: invitation.team_id,
          name: invitation.team_name,
          color: 'bg-indigo-500',
          createdAt: Date.now(),
          members: [userName],
          projectIds: [],
        }
        updatedTeams = [...currentTeams, newTeam]
      }

      updateTeams(updatedTeams)

      setTeamInvitations(prev => prev.filter(i => i.id !== invitation.id))
    } catch (err) {
      console.error('[TeamInvite] accept error:', err)
    }
  }

  const totalPending = invitations.length + teamInvitations.length
  if (loading || totalPending === 0) return null

  return (
    <div className="mx-3 mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
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
    </div>
  )
}
