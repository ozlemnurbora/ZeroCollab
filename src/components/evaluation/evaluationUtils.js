import { RUBRIC } from './evaluationConstants.js'

export function clampScore(value, min = 1, max = 10) {
  const n = Number(value)
  if (Number.isNaN(n)) return min
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function maxTotalScore() {
  return RUBRIC.reduce((sum, c) => sum + (c.max ?? 10), 0)
}

export function computeTotals(criteria) {
  const total = RUBRIC.reduce((sum, c) => {
    const v = Number(criteria?.[c.id]?.score ?? 1)
    return sum + clampScore(v, 1, c.max ?? 10)
  }, 0)
  const max = maxTotalScore()
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

export function formatEvalDate(ms) {
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

