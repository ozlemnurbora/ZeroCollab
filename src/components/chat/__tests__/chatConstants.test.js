import { describe, expect, it } from 'vitest'
import { CHAT_STORAGE_KEYS, DEFAULT_CHANNELS } from '../chatConstants.js'

describe('CHAT_STORAGE_KEYS', () => {
  it('has user key', () => {
    expect(CHAT_STORAGE_KEYS.user).toBeDefined()
    expect(typeof CHAT_STORAGE_KEYS.user).toBe('string')
  })
  it('has messages key', () => {
    expect(CHAT_STORAGE_KEYS.messages).toBeDefined()
  })
  it('has channel key', () => {
    expect(CHAT_STORAGE_KEYS.channel).toBeDefined()
  })
  it('keys contain zerocollab prefix', () => {
    expect(CHAT_STORAGE_KEYS.user).toContain('zerocollab')
    expect(CHAT_STORAGE_KEYS.messages).toContain('zerocollab')
    expect(CHAT_STORAGE_KEYS.channel).toContain('zerocollab')
  })
})

describe('DEFAULT_CHANNELS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(DEFAULT_CHANNELS)).toBe(true)
    expect(DEFAULT_CHANNELS.length).toBeGreaterThan(0)
  })
  it('has general channel', () => {
    const general = DEFAULT_CHANNELS.find((c) => c.id === 'general')
    expect(general).toBeDefined()
    expect(general.type).toBe('channel')
    expect(general.name).toBe('General')
  })
  it('each channel has id, type, and name', () => {
    DEFAULT_CHANNELS.forEach((c) => {
      expect(c).toHaveProperty('id')
      expect(c).toHaveProperty('type')
      expect(c).toHaveProperty('name')
    })
  })
})
