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
  const total = rubric.reduce((sum, c) => {
    const min = c.min ?? 1
    const max = c.max ?? 10
    const v = Number(criteria?.[c.id]?.score ?? min)
    return sum + clampScore(v, min, max)
  }, 0)
  const max = maxTotalScore(rubric)
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

