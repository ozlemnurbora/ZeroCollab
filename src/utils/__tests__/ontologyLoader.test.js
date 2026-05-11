import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadGradeThresholds, loadOntologyText } from '../ontologyLoader.js'

const SAMPLE_TTL = `
@prefix zce: <http://zerocollab.2025.2/evaluation#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .

zce:GradeA a zce:GradeThreshold ;
    zce:gradeLabel "A" ;
    zce:gradeName "Excellent" ;
    zce:minPercentage "90" .

zce:GradeB a zce:GradeThreshold ;
    zce:gradeLabel "B" ;
    zce:gradeName "Good" ;
    zce:minPercentage "80" .

zce:GradeC a zce:GradeThreshold ;
    zce:gradeLabel "C" ;
    zce:gradeName "Average" ;
    zce:minPercentage "70" .

zce:GradeF a zce:GradeThreshold ;
    zce:gradeLabel "F" ;
    zce:gradeName "Fail" ;
    zce:minPercentage "0" .
`

beforeEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('loadOntologyText', () => {
  it('returns TTL text when fetch succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ text: () => Promise.resolve(SAMPLE_TTL) }),
    )
    const text = await loadOntologyText()
    expect(text).toContain('GradeThreshold')
  })

  it('returns null when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    expect(await loadOntologyText()).toBeNull()
  })
})

describe('loadGradeThresholds', () => {
  it('parses grade thresholds from TTL and returns sorted array (highest first)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ text: () => Promise.resolve(SAMPLE_TTL) }),
    )
    const grades = await loadGradeThresholds()
    expect(grades).not.toBeNull()
    expect(grades.length).toBe(4)
    expect(grades[0].label).toBe('A')
    expect(grades[0].minPercentage).toBe(90)
    expect(grades[1].label).toBe('B')
    expect(grades[1].minPercentage).toBe(80)
    expect(grades[grades.length - 1].minPercentage).toBe(0)
  })

  it('each grade has label, name, and minPercentage properties', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ text: () => Promise.resolve(SAMPLE_TTL) }),
    )
    const grades = await loadGradeThresholds()
    expect(grades).not.toBeNull()
    grades.forEach((g) => {
      expect(g).toHaveProperty('label')
      expect(g).toHaveProperty('name')
      expect(g).toHaveProperty('minPercentage')
    })
  })

  it('grades are sorted by minPercentage descending', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ text: () => Promise.resolve(SAMPLE_TTL) }),
    )
    const grades = await loadGradeThresholds()
    expect(grades).not.toBeNull()
    for (let i = 1; i < grades.length; i += 1) {
      expect(grades[i - 1].minPercentage).toBeGreaterThanOrEqual(grades[i].minPercentage)
    }
  })

  it('returns null when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    expect(await loadGradeThresholds()).toBeNull()
  })

  it('returns null when TTL has no GradeThreshold entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ text: () => Promise.resolve('@prefix zce: <http://zerocollab.2025.2/evaluation#> .\n') }),
    )
    expect(await loadGradeThresholds()).toBeNull()
  })
})
