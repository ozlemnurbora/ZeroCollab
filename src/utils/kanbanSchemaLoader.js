/**
 * Kanban Schema Ontology Loader (ZTAD)
 *
 * Loads column definitions from public/ontology/kanban-schema.ttl at runtime.
 * Falls back to null if loading fails — callers must handle the fallback.
 */

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

/**
 * Fetch and parse kanban-schema.ttl, returning an array of column objects
 * sorted by columnOrder. Returns null on any failure.
 */
export async function loadKanbanColumnsFromOntology() {
  try {
    const response = await fetch('/ontology/kanban-schema.ttl')
    const text = await response.text()
    if (!text || !text.includes('zck:KanbanColumn')) return null

    const columns = []
    const lines = text.split('\n')
    let currentBlock = []
    let inColumn = false

    const pushColumn = (blockLines) => {
      if (!blockLines.length) return
      const block = blockLines.join('\n')
      const id = extractLiteral(block, 'zck:columnId')
      const title = extractLiteral(block, 'zck:columnTitle')
      const order = parseInt(extractLiteral(block, 'zck:columnOrder') || '99', 10)
      if (id && title) {
        columns.push({ id, title, order })
      }
    }

    for (const line of lines) {
      if (line.includes('a zck:KanbanColumn') && !line.includes('owl:Class')) {
        if (inColumn && currentBlock.length) pushColumn(currentBlock)
        inColumn = true
        currentBlock = [line]
      } else if (inColumn) {
        currentBlock.push(line)
        if (line.trim() === '.' || (line.trim() === '' && currentBlock.length > 3)) {
          pushColumn(currentBlock)
          currentBlock = []
          inColumn = false
        }
      }
    }
    if (inColumn && currentBlock.length) pushColumn(currentBlock)

    if (columns.length === 0) return null

    columns.sort((a, b) => a.order - b.order)
    const result = columns.map(({ id, title }) => ({ id, title }))
    console.log('[ZTAD] Kanban columns loaded from ontology:', result.map((c) => c.id))
    return result
  } catch (err) {
    console.warn('[ZTAD] Failed to load kanban columns from ontology, will use fallback:', err)
    return null
  }
}
