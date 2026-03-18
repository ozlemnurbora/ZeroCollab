import { DATABASE_META, getSetting, setSetting } from '../../utils/database.js'

function createPeerId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID)
    return crypto.randomUUID()
  return `peer_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export async function loadSettings() {
  try {
    const s = await getSetting(DATABASE_META.settingsKeys.appSettings)
    return s && typeof s === 'object' ? s : null
  } catch {
    return null
  }
}

export async function saveSettings(settings) {
  try {
    await setSetting(DATABASE_META.settingsKeys.appSettings, settings)
  } catch {
    // ignore
  }
}

export async function getOrCreatePeerId() {
  try {
    const existing = await getSetting(DATABASE_META.settingsKeys.peerId)
    if (typeof existing === 'string' && existing) return existing
    const next = createPeerId()
    await setSetting(DATABASE_META.settingsKeys.peerId, next)
    return next
  } catch {
    return createPeerId()
  }
}

