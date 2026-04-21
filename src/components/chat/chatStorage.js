import {
  DATABASE_META,
  getSetting,
  getMessagesForOwner,
  putMessage,
  replaceMessagesForOwner,
  setSetting,
} from '../../utils/database.js'

export async function loadChatUser(ownerUserId) {
  try {
    if (!ownerUserId) return null
    const v = await getSetting(DATABASE_META.settingsChatUserKey(ownerUserId))
    return typeof v === 'string' && v ? v : null
  } catch {
    return null
  }
}

export async function saveChatUser(name, ownerUserId) {
  try {
    if (!ownerUserId) return
    if (!name) await setSetting(DATABASE_META.settingsChatUserKey(ownerUserId), null)
    else await setSetting(DATABASE_META.settingsChatUserKey(ownerUserId), name)
  } catch {
    // ignore
  }
}

export async function loadActiveChannelId(ownerUserId) {
  try {
    if (!ownerUserId) return 'general'
    const v = await getSetting(DATABASE_META.settingsChatChannelKey(ownerUserId))
    return typeof v === 'string' && v ? v : 'general'
  } catch {
    return 'general'
  }
}

export async function saveActiveChannelId(id, ownerUserId) {
  try {
    if (!ownerUserId) return
    await setSetting(DATABASE_META.settingsChatChannelKey(ownerUserId), id)
  } catch {
    // ignore
  }
}

export async function loadMessages(ownerUserId) {
  try {
    if (!ownerUserId) return []
    const items = await getMessagesForOwner(ownerUserId)
    return Array.isArray(items) ? items : []
  } catch {
    return []
  }
}

export async function saveMessages(messages, ownerUserId) {
  try {
    if (!ownerUserId) return
    await replaceMessagesForOwner(ownerUserId, messages)
  } catch {
    // ignore
  }
}

export async function saveMessage(message, ownerUserId) {
  try {
    if (!ownerUserId || !message?.id) return
    await putMessage({ ...message, ownerUserId })
  } catch {
    // ignore
  }
}
