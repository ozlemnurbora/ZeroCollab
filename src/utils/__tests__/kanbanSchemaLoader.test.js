import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadKanbanColumnsFromOntology } from '../kanbanSchemaLoader.js'

const SAMPLE_TTL = `
@prefix zck: <http://zerocollab.2025.2/kanban#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .

zck:TodoColumn a zck:KanbanColumn ;
    zck:columnId "todo" ;
    zck:columnTitle "To Do" ;
    zck:columnOrder "1" .

zck:InProgressColumn a zck:KanbanColumn ;
    zck:columnId "in_progress" ;
    zck:columnTitle "In Progress" ;
    zck:columnOrder "2" .

zck:InReviewColumn a zck:KanbanColumn ;
    zck:columnId "in_review" ;
    zck:columnTitle "In Review" ;
    zck:columnOrder "3" .

zck:DoneColumn a zck:KanbanColumn ;
    zck:columnId "done" ;
    zck:columnTitle "Done" ;
    zck:columnOrder "4" .
`

const SAMPLE_TTL_WITH_EXTRA = `
@prefix zck: <http://zerocollab.2025.2/kanban#> .

zck:TodoColumn a zck:KanbanColumn ;
    zck:columnId "todo" ;
    zck:columnTitle "To Do" ;
    zck:columnOrder "1" .

zck:InProgressColumn a zck:KanbanColumn ;
    zck:columnId "in_progress" ;
    zck:columnTitle "In Progress" ;
    zck:columnOrder "2" .

zck:InReviewColumn a zck:KanbanColumn ;
    zck:columnId "in_review" ;
    zck:columnTitle "In Review" ;
    zck:columnOrder "3" .

zck:TestingColumn a zck:KanbanColumn ;
    zck:columnId "testing" ;
    zck:columnTitle "QA Testing" ;
    zck:columnOrder "3.5" .

zck:DoneColumn a zck:KanbanColumn ;
    zck:columnId "done" ;
    zck:columnTitle "Done" ;
    zck:columnOrder "4" .
`

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('loadKanbanColumnsFromOntology', () => {
  it('parses 4 default columns from TTL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: () => Promise.resolve(SAMPLE_TTL) }))
    const columns = await loadKanbanColumnsFromOntology()
    expect(columns).not.toBeNull()
    expect(columns).toHaveLength(4)
  })

  it('columns are sorted by order (todo first, done last)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: () => Promise.resolve(SAMPLE_TTL) }))
    const columns = await loadKanbanColumnsFromOntology()
    expect(columns[0].id).toBe('todo')
    expect(columns[1].id).toBe('in_progress')
    expect(columns[2].id).toBe('in_review')
    expect(columns[3].id).toBe('done')
  })

  it('each column has id and title properties', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: () => Promise.resolve(SAMPLE_TTL) }))
    const columns = await loadKanbanColumnsFromOntology()
    columns.forEach((col) => {
      expect(col).toHaveProperty('id')
      expect(col).toHaveProperty('title')
    })
  })

  it('column titles are correct', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: () => Promise.resolve(SAMPLE_TTL) }))
    const columns = await loadKanbanColumnsFromOntology()
    expect(columns[0].title).toBe('To Do')
    expect(columns[3].title).toBe('Done')
  })

  it('ZTAD test: adding a new column in TTL produces 5 columns (Zero Time proof)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: () => Promise.resolve(SAMPLE_TTL_WITH_EXTRA) }))
    const columns = await loadKanbanColumnsFromOntology()
    expect(columns).toHaveLength(5)
    expect(columns[3].id).toBe('testing')
    expect(columns[3].title).toBe('QA Testing')
    expect(columns[4].id).toBe('done')
  })

  it('returns null when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    expect(await loadKanbanColumnsFromOntology()).toBeNull()
  })

  it('returns null when TTL has no KanbanColumn entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ text: () => Promise.resolve('@prefix zck: <...> .\n') }),
    )
    expect(await loadKanbanColumnsFromOntology()).toBeNull()
  })

  it('returns null when TTL is empty string', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: () => Promise.resolve('') }))
    expect(await loadKanbanColumnsFromOntology()).toBeNull()
  })
})
