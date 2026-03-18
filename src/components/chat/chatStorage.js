import { CHAT_STORAGE_KEYS } from './chatConstants.js'

export function loadChatUser() {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEYS.user)
    return raw || null
  } catch {
    return null
  }
}

export function saveChatUser(name) {
  try {
    if (!name) localStorage.removeItem(CHAT_STORAGE_KEYS.user)
    else localStorage.setItem(CHAT_STORAGE_KEYS.user, name)
  } catch {
    // ignore
  }
}

export function loadActiveChannelId() {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEYS.channel)
    return raw || 'general'
  } catch {
    return 'general'
  }
}

export function saveActiveChannelId(id) {
  try {
    localStorage.setItem(CHAT_STORAGE_KEYS.channel, id)
  } catch {
    // ignore
  }
}

export function loadMessages() {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEYS.messages)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveMessages(messages) {
  try {
    localStorage.setItem(CHAT_STORAGE_KEYS.messages, JSON.stringify(messages))
  } catch {
    // ignore
  }
}

