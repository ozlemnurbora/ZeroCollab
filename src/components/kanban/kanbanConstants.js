import { loadKanbanColumnsFromOntology } from '../../utils/kanbanSchemaLoader.js'

// ── Hardcoded fallback (used if ontology loading fails) ──
const FALLBACK_COLUMNS = [
  { id: 'todo', title: 'To Do' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'in_review', title: 'In Review' },
  { id: 'done', title: 'Done' },
]

// ── Live column data (starts as fallback, replaced when ontology loads) ──
export const KANBAN_COLUMNS = [...FALLBACK_COLUMNS]

/**
 * Initialize columns from ontology. Call once at app startup.
 * If ontology loading fails, KANBAN_COLUMNS keeps the hardcoded fallback values.
 */
export async function initKanbanColumnsFromOntology() {
  try {
    const loaded = await loadKanbanColumnsFromOntology()
    if (loaded && loaded.length > 0) {
      KANBAN_COLUMNS.length = 0
      loaded.forEach((col) => KANBAN_COLUMNS.push(col))
      console.log('[ZTAD] KANBAN_COLUMNS updated from ontology')
    }
  } catch (err) {
    console.warn('[ZTAD] Kanban ontology init failed, using fallback columns:', err)
  }
}

export const TASKS_STORAGE_KEY = 'zerocollab.tasks.v1'

// Auto-initialize when module loads (non-blocking)
initKanbanColumnsFromOntology()
