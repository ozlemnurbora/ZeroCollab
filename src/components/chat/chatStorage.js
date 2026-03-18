import { DATABASE_META, getMessages, getSetting, putMessages, setSetting } from '../../utils/database.js'

export async function loadChatUser() {
  try {
    const v = await getSetting(DATABASE_META.settingsKeys.chatUser)
    return typeof v === 'string' && v ? v : null
  } catch {
    return null
  }
}

export async function saveChatUser(name) {
  try {
    if (!name) await setSetting(DATABASE_META.settingsKeys.chatUser, null)
    else await setSetting(DATABASE_META.settingsKeys.chatUser, name)
  } catch {
    // ignore
  }
}

export async function loadActiveChannelId() {
  try {
    const v = await getSetting(DATABASE_META.settingsKeys.chatChannel)
    return typeof v === 'string' && v ? v : 'general'
  } catch {
    return 'general'
  }
}

export async function saveActiveChannelId(id) {
  try {
    await setSetting(DATABASE_META.settingsKeys.chatChannel, id)
  } catch {
    // ignore
  }
}

export async function loadMessages() {
  try {
    const items = await getMessages()
    return Array.isArray(items) ? items : []
  } catch {
    return []
  }
}

export async function saveMessages(messages) {
  try {
    await putMessages(messages)
  } catch {
    // ignore
  }
}

