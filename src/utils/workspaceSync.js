import { supabase } from './supabase.js'

let teamSyncChannel = null

export async function joinTeamSync(onTeamMembersUpdate) {
  if (teamSyncChannel) {
    await supabase.removeChannel(teamSyncChannel)
  }

  teamSyncChannel = supabase.channel('team-sync:global')

  teamSyncChannel.on('broadcast', { event: 'team-members-update' }, ({ payload }) => {
    console.log('[TeamSync] received update:', payload)
    onTeamMembersUpdate(payload.teamId, payload.members)
  })

  await teamSyncChannel.subscribe()
  console.log('[TeamSync] joined')
  return teamSyncChannel
}

export async function broadcastTeamMembers(teamId, members) {
  if (!teamSyncChannel) return
  await teamSyncChannel.send({
    type: 'broadcast',
    event: 'team-members-update',
    payload: { teamId, members },
  })
}

export async function leaveTeamSync() {
  if (teamSyncChannel) {
    await supabase.removeChannel(teamSyncChannel)
    teamSyncChannel = null
  }
}
