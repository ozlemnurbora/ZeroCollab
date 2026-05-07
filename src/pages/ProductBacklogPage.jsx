import { useEffect, useMemo, useRef, useState } from 'react'
import { useLanguage } from '../utils/LanguageContext.jsx'
import { useWorkspace } from '../utils/WorkspaceContext.jsx'
import { useAuth } from '../utils/AuthContext.jsx'
import { Button } from '../components/ui/Button.jsx'
import { AddTaskModal } from '../components/kanban/AddTaskModal.jsx'
import { BacklogItemDetailModal } from '../components/backlog/BacklogItemDetailModal.jsx'
import {
  dedupeAndNormalizePositions,
  loadTasks,
  normalizeTaskForStorage,
  saveTasks,
} from '../components/kanban/taskStorage.js'
import {
  filterTasksForVisibility,
  taskVisibleInActiveProject,
} from '../utils/taskP2PSync.js'

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

function normalizeBacklogState(value) {
  const low = String(value ?? 'new').toLowerCase().trim()
  if (low === 'refined') return 'refined'
  if (low === 'ready') return 'ready'
  if (low === 'done') return 'done'
  return 'new'
}

function itemTypeLabel(itemType) {
  if (itemType === 'epic') return 'Epic'
  if (itemType === 'feature') return 'Feature'
  if (itemType === 'user_story') return 'User Story'
  return 'Task'
}

