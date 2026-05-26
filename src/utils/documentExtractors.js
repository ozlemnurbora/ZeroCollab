/**
 * Extract plain text from a DOCX or PDF File object.
 * Each function returns a string (possibly empty) — never throws.
 * The caller chunks the returned text via the existing processText() pipeline.
 */

/**
 * Extract text from a .docx file using mammoth.
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function extractDocxText(file) {
  try {
    if (!file) return ''
    const arrayBuffer = await file.arrayBuffer()
    const mammoth = await import('mammoth/mammoth.browser.js')
    const lib = mammoth.default ?? mammoth
    const result = await lib.extractRawText({ arrayBuffer })
    return typeof result?.value === 'string' ? result.value : ''
  } catch (err) {
    console.error('[documentExtractors] DOCX extract failed:', err)
    return ''
  }
}

/**
 * Extract text from a .pdf file using pdfjs-dist. Walks every page.
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function extractPdfText(file) {
  try {
    if (!file) return ''
    const arrayBuffer = await file.arrayBuffer()

    const pdfjs = await import('pdfjs-dist/build/pdf.mjs')
    // pdf.mjs needs a worker; the bundled worker file ships with the package.
    if (pdfjs?.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
      const workerModule = await import('pdfjs-dist/build/pdf.worker.mjs?url')
      pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default
    }

    const loadingTask = pdfjs.getDocument({ data: arrayBuffer })
    const doc = await loadingTask.promise

    const pages = []
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
      const page = await doc.getPage(pageNum)
      const content = await page.getTextContent()
      const text = (content.items || [])
        .map((it) => (typeof it.str === 'string' ? it.str : ''))
        .join(' ')
      pages.push(`[page ${pageNum}]\n${text}`)
    }
    return pages.join('\n\n')
  } catch (err) {
    console.error('[documentExtractors] PDF extract failed:', err)
    return ''
  }
}

/**
 * Convenience: pick the right extractor based on filename suffix.
 * Returns '' for unsupported types.
 */
export async function extractRichDocumentText(file) {
  if (!file?.name) return ''
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.docx')) return await extractDocxText(file)
  if (lower.endsWith('.pdf')) return await extractPdfText(file)
  return ''
}
