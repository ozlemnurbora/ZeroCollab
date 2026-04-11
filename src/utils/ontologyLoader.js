export async function loadOntologyText() {
  try {
    const response = await fetch('/ontology/zerocollab-evaluation.ttl')
    return await response.text()
  } catch (err) {
    console.error('[ontologyLoader] failed to load TTL:', err)
    return null
  }
}

export async function loadGradeThresholds() {
  try {
    const text = await loadOntologyText()
    if (!text) return null
    const grades = []
    const lines = text.split('\n')
    let currentBlock = []
    let inGrade = false

    const pushGrade = (blockLines) => {
      if (!blockLines.length) return
      const block = blockLines.join('\n')
      const label = extractLiteral(block, 'zce:gradeLabel')
      const name = extractLiteral(block, 'zce:gradeName')
      const minPct = parseInt(extractLiteral(block, 'zce:minPercentage') || '0', 10)
      if (label) grades.push({ label, name: name || label, minPercentage: minPct })
    }

    for (const line of lines) {
      if (line.includes('a zce:GradeThreshold') && !line.includes('owl:Class')) {
        if (inGrade && currentBlock.length) pushGrade(currentBlock)
        inGrade = true
        currentBlock = [line]
      } else if (inGrade) {
        currentBlock.push(line)
        if (line.trim() === '.' || (line.trim() === '' && currentBlock.length > 3)) {
          pushGrade(currentBlock)
          currentBlock = []
          inGrade = false
        }
      }
    }
    if (inGrade && currentBlock.length) pushGrade(currentBlock)
    grades.sort((a, b) => b.minPercentage - a.minPercentage)
    return grades.length > 0 ? grades : null
  } catch (err) {
    console.error('[ontologyLoader] failed to load grades:', err)
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
