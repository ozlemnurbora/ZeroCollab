import { RUBRIC } from './evaluationConstants.js'

export function clampScore(value, min = 1, max = 20) {
  const n = Number(value)
  if (Number.isNaN(n)) return min
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function maxTotalScore(rubric = RUBRIC) {
  return rubric.reduce((sum, c) => sum + (c.max ?? 10), 0)
}

export function computeTotals(criteria, rubric = RUBRIC) {
  const applicableCriteria = rubric.filter((c) => {
    const v = criteria?.[c.id]
    return (
      v?.applicable !== false &&
      v?.score !== null &&
      v?.score !== undefined
    )
  })

  if (applicableCriteria.length === 0) {
    return { total: 0, max: 0, percentage: 0 }
  }

  const total = applicableCriteria.reduce((sum, c) => {
    const v = Number(criteria?.[c.id]?.score ?? 0)
    return sum + clampScore(v, 0, c.max ?? 20)
  }, 0)

  const max = applicableCriteria.reduce((sum, c) => sum + (c.max ?? 20), 0)
  const percentage = max ? (total / max) * 100 : 0
  return { total, max, percentage }
}

export function letterGrade(percentage) {
  if (percentage >= 90) return 'A'
  if (percentage >= 80) return 'B'
  if (percentage >= 70) return 'C'
  if (percentage >= 60) return 'D'
  return 'F'
}

export function gradeLabel(grade) {
  if (grade === 'A') return 'Excellent'
  if (grade === 'B') return 'Strong'
  if (grade === 'C') return 'Satisfactory'
  if (grade === 'D') return 'Needs improvement'
  return 'Insufficient'
}

export function formatEvalDate(ms, locale) {
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(locale || undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

