import { summarizeFileTreeForInference } from './filePrioritizer.js'

const ANTHROPIC_API_KEY_STORAGE = 'zc-anthropic-key'

/**
 * Ask the AI to guess which submission scope fits the uploaded files.
 * Returns the scope key string (e.g. 'testing_only') or null on failure.
 */
export async function inferSubmissionScope(chunks, availableScopes) {
  const key =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem(ANTHROPIC_API_KEY_STORAGE)
      : null
  if (!key) return null
  if (!Array.isArray(availableScopes) || availableScopes.length === 0) return null

  const fileTree = summarizeFileTreeForInference(chunks, 80)
  if (!fileTree) return null

  const scopeList = availableScopes
    .map((s) => `- ${s.key}: ${s.label}`)
    .join('\n')

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: `You will look at a list of file paths from an uploaded submission and pick the single most likely SCOPE from this catalog:

${scopeList}

File paths:
${fileTree}

Respond with ONLY the scope key, no explanation. If none fits well, respond with "full_project".`,
          },
        ],
      }),
    })
    if (!response.ok) return null
    const data = await response.json()
    const raw = data?.content?.[0]?.text ?? ''
    const guess = String(raw).trim().toLowerCase().replace(/[^a-z_]/g, '')
    const validKeys = new Set(availableScopes.map((s) => s.key))
    if (validKeys.has(guess)) return guess
    if (validKeys.has('full_project')) return 'full_project'
    return null
  } catch (err) {
    console.error('[scopeInference] failed:', err)
    return null
  }
}
