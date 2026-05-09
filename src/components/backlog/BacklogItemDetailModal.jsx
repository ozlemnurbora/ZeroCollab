import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../ui/Modal.jsx'
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

  const hierarchyHelp = useMemo(() => {
    if (effectiveItemType === 'feature') return 'Feature may link to a parent Epic.'
    if (effectiveItemType === 'user_story') return 'User Story may link to a parent Feature.'
    if (effectiveItemType === 'task') return 'Task may link to a parent User Story.'
    return 'Epics are top-level roadmap/backlog items.'
  }, [effectiveItemType])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? `${itemTypeLabel(normalizeItemType(item))}: ${item.title || item.id}` : 'Backlog item'}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="danger"
              onClick={() => {
                if (!item?.id) return
                if (readOnly) return
                // Keep deletion scoped to this item only (no cascade).
                onDelete?.(item.id)
              }}
              disabled={!item?.id || readOnly}
              title={readOnly ? readOnlyMessage : undefined}
            >
              Delete
            </Button>
            <span className="text-[11px] text-[rgb(var(--zc-subtle))]">
              {childWarningText || ''}
            </span>
          </div>
          <div className="flex items-center justify-end gap-2">
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
      }
    >
      {!item ? (
        <p className="text-sm text-[rgb(var(--zc-muted2))]">No item selected.</p>
      ) : (
        <div className="grid gap-4">
          {readOnly ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <p className="font-semibold">Read-only</p>
              <p className="mt-1">
                {readOnlyMessage ||
                  'Editing is locked on your current plan.'}
              </p>
            </div>
          ) : null}

          <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.25)] px-3 py-2 text-xs text-[rgb(var(--zc-subtle))]">
            <p className="text-[rgb(var(--zc-text))] font-medium">Hierarchy</p>
            <p className="mt-1">{hierarchyHelp}</p>
            <p className="mt-1">
              Tasks can be linked to User Stories to represent the technical work required to complete a story.
            </p>
          </div>

          {effectiveItemType === 'user_story' ? (
            <section className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.25)] px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[rgb(var(--zc-text))]">
                    Linked Tasks
                  </p>
                  <p className="text-xs text-[rgb(var(--zc-subtle))]">
                    {linkedTasksForStory.length} task(s) linked to this story.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!item?.id) return
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
                  <p className="text-sm text-[rgb(var(--zc-muted2))]">
                    No linked tasks yet.
                  </p>
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
                        Priority: {t.priority || 'must'} · State:{' '}
                        {normalizeBacklogState(t.backlogState)} · Status:{' '}
                        {String(t.status || 'todo')}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-[rgb(var(--zc-muted))]">
                Item type
              </label>
              <select
                className="mt-1 h-9 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 text-sm text-[rgb(var(--zc-text))]"
                value={effectiveItemType}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    itemType: e.target.value,
                  }))
                }
              >
                <option value="epic">Epic</option>
                <option value="feature">Feature</option>
                <option value="user_story">User Story</option>
                <option value="task">Task</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[rgb(var(--zc-muted))]">
                Priority
              </label>
              <select
                className="mt-1 h-9 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 text-sm text-[rgb(var(--zc-text))]"
                value={form.priority}
                onChange={(e) => setForm((s) => ({ ...s, priority: e.target.value }))}
              >
                <option value="must">Must</option>
                <option value="should">Should</option>
                <option value="could">Could</option>
                <option value="wont">Won’t</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[rgb(var(--zc-muted))]">
                State
              </label>
              <select
                className="mt-1 h-9 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 text-sm text-[rgb(var(--zc-text))]"
                value={form.backlogState}
                onChange={(e) =>
                  setForm((s) => ({ ...s, backlogState: e.target.value }))
                }
              >
                <option value="new">New</option>
                <option value="refined">Refined</option>
                <option value="ready">Ready</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[rgb(var(--zc-muted))]">
                Story points
              </label>
              <input
                type="number"
                className="mt-1 h-9 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 text-sm text-[rgb(var(--zc-text))]"
                value={String(form.storyPoints)}
                onChange={(e) =>
                  setForm((s) => ({ ...s, storyPoints: e.target.value }))
                }
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[rgb(var(--zc-muted))]">
              Title
            </label>
            <input
              className="mt-1 h-9 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 text-sm text-[rgb(var(--zc-text))]"
              value={form.title}
              onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
              onBlur={() => setTouched(true)}
            />
            {titleError ? (
              <p className="mt-1 text-xs text-rose-300">{titleError}</p>
            ) : null}
          </div>

          <div>
            <label className="block text-xs font-medium text-[rgb(var(--zc-muted))]">
              Description
            </label>
            <textarea
              className="mt-1 min-h-[90px] w-full resize-y rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))]"
              value={form.description}
              onChange={(e) =>
                setForm((s) => ({ ...s, description: e.target.value }))
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-[rgb(var(--zc-muted))]">
                Roadmap bucket
              </label>
              <select
                className="mt-1 h-9 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 text-sm text-[rgb(var(--zc-text))]"
                value={form.roadmapBucket}
                onChange={(e) =>
                  setForm((s) => ({ ...s, roadmapBucket: e.target.value }))
                }
              >
                <option value="now">Now</option>
                <option value="next">Next</option>
                <option value="later">Later</option>
              </select>
              <p className="mt-1 text-[11px] text-[rgb(var(--zc-subtle))]">
                New roadmap items default to Later until prioritized.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-[rgb(var(--zc-muted))]">
                Planned sprint
              </label>
              <input
                className="mt-1 h-9 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 text-sm text-[rgb(var(--zc-text))]"
                value={form.plannedSprint}
                onChange={(e) =>
                  setForm((s) => ({ ...s, plannedSprint: e.target.value }))
                }
                placeholder="e.g. 12"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {effectiveItemType === 'feature' ? (
              <div>
                <label className="block text-xs font-medium text-[rgb(var(--zc-muted))]">
                  Parent epic
                </label>
                <select
                  className="mt-1 h-9 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 text-sm text-[rgb(var(--zc-text))]"
                  value={form.parentEpicId}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, parentEpicId: e.target.value }))
                  }
                >
                  <option value="">None</option>
                  {(parentOptions.epics ?? []).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {effectiveItemType === 'user_story' ? (
              <div>
                <label className="block text-xs font-medium text-[rgb(var(--zc-muted))]">
                  Parent feature
                </label>
                <select
                  className="mt-1 h-9 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 text-sm text-[rgb(var(--zc-text))]"
                  value={form.parentFeatureId}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, parentFeatureId: e.target.value }))
                  }
                >
                  <option value="">None</option>
                  {(parentOptions.features ?? []).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {effectiveItemType === 'task' ? (
              <div>
                <label className="block text-xs font-medium text-[rgb(var(--zc-muted))]">
                  Parent user story
                </label>
                <select
                  className="mt-1 h-9 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 text-sm text-[rgb(var(--zc-text))]"
                  value={form.parentStoryId}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, parentStoryId: e.target.value }))
                  }
                >
                  <option value="">None</option>
                  {(parentOptions.stories ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
                {linkedStoryTitle ? (
                  <p className="mt-1 text-[11px] text-[rgb(var(--zc-subtle))]">
                    Linked Story: {linkedStoryTitle}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div>
            <label className="block text-xs font-medium text-[rgb(var(--zc-muted))]">
              Acceptance criteria
            </label>
            <textarea
              className="mt-1 min-h-[90px] w-full resize-y rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))]"
              value={form.acceptanceCriteria}
              onChange={(e) =>
                setForm((s) => ({ ...s, acceptanceCriteria: e.target.value }))
              }
              placeholder={'- Criterion 1\n- Criterion 2'}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[rgb(var(--zc-muted))]">
              Refinement notes
            </label>
            <textarea
              className="mt-1 min-h-[80px] w-full resize-y rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))]"
              value={form.refinementNotes}
              onChange={(e) =>
                setForm((s) => ({ ...s, refinementNotes: e.target.value }))
              }
            />
          </div>

          <div className="text-[11px] text-[rgb(var(--zc-subtle))]">
            ID: {item.id}
          </div>
        </div>
      )}
    </Modal>
  )
}

