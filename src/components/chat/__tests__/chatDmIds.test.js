import { describe, expect, it } from 'vitest'
import { normalizeChatEmail, participantKey, dmPairChannelId, splitDmPairChannel, userParticipatesInDmPair, shouldAcceptIncomingChatPayload } from '../chatDmIds.js'

describe('normalizeChatEmail', () => {
  it('lowercases email', () => {
    expect(normalizeChatEmail('Alice@Test.COM')).toBe('alice@test.com')
  })
  it('trims whitespace', () => {
    expect(normalizeChatEmail('  bob@test.com  ')).toBe('bob@test.com')
  })
  it('returns empty for null', () => {
    expect(normalizeChatEmail(null)).toBe('')
  })
  it('returns empty for empty string', () => {
    expect(normalizeChatEmail('')).toBe('')
  })
})

describe('participantKey', () => {
  it('returns uid_ prefix for userId', () => {
    expect(participantKey('user123', 'a@b.com')).toBe('uid_user123')
  })
  it('returns em_ prefix when no userId', () => {
    expect(participantKey(null, 'alice@test.com')).toBe('em_alice@test.com')
  })
  it('returns empty when no userId and no email', () => {
    expect(participantKey(null, null)).toBe('')
  })
})

describe('dmPairChannelId', () => {
  it('creates deterministic DM channel id', () => {
    const id1 = dmPairChannelId('u1', 'a@b.com', 'u2', 'c@d.com')
    const id2 = dmPairChannelId('u2', 'c@d.com', 'u1', 'a@b.com')
    expect(id1).toBe(id2)
  })
  it('starts with dm::', () => {
    const id = dmPairChannelId('u1', 'a@b.com', 'u2', 'c@d.com')
    expect(id).toMatch(/^dm::/)
  })
  it('returns empty when same user', () => {
    expect(dmPairChannelId('u1', 'a@b.com', 'u1', 'a@b.com')).toBe('')
  })
  it('returns empty when both missing', () => {
    expect(dmPairChannelId(null, '', null, '')).toBe('')
  })
})

describe('splitDmPairChannel', () => {
  it('splits valid DM channel id', () => {
    const result = splitDmPairChannel('dm::uid_u1::uid_u2')
    expect(result).toEqual(['uid_u1', 'uid_u2'])
  })
  it('returns null for non-DM channel', () => {
    expect(splitDmPairChannel('general')).toBeNull()
  })
  it('returns null for null', () => {
    expect(splitDmPairChannel(null)).toBeNull()
  })
  it('returns null for malformed DM id', () => {
    expect(splitDmPairChannel('dm::only_one')).toBeNull()
  })
})

describe('userParticipatesInDmPair', () => {
  it('returns true when user is in DM pair', () => {
    const channelId = dmPairChannelId('u1', 'a@b.com', 'u2', 'c@d.com')
    expect(userParticipatesInDmPair(channelId, 'u1', 'a@b.com')).toBe(true)
  })
  it('returns true for other participant', () => {
    const channelId = dmPairChannelId('u1', 'a@b.com', 'u2', 'c@d.com')
    expect(userParticipatesInDmPair(channelId, 'u2', 'c@d.com')).toBe(true)
  })
  it('returns false for non-participant', () => {
    const channelId = dmPairChannelId('u1', 'a@b.com', 'u2', 'c@d.com')
    expect(userParticipatesInDmPair(channelId, 'u3', 'e@f.com')).toBe(false)
  })
  it('returns false for non-DM channel', () => {
    expect(userParticipatesInDmPair('general', 'u1', 'a@b.com')).toBe(false)
  })
})

describe('shouldAcceptIncomingChatPayload', () => {
  it('accepts non-DM channels', () => {
    expect(shouldAcceptIncomingChatPayload({ channelId: 'general' }, 'u1', 'a@b.com')).toBe(true)
  })
  it('accepts DM channel where user participates', () => {
    const channelId = dmPairChannelId('u1', 'a@b.com', 'u2', 'c@d.com')
    expect(shouldAcceptIncomingChatPayload({ channelId }, 'u1', 'a@b.com')).toBe(true)
  })
  it('rejects DM channel where user does not participate', () => {
    const channelId = dmPairChannelId('u1', 'a@b.com', 'u2', 'c@d.com')
    expect(shouldAcceptIncomingChatPayload({ channelId }, 'u3', 'e@f.com')).toBe(false)
  })
  it('accepts payload with no channelId', () => {
    expect(shouldAcceptIncomingChatPayload({}, 'u1', 'a@b.com')).toBe(true)
  })
})
