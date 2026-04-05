export async function loadEvaluationCriteria() {
  try {
    const response = await fetch('/ontology/zerocollab-evaluation.ttl')
    const text = await response.text()
    const criteria = []
    const individualBlocks = text.split('\n\n').filter((block) =>
      block.includes('a zce:RubricCriterion'),
    )
    for (const block of individualBlocks) {
      const key = extractLiteral(block, 'zce:criterionKey')
      const label = extractLiteral(block, 'zce:criterionLabel')
      const description = extractLiteral(block, 'zce:criterionDescription')
      const minScore = parseInt(
        extractLiteral(block, 'zce:minScore') || '1',
        10,
      )
      const maxScore = parseInt(
        extractLiteral(block, 'zce:maxScore') || '20',
        10,
      )
      const order = parseInt(extractLiteral(block, 'zce:order') || '99', 10)
      if (key && label) {
        criteria.push({
          id: key,
          label,
          description: description || '',
          min: Number.isNaN(minScore) ? 1 : minScore,
          max: Number.isNaN(maxScore) ? 20 : maxScore,
          order: Number.isNaN(order) ? 99 : order,
        })
      }
    }
    criteria.sort((a, b) => a.order - b.order)
    return criteria.length > 0 ? criteria : null
  } catch (err) {
    console.error('[ontologyLoader] failed to load TTL:', err)
    return null
  }
}

function extractLiteral(block, predicate) {
  const escaped = predicate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`${escaped}\\s+"([^"]+)"(?:\\s*;|\\s*\\.)?`),
    new RegExp(`${escaped}\\s+"([^"]+)"\\s*\\^\\^`),
  ]
  for (const pattern of patterns) {
    const match = block.match(pattern)
    if (match) return match[1].trim()
  }
  const num = block.match(new RegExp(`${escaped}\\s+(\\d+)(?:\\s*;|\\s*\\.)?`))
  if (num) return num[1].trim()
  return null
}