export function ProductBacklogPage() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const ownerUserId = user?.id ?? null
  const ownerUserIdRef = useRef(ownerUserId)
  const { activeProject, memberProjectIds = [] } = useWorkspace()

  const [items, setItems] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  const [createType, setCreateType] = useState(null) // epic|feature|user_story|task
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState(null)

  useEffect(() => {
    ownerUserIdRef.current = ownerUserId
  }, [ownerUserId])

  useEffect(() => {
    if (!ownerUserId) {
      setItems([])
      setIsLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setIsLoading(true)
      const existing = await loadTasks(ownerUserId)
      if (cancelled) return
      const list = Array.isArray(existing) ? existing : []
      const normalized = list
        .map((it) => normalizeTaskForStorage(it, ownerUserId))
        .filter(Boolean)
      setItems(dedupeAndNormalizePositions(normalized))
      setIsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [ownerUserId])

  const visibilityOptions = useMemo(
    () => ({
      allowedProjectIds: memberProjectIds,
      currentUserId: ownerUserId,
    }),
    [memberProjectIds, ownerUserId],
  )

  const visibleItems = useMemo(() => {
    const visible = filterTasksForVisibility(items, visibilityOptions)
    if (!activeProject) return visible
    const scoped = visible.filter((it) =>
      taskVisibleInActiveProject(it, activeProject.id, ownerUserId),
    )
    const legacyNoProject = visible.filter((it) => it && !it.projectId)
    const merged = [...scoped]
    const seen = new Set(scoped.map((it) => it?.id).filter(Boolean))
    for (const it of legacyNoProject) {
      if (it?.id && !seen.has(it.id)) merged.push(it)
    }
    return merged
  }, [items, visibilityOptions, activeProject, ownerUserId])

  const byType = useMemo(() => {
    const out = { epic: [], feature: [], user_story: [], task: [] }
    for (const it of Array.isArray(visibleItems) ? visibleItems : []) {
      const k = normalizeItemType(it)
      if (!(k in out)) out.task.push(it)
      else out[k].push(it)
    }
    return out
  }, [visibleItems])

  const hierarchyMaps = useMemo(() => {
    const featuresByEpic = new Map()
    for (const f of byType.feature) {
      const eid = f?.parentEpicId
      if (!eid) continue
      const list = featuresByEpic.get(eid) ?? []
      list.push(f)
      featuresByEpic.set(eid, list)
    }
    const storiesByFeature = new Map()
    for (const s of byType.user_story) {
      const fid = s?.parentFeatureId
      if (!fid) continue
      const list = storiesByFeature.get(fid) ?? []
      list.push(s)
      storiesByFeature.set(fid, list)
    }
    const tasksByStory = new Map()
    for (const task of byType.task) {
      const sid = task?.parentStoryId
      if (!sid) continue
      const list = tasksByStory.get(sid) ?? []
      list.push(task)
      tasksByStory.set(sid, list)
    }
    return { featuresByEpic, storiesByFeature, tasksByStory }
  }, [byType])

  const storyById = useMemo(() => {
    return new Map(byType.user_story.map((s) => [s.id, s]))
  }, [byType.user_story])

  const parentOptions = useMemo(() => {
    const epics = byType.epic.map((e) => ({ id: e.id, title: e.title || e.id }))
    const features = byType.feature.map((f) => ({
      id: f.id,
      title: f.title || f.id,
    }))
    const stories = byType.user_story.map((s) => ({
      id: s.id,
      title: s.title || s.id,
    }))
    return { epics, features, stories }
  }, [byType])

  const openCreate = (type) => {
    setCreateType(type)
    setIsCreateOpen(true)
  }

  const updateItem = (itemId, updates) => {
    setItems((prev) => {
      const uid = ownerUserIdRef.current
      const now = Date.now()
      const next = prev.map((it) => {
        if (it?.id !== itemId) return it
        const merged = { ...updates }
        if ('backlogState' in merged) {
          merged.backlogState = normalizeBacklogState(merged.backlogState)
        }
        // If backlog state is set to Done, keep kanban status aligned (safe default).
        if (merged.backlogState === 'done') {
          merged.status = merged.status ?? it.status ?? 'done'
          if (String(merged.status).toLowerCase() !== 'done') merged.status = 'done'
        }
        return { ...it, ...merged, updatedAt: now }
      })
      if (uid) void saveTasks(next, uid, { reason: 'ProductBacklog update' })
      return next
    })
  }

  const upsertItem = (updatedItem) => {
    setItems((prev) => {
      const uid = ownerUserIdRef.current
      const now = Date.now()
      const merged = { ...updatedItem, updatedAt: now }
      const normalized = uid ? normalizeTaskForStorage(merged, uid) : merged
      if (!normalized) return prev
      const next = dedupeAndNormalizePositions([
        normalized,
        ...(Array.isArray(prev) ? prev.filter((it) => it?.id !== normalized.id) : []),
      ])
      if (uid) void saveTasks(next, uid, { reason: 'ProductBacklog upsert' })
      return next
    })
  }

  const createItem = (payload) => {
    setItems((prev) => {
      const uid = ownerUserIdRef.current
      if (!uid) return prev
      const normalized = normalizeTaskForStorage(payload, uid)
      if (!normalized) return prev
      const next = dedupeAndNormalizePositions([
        normalized,
        ...(Array.isArray(prev) ? prev.filter((it) => it?.id !== normalized.id) : []),
      ])
      void saveTasks(next, uid, { reason: 'ProductBacklog create' })
      return next
    })
  }

  const deleteItem = (itemId) => {
    setItems((prev) => {
      const uid = ownerUserIdRef.current
      const next = Array.isArray(prev) ? prev.filter((it) => it?.id !== itemId) : prev
      if (uid) void saveTasks(next, uid, { allowEmpty: true, reason: 'ProductBacklog delete' })
      return next
    })
  }

  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null
    return items.find((it) => it?.id === selectedItemId) ?? null
  }, [items, selectedItemId])

  const selectedItemChildWarning = useMemo(() => {
    const it = selectedItem
    if (!it?.id) return ''
    const itType = normalizeItemType(it)
    if (itType === 'epic') {
      const n = (hierarchyMaps.featuresByEpic.get(it.id) ?? []).length
      if (n > 0) return `Warning: this epic has ${n} linked feature(s). Deletion will not delete children.`
    }
    if (itType === 'feature') {
      const n = (hierarchyMaps.storiesByFeature.get(it.id) ?? []).length
      if (n > 0) return `Warning: this feature has ${n} linked user story(ies). Deletion will not delete children.`
    }
    if (itType === 'user_story') {
      const n = (hierarchyMaps.tasksByStory.get(it.id) ?? []).length
      if (n > 0) return `Warning: this story has ${n} linked task(s). Deletion will not delete children.`
    }
    return ''
  }, [hierarchyMaps, selectedItem])

  const BacklogSection = ({ typeKey, items: list }) => {
    return (
      <section className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)]">
        <div className="flex items-center justify-between gap-2 border-b border-[rgb(var(--zc-border))] px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-[rgb(var(--zc-text))]">
              {itemTypeLabel(typeKey)}
            </h2>
            <p className="text-xs text-[rgb(var(--zc-subtle))]">{list.length} items</p>
          </div>
          <Button variant="secondary" onClick={() => openCreate(typeKey)}>
            + Add
          </Button>
        </div>
        <div className="divide-y divide-[rgb(var(--zc-border))]">
          {list.length === 0 ? (
            <div className="px-4 py-4 text-sm text-[rgb(var(--zc-muted2))]">
              No {itemTypeLabel(typeKey).toLowerCase()} items yet.
            </div>
          ) : (
            list.map((it) => {
              const itType = normalizeItemType(it)
              const state = normalizeBacklogState(it.backlogState)
              const taskCount =
                itType === 'user_story'
                  ? (hierarchyMaps.tasksByStory.get(it.id) ?? []).length
                  : 0
              const linkedStoryTitle =
                itType === 'task' && it.parentStoryId
                  ? storyById.get(it.parentStoryId)?.title || it.parentStoryId
                  : ''
              return (
                <button
                  key={it.id}
                  type="button"
                  className="w-full px-4 py-3 text-left hover:bg-[rgb(var(--zc-border)/0.2)] transition"
                  onClick={() => setSelectedItemId(it.id)}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[rgb(var(--zc-text))]">
                        {it.title || '(untitled)'}
                      </p>
                      {it.description ? (
                        <p className="mt-1 line-clamp-2 text-xs text-[rgb(var(--zc-muted2))]">
                          {it.description}
                        </p>
                      ) : null}
                      {itType === 'user_story' ? (
                        <p className="mt-1 text-[11px] text-[rgb(var(--zc-subtle))]">
                          Tasks: {taskCount}
                        </p>
                      ) : null}
                      {itType === 'task' && linkedStoryTitle ? (
                        <p className="mt-1 text-[11px] text-[rgb(var(--zc-subtle))]">
                          Linked Story: {linkedStoryTitle}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-[rgb(var(--zc-subtle))]">
                        ID: {it.id}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className="h-8 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 text-xs text-[rgb(var(--zc-text))]"
                        value={state}
                        onChange={(e) =>
                          updateItem(it.id, { backlogState: e.target.value })
                        }
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Backlog state"
                      >
                        <option value="new">New</option>
                        <option value="refined">Refined</option>
                        <option value="ready">Ready</option>
                        <option value="done">Done</option>
                      </select>

                      {itType === 'feature' ? (
                        <select
                          className="h-8 min-w-[160px] rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 text-xs text-[rgb(var(--zc-text))]"
                          value={it.parentEpicId ?? ''}
                          onChange={(e) =>
                            updateItem(it.id, {
                              parentEpicId: e.target.value || null,
                            })
                          }
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Parent epic"
                        >
                          <option value="">Parent epic: none</option>
                          {parentOptions.epics.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.title}
                            </option>
                          ))}
                        </select>
                      ) : null}

                      {itType === 'user_story' ? (
                        <select
                          className="h-8 min-w-[160px] rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 text-xs text-[rgb(var(--zc-text))]"
                          value={it.parentFeatureId ?? ''}
                          onChange={(e) =>
                            updateItem(it.id, {
                              parentFeatureId: e.target.value || null,
                            })
                          }
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Parent feature"
                        >
                          <option value="">Parent feature: none</option>
                          {parentOptions.features.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.title}
                            </option>
                          ))}
                        </select>
                      ) : null}

                      {itType === 'task' ? (
                        <select
                          className="h-8 min-w-[160px] rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 text-xs text-[rgb(var(--zc-text))]"
                          value={it.parentStoryId ?? ''}
                          onChange={(e) =>
                            updateItem(it.id, {
                              parentStoryId: e.target.value || null,
                            })
                          }
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Parent story"
                        >
                          <option value="">Parent story: none</option>
                          {parentOptions.stories.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.title}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </section>
    )
  }

  const createInitialValues = useMemo(() => {
    const typeKey = createType || 'task'
    return {
      itemType: typeKey,
      backlogState: 'new',
    }
  }, [createType])

  return (
    <section>
      {/* Product Backlog contains the full product work scope including Epics, Features, User Stories, and Tasks. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[rgb(var(--zc-text))] sm:text-3xl">
            Product Backlog
          </h1>
          <p className="mt-2 text-sm text-[rgb(var(--zc-muted))] sm:text-base">
            Plan and refine work across the full hierarchy. This is not a kanban execution board.
          </p>
          {activeProject ? (
            <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-indigo-500/15 px-3 py-1">
              <span className={`h-2 w-2 rounded-full ${activeProject.color}`} />
              <span className="text-xs font-medium text-indigo-300">
                {activeProject.name}
              </span>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => openCreate('epic')}>
            + Epic
          </Button>
          <Button variant="secondary" onClick={() => openCreate('feature')}>
            + Feature
          </Button>
          <Button variant="secondary" onClick={() => openCreate('user_story')}>
            + User Story
          </Button>
          <Button onClick={() => openCreate('task')}>+ Task</Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {isLoading ? (
          <div className="lg:col-span-2 rounded-xl border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-6 text-sm text-[rgb(var(--zc-muted2))]">
            {t('loading_tasks')}
          </div>
        ) : (
          <>
            <BacklogSection typeKey="epic" items={byType.epic} />
            <BacklogSection typeKey="feature" items={byType.feature} />
            <BacklogSection typeKey="user_story" items={byType.user_story} />
            <BacklogSection typeKey="task" items={byType.task} />
          </>
        )}
      </div>

      <AddTaskModal
        key={`product-backlog-create-${isCreateOpen ? 'open' : 'closed'}-${createType ?? 'none'}-${activeProject?.id ?? 'none'}`}
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={(payload) => {
          const typeKey = createType || 'task'
          const withType = {
            ...payload,
            itemType: payload?.itemType ?? typeKey,
            type:
              (payload?.itemType ?? typeKey) === 'epic'
                ? 'Epic'
                : (payload?.itemType ?? typeKey) === 'feature'
                  ? 'Feature'
                  : (payload?.itemType ?? typeKey) === 'user_story'
                    ? 'User Story'
                    : 'Task',
          }
          createItem(withType)
        }}
        initialValues={createInitialValues}
        customCalendars={[]}
        activeProject={activeProject}
        activeTeam={null}
      />

      <BacklogItemDetailModal
        open={!!selectedItemId}
        item={selectedItem}
        onClose={() => setSelectedItemId(null)}
        onSave={(updated) => upsertItem(updated)}
        onDelete={(id) => {
          deleteItem(id)
          setSelectedItemId(null)
        }}
        onCreateItem={(newItem) => upsertItem(newItem)}
        allItems={items}
        parentOptions={parentOptions}
        childWarningText={selectedItemChildWarning}
      />
    </section>
  )
}

