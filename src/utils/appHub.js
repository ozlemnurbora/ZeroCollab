import { joinProjectHub, leaveProjectHub } from './hubManager.js'

let currentProjectId = null

export async function connectToProjectHub(projectId, userId, userEmail) {
  if (currentProjectId === projectId) return
  currentProjectId = projectId
  await joinProjectHub(projectId, userId, userEmail)
  console.log('[AppHub] connected to project:', projectId)
}

export async function disconnectFromProjectHub() {
  currentProjectId = null
  await leaveProjectHub()
}
