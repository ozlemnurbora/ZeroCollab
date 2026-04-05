export async function loadEvaluationCriteria() {
  try {
    const response = await fetch('/ontology/zerocollab-evaluation.ttl')
    const text = await response.text()
    const criteria = []

    // Find all RubricCriterion individuals by looking for the pattern
    const lines = text.split('\n')
    let currentBlock = []
    let inCriterion = false

    for (const line of lines) {
      if (line.includes('a zce:RubricCriterion')) {
        inCriterion = true
        currentBlock = [line]
      } else if (inCriterion) {
        currentBlock.push(line)
        // End of block when we hit a line with just a dot or empty line after content
        if (line.trim() === '.' || (line.trim() === '' && currentBlock.length > 3)) {
          const block = currentBlock.join('\n')
          const key = extractLiteral(block, 'zce:criterionKey')
          const label = extractLiteral(block, 'zce:criterionLabel')
          const description = extractLiteral(block, 'zce:criterionDescription')
          const minScore = parseInt(extractLiteral(block, 'zce:minScore') || '1')
          const maxScore = parseInt(extractLiteral(block, 'zce:maxScore') || '20')
          const order = parseInt(extractLiteral(block, 'zce:order') || '99')
          if (key && label) {
            criteria.push({ id: key, label, description, min: minScore, max: maxScore, order })
          }
          currentBlock = []
          inCriterion = false
        }
      }
    }

    // Also try the last block if file doesn't end with empty line
    if (inCriterion && currentBlock.length > 0) {
      const block = currentBlock.join('\n')
      const key = extractLiteral(block, 'zce:criterionKey')
      const label = extractLiteral(block, 'zce:criterionLabel')
      const description = extractLiteral(block, 'zce:criterionDescription')
      const minScore = parseInt(extractLiteral(block, 'zce:minScore') || '1')
      const maxScore = parseInt(extractLiteral(block, 'zce:maxScore') || '20')
      const order = parseInt(extractLiteral(block, 'zce:order') || '99')
      if (key && label) {
        criteria.push({ id: key, label, description, min: minScore, max: maxScore, order })
      }
    }

    criteria.sort((a, b) => a.order - b.order)
    console.log('[ontologyLoader] loaded criteria:', criteria.length, criteria.map(c => c.id))
    return criteria.length > 0 ? criteria : null
  } catch (err) {
    console.error('[ontologyLoader] failed to load TTL:', err)
    return null
  }
}

function extractLiteral(block, predicate) {
  const patterns = [
    new RegExp(`${predicate}\\s+"([^"]+)"(?:\\s*;|\\s*\\.)?`),
    new RegExp(`${predicate}\\s+"([^"]+)"\\s*\\^\\^`),
    new RegExp(`${predicate}\\s+"([^"]*)"\\s*`),
  ]
  for (const pattern of patterns) {
    const match = block.match(pattern)
    if (match) return match[1].trim()
  }
  return null
}
