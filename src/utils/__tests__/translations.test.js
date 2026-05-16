import { describe, expect, it } from 'vitest'
import { TRANSLATIONS, interpolate } from '../translations.js'

describe('TRANSLATIONS', () => {
  it('has en and tr sections', () => {
    expect(TRANSLATIONS).toHaveProperty('en')
    expect(TRANSLATIONS).toHaveProperty('tr')
  })
  it('en and tr have same keys', () => {
    const enKeys = Object.keys(TRANSLATIONS.en).sort()
    const trKeys = Object.keys(TRANSLATIONS.tr).sort()
    expect(enKeys).toEqual(trKeys)
  })
  it('en has nav_dashboard key', () => {
    expect(TRANSLATIONS.en.nav_dashboard).toBeDefined()
  })
  it('tr has nav_dashboard key', () => {
    expect(TRANSLATIONS.tr.nav_dashboard).toBeDefined()
  })
  it('all en values are strings', () => {
    Object.entries(TRANSLATIONS.en).forEach(([key, val]) => {
      expect(typeof val).toBe('string')
    })
  })
  it('all tr values are strings', () => {
    Object.entries(TRANSLATIONS.tr).forEach(([key, val]) => {
      expect(typeof val).toBe('string')
    })
  })
  it('no empty string values in en', () => {
    Object.entries(TRANSLATIONS.en).forEach(([key, val]) => {
      expect(val.length).toBeGreaterThan(0)
    })
  })
})

describe('interpolate', () => {
  it('replaces {name} with value', () => {
    expect(interpolate('Hello {name}!', { name: 'Alice' })).toBe('Hello Alice!')
  })
  it('replaces multiple variables', () => {
    expect(interpolate('{a} and {b}', { a: '1', b: '2' })).toBe('1 and 2')
  })
  it('keeps placeholder if variable not provided', () => {
    expect(interpolate('Hello {name}!', {})).toBe('Hello {name}!')
  })
  it('returns template if vars is null', () => {
    expect(interpolate('Hello', null)).toBe('Hello')
  })
  it('returns template if template is null', () => {
    expect(interpolate(null, { a: '1' })).toBeNull()
  })
  it('handles numeric values', () => {
    expect(interpolate('{count} items', { count: 5 })).toBe('5 items')
  })
})
