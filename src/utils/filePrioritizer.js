function matchesPattern(path, pattern) {
  if (!pattern) return false
  // Convert glob to regex: ** = anything (incl. /), * = anything-but-/
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const regexStr =
    escaped
      .replace(/\*\*/g, '___DOUBLESTAR___')
      .replace(/\*/g, '[^/]*')
      .replace(/___DOUBLESTAR___/g, '.*')
  // Anchor at start-of-path OR at a path-segment boundary.
  const full = `(?:^|/)${regexStr}$`
  try {
    return new RegExp(full, 'i').test(path)
  } catch {
    return false
  }
}

/**
 * Returns a numeric boost (0-100) indicating how strongly a path matches a scope.
 * Higher number = more relevant to the scope.
 */
export function scopeBoostForPath(path, scopePatterns) {
  if (!path || !Array.isArray(scopePatterns) || scopePatterns.length === 0) return 0
  let bestBoost = 0
  for (const pat of scopePatterns) {
    if (matchesPattern(path, pat)) {
      // Specific patterns (no wildcards) outrank generic ones (**)
      const wildcards = (pat.match(/\*/g) || []).length
      const boost = wildcards === 0 ? 100 : wildcards <= 2 ? 70 : 40
      if (boost > bestBoost) bestBoost = boost
    }
  }
  return bestBoost
}

/**
 * Re-sort an array of chunks by (scopeBoost desc, then existing priority desc).
 * Chunks shape: { path, content, priority, ... }
 * Returns a new sorted array; does not mutate input.
 */
export function prioritizeChunksForScope(chunks, scope) {
  if (!Array.isArray(chunks) || chunks.length === 0) return []
  if (!scope || !Array.isArray(scope.filePatterns) || scope.filePatterns.length === 0) {
    return [...chunks].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  }
  const enriched = chunks.map((c) => ({
    ...c,
    scopeBoost: scopeBoostForPath(c.path ?? '', scope.filePatterns),
  }))
  return enriched.sort((a, b) => {
    if (b.scopeBoost !== a.scopeBoost) return b.scopeBoost - a.scopeBoost
    return (b.priority ?? 0) - (a.priority ?? 0)
  })
}

/**
 * Quick filename-level summary suitable for the AI inference call.
 * Returns the first ~80 distinct paths (no chunk suffix) joined with newlines.
 */
export function summarizeFileTreeForInference(chunks, maxPaths = 80) {
  const seen = new Set()
  const out = []
  for (const c of Array.isArray(chunks) ? chunks : []) {
    const base = String(c.path ?? '').split('#')[0]
    if (!base || seen.has(base)) continue
    seen.add(base)
    out.push(base)
    if (out.length >= maxPaths) break
  }
  return out.join('\n')
}
