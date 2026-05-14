import { useEffect, useMemo, useState } from 'react'
import { Button } from '../ui/Button.jsx'

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `task_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function normalizeItemType(item) {
  if (!item) return 'task'
  const it = String(item.itemType ?? '').toLowerCase().trim()
  if (it) return it
  const t = String(item.type ?? '').trim()
  if (t === 'Epic') return 'epic'
  if (t === 'Feature') return 'feature'
  if (t === 'User Story' || t === 'UserStory') return 'user_story'
  if (t === 'Task') return 'task'
  return 'task'
}

function itemTypeLabel(itemType) {
  if (itemType === 'epic') return 'Epic'
  if (itemType === 'feature') return 'Feature'
  if (itemType === 'user_story') return 'User Story'
  return 'Task'
}

function normalizeBucket(value) {
  const low = String(value ?? 'later').toLowerCase().trim()
  if (low === 'now') return 'now'
  if (low === 'next') return 'next'
  return 'later'
}

function normalizeBacklogState(value) {
  const low = String(value ?? 'new').toLowerCase().trim()
  if (low === 'refined') return 'refined'
  if (low === 'ready') return 'ready'
  if (low === 'done') return 'done'
  return 'new'
}

function normalizePriority(value) {
  const low = String(value ?? 'must').toLowerCase().trim()
  if (['must', 'should', 'could', 'wont'].includes(low)) return low
  return 'must'
}

function typeStringForItemType(itemType) {
  if (itemType === 'epic') return 'Epic'
  if (itemType === 'feature') return 'Feature'
  if (itemType === 'user_story') return 'User Story'
  return 'Task'
}

function safeStoryPoints(value) {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function cleanNullableId(value) {
  const s = String(value ?? '').trim()
  return s ? s : null
}

function createInitialForm(item) {
  const itemType = normalizeItemType(item)
  return {
    title: String(item?.title ?? ''),
    description: String(item?.description ?? ''),
    itemType,
    priority: normalizePriority(item?.priority),
    backlogState: normalizeBacklogState(item?.backlogState),
    storyPoints: safeStoryPoints(item?.storyPoints ?? item?.story_points ?? 0),
    roadmapBucket: normalizeBucket(item?.roadmapBucket),
    plannedSprint: String(item?.plannedSprint ?? ''),
    roadmapOrder: String(item?.roadmapOrder ?? ''),
    parentEpicId: String(item?.parentEpicId ?? ''),
    parentFeatureId: String(item?.parentFeatureId ?? ''),
    parentStoryId: String(item?.parentStoryId ?? ''),
    acceptanceCriteria: String(item?.acceptanceCriteria ?? ''),
    refinementNotes: String(item?.refinementNotes ?? ''),
  }
}

export function BacklogItemDetailModal({
  open,
  item,
  onClose,
  onSave,
  onDelete,
  onCreateItem,
  allItems = [],
  parentOptions = { epics: [], features: [], stories: [] },
  childWarningText = '',
  readOnly = false,
  readOnlyMessage = '',
}) {
  // Backlog item detail modal supports Agile hierarchy editing across Epic, Feature, User Story, and Task.
  const [form, setForm] = useState(() => createInitialForm(item))
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!open) return
    setTouched(false)
    setForm(createInitialForm(item))
  }, [open, item?.id])

  const effectiveItemType = form.itemType || 'task'

  const linkedStoryTitle = useMemo(() => {
    if (effectiveItemType !== 'task') return ''
    const sid = cleanNullableId(form.parentStoryId)
    if (!sid) return ''
    const story = (Array.isArray(allItems) ? allItems : []).find(
      (it) => it?.id === sid && normalizeItemType(it) === 'user_story',
    )
    return story?.title || sid
  }, [allItems, effectiveItemType, form.parentStoryId])

  const linkedTasksForStory = useMemo(() => {
    if (!item?.id) return []
    if (effectiveItemType !== 'user_story') return []
    const sid = item.id
    return (Array.isArray(allItems) ? allItems : [])
      .filter((t) => normalizeItemType(t) === 'task' && t?.parentStoryId === sid)
      .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')))
  }, [allItems, effectiveItemType, item?.id])

  const titleError = useMemo(() => {
    if (!touched) return ''
    if (!String(form.title || '').trim()) return 'Title is required.'
    return ''
  }, [form.title, touched])

  const canSave = !titleError

  const [panelEntered, setPanelEntered] = useState(false)
  useEffect(() => {
    if (!open) {
      setPanelEntered(false)
      return
    }
    const id = requestAnimationFrame(() => setPanelEntered(true))
    return () => cancelAnimationFrame(id)
  }, [open])

  const hierarchyHelp = useMemo(() => {
    if (effectiveItemType === 'feature') return 'Feature may link to a parent Epic.'
    if (effectiveItemType === 'user_story') return 'User Story may link to a parent Feature.'
    if (effectiveItemType === 'task') return 'Task may link to a parent User Story.'
    return 'Epics are top-level roadmap/backlog items.'
  }, [effectiveItemType])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 transition-opacity"
        onClick={onClose}
      />

      {/* Slide Panel — ~50% width on sm+, full width on narrow screens */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg))] shadow-2xl transition-transform duration-300 ease-out sm:w-1/2 sm:max-w-none ${panelEntered ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Panel Header */}
        <div className="flex items-center justify-between border-b border-[rgb(var(--zc-border))] px-5 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-[rgb(var(--zc-text))]">
              {item ? `${itemTypeLabel(normalizeItemType(item))}: ${item.title || item.id}` : 'Backlog item'}
            </h2>
            {item?.id && (
              <p className="mt-0.5 truncate text-[10px] text-[rgb(var(--zc-subtle))]">ID: {item.id}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-3 shrink-0 rounded-md p-1.5 text-[rgb(var(--zc-muted))] hover:bg-[rgb(var(--zc-border)/0.4)] hover:text-[rgb(var(--zc-text))] transition"
          >
            ✕
          </button>
        </div>

        {/* Panel Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!item ? (
            <p className="text-sm text-[rgb(var(--zc-muted2))]">No item selected.</p>
          ) : (
            <>
              {readOnly ? (
                <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  <p className="font-semibold">Read-only</p>
                  <p className="mt-1">
                    {readOnlyMessage || 'Editing is locked on your current plan.'}
                  </p>
                </div>
              ) : null}

              <div className="mb-4 rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.25)] px-3 py-2 text-xs text-[rgb(var(--zc-subtle))]">
                <p className="font-medium text-[rgb(var(--zc-text))]">Hierarchy</p>
                <p className="mt-1">{hierarchyHelp}</p>
                <p className="mt-1">
                  Tasks can be linked to User Stories to represent the technical work required to complete a story.
                </p>
              </div>

              {effectiveItemType === 'user_story' ? (
                <section className="mb-4 rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.25)] px-3 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[rgb(var(--zc-text))]">Linked Tasks</p>
                      <p className="text-xs text-[rgb(var(--zc-subtle))]">
                        {linkedTasksForStory.length} task(s) linked to this story.
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      disabled={readOnly}
                      onClick={() => {
                        if (!item?.id) return
                        if (readOnly) return
                        const newTask = {
                          id: createId(),
                          type: 'Task',
                          itemType: 'task',
                          parentStoryId: item.id,
                          parentFeatureId: item.parentFeatureId ?? null,
                          parentEpicId: item.parentEpicId ?? null,
                          title: `New task for: ${String(item.title || item.id)}`,
                          description: '',
                          backlogState: 'new',
                          status: 'todo',
                          priority: normalizePriority(item.priority),
                          projectId: item.projectId ?? null,
                          storyPoints: 0,
                          acceptanceCriteria: '',
                          refinementNotes: '',
                        }
                        onCreateItem?.(newTask)
                      }}
                    >
                      + Create Task for this Story
                    </Button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {linkedTasksForStory.length === 0 ? (
                      <p className="text-sm text-[rgb(var(--zc-muted2))]">No linked tasks yet.</p>
                    ) : (
                      linkedTasksForStory.map((t) => (
                        <div
                          key={t.id}
                          className="rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.25)] px-3 py-2"
                        >
                          <p className="truncate text-sm font-medium text-[rgb(var(--zc-text))]">
                            {t.title || '(untitled task)'}
                          </p>
                          <p className="mt-1 text-[11px] text-[rgb(var(--zc-subtle))]">
                            Priority: {t.priority || 'must'} · State: {normalizeBacklogState(t.backlogState)} · Status:{' '}
                            {String(t.status || 'todo')}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              ) : null}

              <div className="grid gap-4">
                {/* ── Status badges row ── */}
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${effectiveItemType === 'epic' ? 'bg-purple-500/20 text-purple-300 ring-purple-500/30' : effectiveItemType === 'feature' ? 'bg-blue-500/20 text-blue-300 ring-blue-500/30' : effectiveItemType === 'user_story' ? 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/30' : 'bg-amber-500/20 text-amber-300 ring-amber-500/30'}`}
                  >
                    {itemTypeLabel(effectiveItemType)}
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${form.backlogState === 'done' ? 'bg-emerald-500/20 text-emerald-300' : form.backlogState === 'ready' ? 'bg-green-500/20 text-green-300' : form.backlogState === 'refined' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-gray-500/20 text-gray-300'}`}
                  >
                    {form.backlogState}
                  </span>
                  <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300">{form.priority}</span>
                  {safeStoryPoints(form.storyPoints) > 0 && (
                    <span className="rounded-md bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300">
                      SP: {safeStoryPoints(form.storyPoints)}
                    </span>
                  )}
                </div>

                {/* ── Title ── */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-[rgb(var(--zc-muted))]">Title</label>
                  <input
                    type="text"
                    className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-60"
                    value={form.title}
                    onChange={(e) => {
                      setForm((p) => ({ ...p, title: e.target.value }))
                    }}
                    onBlur={() => setTouched(true)}
                    disabled={readOnly}
                  />
                  {titleError ? <p className="mt-1 text-xs text-rose-400">{titleError}</p> : null}
                </div>

                {/* ── Description ── */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-[rgb(var(--zc-muted))]">Description</label>
                  <textarea
                    className="min-h-[80px] w-full resize-y rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-60"
                    value={form.description}
                    onChange={(e) => {
                      setForm((p) => ({ ...p, description: e.target.value }))
                    }}
                    disabled={readOnly}
                  />
                </div>

                {/* ── Type & Priority & State row ── */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[rgb(var(--zc-muted))]">Type</label>
                    <select
                      className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 py-2 text-sm text-[rgb(var(--zc-text))] disabled:opacity-60"
                      value={form.itemType}
                      onChange={(e) => {
                        setForm((p) => ({ ...p, itemType: e.target.value }))
                      }}
                      disabled={readOnly}
                    >
                      <option value="epic">Epic</option>
                      <option value="feature">Feature</option>
                      <option value="user_story">User Story</option>
                      <option value="task">Task</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[rgb(var(--zc-muted))]">Priority</label>
                    <select
                      className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 py-2 text-sm text-[rgb(var(--zc-text))] disabled:opacity-60"
                      value={form.priority}
                      onChange={(e) => {
                        setForm((p) => ({ ...p, priority: e.target.value }))
                      }}
                      disabled={readOnly}
                    >
                      <option value="must">Must</option>
                      <option value="should">Should</option>
                      <option value="could">Could</option>
                      <option value="wont">Won’t</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[rgb(var(--zc-muted))]">Backlog State</label>
                    <select
                      className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 py-2 text-sm text-[rgb(var(--zc-text))] disabled:opacity-60"
                      value={form.backlogState}
                      onChange={(e) => {
                        setForm((p) => ({ ...p, backlogState: e.target.value }))
                      }}
                      disabled={readOnly}
                    >
                      <option value="new">New</option>
                      <option value="refined">Refined</option>
                      <option value="ready">Ready</option>
                      <option value="done">Done</option>
                    </select>
                  </div>
                </div>

                {/* ── Story Points & Roadmap ── */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[rgb(var(--zc-muted))]">Story Points</label>
                    <input
                      type="number"
                      min={0}
                      className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 py-2 text-sm text-[rgb(var(--zc-text))] disabled:opacity-60"
                      value={String(form.storyPoints)}
                      onChange={(e) => {
                        setForm((p) => ({ ...p, storyPoints: e.target.value }))
                      }}
                      disabled={readOnly}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[rgb(var(--zc-muted))]">Roadmap Bucket</label>
                    <select
                      className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 py-2 text-sm text-[rgb(var(--zc-text))] disabled:opacity-60"
                      value={form.roadmapBucket}
                      onChange={(e) => {
                        setForm((p) => ({ ...p, roadmapBucket: e.target.value }))
                      }}
                      disabled={readOnly}
                    >
                      <option value="now">Now</option>
                      <option value="next">Next</option>
                      <option value="later">Later</option>
                    </select>
                    <p className="mt-1 text-[10px] text-[rgb(var(--zc-subtle))]">
                      New roadmap items default to Later until prioritized.
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[rgb(var(--zc-muted))]">Planned Sprint</label>
                    <input
                      className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 py-2 text-sm text-[rgb(var(--zc-text))] disabled:opacity-60"
                      value={form.plannedSprint}
                      onChange={(e) => {
                        setForm((p) => ({ ...p, plannedSprint: e.target.value }))
                      }}
                      disabled={readOnly}
                      placeholder="e.g. 12"
                    />
                  </div>
                </div>

                {/* ── Hierarchy links ── */}
                <div>
                  <p className="mb-2 text-xs text-[rgb(var(--zc-subtle))]">{hierarchyHelp}</p>
                  {effectiveItemType === 'feature' && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[rgb(var(--zc-muted))]">Parent Epic</label>
                      <select
                        className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 py-2 text-sm text-[rgb(var(--zc-text))] disabled:opacity-60"
                        value={form.parentEpicId}
                        onChange={(e) => {
                          setForm((p) => ({ ...p, parentEpicId: e.target.value }))
                        }}
                        disabled={readOnly}
                      >
                        <option value="">None</option>
                        {(parentOptions.epics ?? []).map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {effectiveItemType === 'user_story' && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[rgb(var(--zc-muted))]">Parent Feature</label>
                      <select
                        className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 py-2 text-sm text-[rgb(var(--zc-text))] disabled:opacity-60"
                        value={form.parentFeatureId}
                        onChange={(e) => {
                          setForm((p) => ({ ...p, parentFeatureId: e.target.value }))
                        }}
                        disabled={readOnly}
                      >
                        <option value="">None</option>
                        {(parentOptions.features ?? []).map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {effectiveItemType === 'task' && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[rgb(var(--zc-muted))]">Parent User Story</label>
                      <select
                        className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 py-2 text-sm text-[rgb(var(--zc-text))] disabled:opacity-60"
                        value={form.parentStoryId}
                        onChange={(e) => {
                          setForm((p) => ({ ...p, parentStoryId: e.target.value }))
                        }}
                        disabled={readOnly}
                      >
                        <option value="">None</option>
                        {(parentOptions.stories ?? []).map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title}
                          </option>
                        ))}
                      </select>
                      {linkedStoryTitle ? (
                        <p className="mt-1 text-[10px] text-[rgb(var(--zc-subtle))]">Linked Story: {linkedStoryTitle}</p>
                      ) : null}
                    </div>
                  )}
                </div>

                {/* ── Acceptance Criteria ── */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-[rgb(var(--zc-muted))]">Acceptance Criteria</label>
                  <textarea
                    className="min-h-[60px] w-full resize-y rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-60"
                    value={form.acceptanceCriteria}
                    onChange={(e) => {
                      setForm((p) => ({ ...p, acceptanceCriteria: e.target.value }))
                    }}
                    disabled={readOnly}
                    placeholder={'- Criterion 1\n- Criterion 2'}
                  />
                </div>

                {/* ── Refinement Notes ── */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-[rgb(var(--zc-muted))]">Refinement Notes</label>
                  <textarea
                    className="min-h-[60px] w-full resize-y rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-60"
                    value={form.refinementNotes}
                    onChange={(e) => {
                      setForm((p) => ({ ...p, refinementNotes: e.target.value }))
                    }}
                    disabled={readOnly}
                  />
                </div>

                {/* ── Item metadata ── */}
                <div className="rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.2)] px-3 py-2 text-[10px] text-[rgb(var(--zc-subtle))]">
                  <p>ID: {item.id}</p>
                  {item.createdAt ? <p>Created: {new Date(item.createdAt).toLocaleString()}</p> : null}
                  {item.updatedAt ? <p>Updated: {new Date(item.updatedAt).toLocaleString()}</p> : null}
                  {item.projectId ? <p>Project: {item.projectId}</p> : null}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Panel Footer */}
        <div className="border-t border-[rgb(var(--zc-border))] px-5 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="danger"
                onClick={() => {
                  if (!item?.id) return
                  if (readOnly) return
                  onDelete?.(item.id)
                }}
                disabled={!item?.id || readOnly}
                title={readOnly ? readOnlyMessage : undefined}
              >
                Delete
              </Button>
              <span className="text-[11px] text-[rgb(var(--zc-subtle))]">{childWarningText || ''}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={onClose}>
                {readOnly ? 'Close' : 'Cancel'}
              </Button>
              <Button
                onClick={() => {
                  setTouched(true)
                  if (!item?.id) return
                  if (readOnly) return
                  if (!canSave) return
                  const next = {
                    ...item,
                    title: String(form.title || '').trim(),
                    description: String(form.description || '').trim(),
                    priority: normalizePriority(form.priority),
                    backlogState: normalizeBacklogState(form.backlogState),
                    storyPoints: safeStoryPoints(form.storyPoints),
                    acceptanceCriteria: String(form.acceptanceCriteria || '').trim(),
                    refinementNotes: String(form.refinementNotes || '').trim(),
                    roadmapBucket: normalizeBucket(form.roadmapBucket),
                    plannedSprint: String(form.plannedSprint || '').trim(),
                    roadmapOrder: Number(form.roadmapOrder || 0) || 0,
                    itemType: effectiveItemType,
                    type: typeStringForItemType(effectiveItemType),
                    parentEpicId: cleanNullableId(form.parentEpicId),
                    parentFeatureId: cleanNullableId(form.parentFeatureId),
                    parentStoryId: cleanNullableId(form.parentStoryId),
                  }

                  if (effectiveItemType !== 'feature') next.parentEpicId = null
                  if (effectiveItemType !== 'user_story') next.parentFeatureId = null
                  if (effectiveItemType !== 'task') next.parentStoryId = null

                  onSave?.(next)
                  onClose?.()
                }}
                disabled={!item?.id || readOnly}
                title={readOnly ? readOnlyMessage : undefined}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
