import { useState } from 'react'
import { useWorkspace } from '../../utils/WorkspaceContext.jsx'
import { joinTeamWithCode } from '../../utils/invitationManager.js'
import {
  canAddTeamMember,
  recordTeamMemberAdded,
} from '../../utils/tokenEconomics/quotaGuardService.js'

/**
 * Collapsible "Join Team with Code" control for the sidebar (under Teams).
 * Self-contained: reproduces the exact join-with-code logic that previously
 * lived in InvitationsPanel — only relocated and restyled.
 */
export function JoinTeamWithCode() {
  const { reloadProjects, reloadTeams } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joinStatus, setJoinStatus] = useState('')
  const [joinError, setJoinError] = useState('')

  const handleJoinWithCode = async () => {
    if (!joinCode.trim()) return

    try {
      if (!canAddTeamMember()) {
        if (typeof window !== 'undefined') {
          window.alert(
            'Your current tier has reached the team member limit. Hold more ZC tokens to add more members.',
          )
        }
        return
      }

      setJoinStatus('joining')
      setJoinError('')
      await joinTeamWithCode(joinCode)
      recordTeamMemberAdded()
      setJoinCode('')
      setJoinStatus('success')
      await Promise.all([reloadTeams(), reloadProjects()])
      window.setTimeout(() => setJoinStatus(''), 3000)
    } catch (err) {
      console.error('[JoinTeamWithCode] joinTeamWithCode error:', err)
      setJoinStatus('')
      setJoinError(err?.message || 'Failed to join with code.')
    }
  }

  return (
    <div className="mx-3 mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-[rgb(var(--zc-muted))] hover:bg-[rgb(var(--zc-border)/0.3)] hover:text-[rgb(var(--zc-text))] transition"
      >
        <span className="text-[10px]">{open ? '▾' : '▸'}</span>
        Join Team with Code
      </button>
      {open ? (
        <div className="mt-1.5">
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
              className="rounded bg-indigo-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
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
      ) : null}
    </div>
  )
}
