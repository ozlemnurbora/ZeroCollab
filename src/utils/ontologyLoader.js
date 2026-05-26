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
    new RegExp(`${predicate}\\s+"""([\\s\\S]*?)"""`),
    new RegExp(`${predicate}\\s+"([^"]+)"(?:\\s*;|\\s*\\.)?`),
    new RegExp(`${predicate}\\s+"([^"]+)"\\s*\\^\\^`),
    new RegExp(`${predicate}\\s+"([^"]*)"\\s*`),
    new RegExp(`${predicate}\\s+(-?\\d+(?:\\.\\d+)?)\\s*[;\\.]`),
  ]
  for (const pattern of patterns) {
    const match = block.match(pattern)
    if (match) return match[1].trim()
  }
  return null
}

export async function loadSubmissionScopes() {
  try {
    const text = await loadOntologyText()
    if (!text) return []
    const scopes = []
    const lines = text.split('\n')
    let currentBlock = []
    let inScope = false

    const pushScope = (blockLines) => {
      if (!blockLines.length) return
      const block = blockLines.join('\n')
      const headerMatch = block.match(/^(zce:\w+Scope)\s/)
      const uri = headerMatch ? headerMatch[1] : null
      const label = extractLiteral(block, 'rdfs:label')
      const key = extractLiteral(block, 'zce:scopeKey')
      const focus = extractLiteral(block, 'zce:scopeFocus')
      const filePatterns = extractLiteral(block, 'zce:scopeFilePatterns')
      const orderRaw = extractLiteral(block, 'zce:scopeOrder')
      const order = orderRaw ? parseInt(orderRaw, 10) : 999
      if (uri && key && label) {
        scopes.push({
          uri,
          key,
          label,
          focus: focus || '',
          filePatterns: filePatterns
            ? filePatterns.split(',').map((p) => p.trim()).filter(Boolean)
            : [],
          order,
        })
      }
    }

    for (const line of lines) {
      if (
        line.includes('a zce:SubmissionScope') &&
        !line.includes('owl:Class')
      ) {
        if (inScope && currentBlock.length) pushScope(currentBlock)
        inScope = true
        currentBlock = [line]
      } else if (inScope) {
        currentBlock.push(line)
        if (line.trim() === '.' || (line.trim() === '' && currentBlock.length > 3)) {
          pushScope(currentBlock)
          currentBlock = []
          inScope = false
        }
      }
    }
    if (inScope && currentBlock.length) pushScope(currentBlock)
    scopes.sort((a, b) => a.order - b.order)
    return scopes
  } catch (err) {
    console.error('[ontologyLoader] failed to load submission scopes:', err)
    return []
  }
}
