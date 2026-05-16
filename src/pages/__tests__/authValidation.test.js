import { describe, expect, it } from 'vitest'

function validatePassword(password) {
  const errors = []
  if (password.length < 8) errors.push('At least 8 characters')
  if (!/[A-Z]/.test(password)) errors.push('At least one uppercase letter')
  if (!/\d/.test(password)) errors.push('At least one number')
  return errors
}

describe('AuthPage password validation', () => {
  it('valid password returns empty errors array', () => {
    expect(validatePassword('MyPass1234')).toEqual([])
  })

  it('password with 8+ chars, uppercase, and number is valid', () => {
    expect(validatePassword('Abcdefg1')).toEqual([])
  })

  it('too short password returns length error', () => {
    expect(validatePassword('Ab1')).toContain('At least 8 characters')
  })

  it('password without uppercase returns uppercase error', () => {
    expect(validatePassword('mypass1234')).toContain('At least one uppercase letter')
  })

  it('password without number returns number error', () => {
    expect(validatePassword('MyPassWord')).toContain('At least one number')
  })

  it('password with all violations returns all errors', () => {
    const errors = validatePassword('short')
    expect(errors).toHaveLength(3)
  })

  it('empty password returns all three errors', () => {
    expect(validatePassword('')).toHaveLength(3)
  })

  it('password with exactly 8 characters and valid format passes', () => {
    expect(validatePassword('Abcdefg1')).toEqual([])
  })

  it('password with special characters but meeting all rules is valid', () => {
    expect(validatePassword('MyP@ss!1')).toEqual([])
  })

  it('password with 7 characters fails length check', () => {
    expect(validatePassword('Abcdef1')).toContain('At least 8 characters')
  })
})
