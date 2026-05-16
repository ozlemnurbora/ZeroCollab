import { describe, expect, it } from 'vitest'
import { clampScore, letterGrade, gradeLabel, formatEvalDate } from '../../components/evaluation/evaluationUtils.js'

describe('clampScore', () => {
  it('clamps value within range', () => {
    expect(clampScore(5, 1, 10)).toBe(5)
  })
  it('clamps to min when below', () => {
    expect(clampScore(-3, 1, 10)).toBe(1)
  })
  it('clamps to max when above', () => {
    expect(clampScore(25, 1, 10)).toBe(10)
  })
  it('rounds float to nearest integer', () => {
    expect(clampScore(3.7, 1, 10)).toBe(4)
  })
  it('returns min for NaN', () => {
    expect(clampScore('abc', 1, 10)).toBe(1)
  })
  it('returns min for null', () => {
    expect(clampScore(null, 1, 10)).toBe(1)
  })
  it('returns min for undefined', () => {
    expect(clampScore(undefined, 1, 10)).toBe(1)
  })
  it('uses default min=1 max=20', () => {
    expect(clampScore(15)).toBe(15)
    expect(clampScore(25)).toBe(20)
    expect(clampScore(-5)).toBe(1)
  })
})

describe('letterGrade', () => {
  it('returns A for 90+', () => {
    expect(letterGrade(95)).toBe('A')
    expect(letterGrade(90)).toBe('A')
  })
  it('returns B for 80-89', () => {
    expect(letterGrade(85)).toBe('B')
    expect(letterGrade(80)).toBe('B')
  })
  it('returns C for 70-79', () => {
    expect(letterGrade(75)).toBe('C')
    expect(letterGrade(70)).toBe('C')
  })
  it('returns D for 60-69', () => {
    expect(letterGrade(65)).toBe('D')
    expect(letterGrade(60)).toBe('D')
  })
  it('returns F for below 60', () => {
    expect(letterGrade(59)).toBe('F')
    expect(letterGrade(0)).toBe('F')
  })
})

describe('gradeLabel', () => {
  it('returns Excellent for A', () => {
    expect(gradeLabel('A')).toBe('Excellent')
  })
  it('returns Strong for B', () => {
    expect(gradeLabel('B')).toBe('Strong')
  })
  it('returns Satisfactory for C', () => {
    expect(gradeLabel('C')).toBe('Satisfactory')
  })
  it('returns Needs improvement for D', () => {
    expect(gradeLabel('D')).toBe('Needs improvement')
  })
  it('returns Insufficient for F', () => {
    expect(gradeLabel('F')).toBe('Insufficient')
  })
  it('returns Insufficient for unknown grade', () => {
    expect(gradeLabel('X')).toBe('Insufficient')
  })
})

describe('formatEvalDate', () => {
  it('formats a valid timestamp', () => {
    const result = formatEvalDate(1700000000000)
    expect(result).not.toBe('')
    expect(typeof result).toBe('string')
  })
  it('returns empty string for NaN timestamp', () => {
    expect(formatEvalDate(NaN)).toBe('')
  })
  it('returns empty string for invalid date', () => {
    expect(formatEvalDate('not-a-date')).toBe('')
  })
})
