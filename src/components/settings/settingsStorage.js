import { PEER_ID_STORAGE_KEY, SETTINGS_STORAGE_KEY } from './settingsConstants.js'

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore
  }
}

function createPeerId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID)
    return crypto.randomUUID()
  return `peer_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function getOrCreatePeerId() {
  try {
    const existing = localStorage.getItem(PEER_ID_STORAGE_KEY)
    if (existing) return existing
    const next = createPeerId()
    localStorage.setItem(PEER_ID_STORAGE_KEY, next)
    return next
  } catch {
    return createPeerId()
  }
}

