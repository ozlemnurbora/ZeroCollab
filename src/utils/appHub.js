import { joinProjectHub, leaveProjectHub } from './hubManager.js'

let currentProjectId = null
let opVersion = 0

export async function connectToProjectHub(projectId, userId, userEmail) {
  if (!projectId || !userId) return
  if (currentProjectId === projectId) return
  const version = ++opVersion
  currentProjectId = projectId
  await joinProjectHub(projectId, userId, userEmail)
  if (version !== opVersion) return
  console.log('[AppHub] connected to project:', projectId)
}

export async function disconnectFromProjectHub() {
  const version = ++opVersion
  currentProjectId = null
  await leaveProjectHub()
  if (version !== opVersion) return
}
