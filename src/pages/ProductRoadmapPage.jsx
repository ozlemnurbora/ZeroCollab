import { useEffect, useMemo, useRef, useState } from 'react'
import { useLanguage } from '../utils/LanguageContext.jsx'
import { useWorkspace } from '../utils/WorkspaceContext.jsx'
import { useAuth } from '../utils/AuthContext.jsx'
import { BacklogItemDetailModal } from '../components/backlog/BacklogItemDetailModal.jsx'
import {
  dedupeAndNormalizePositions,
  loadTasks,
  markTaskSoftDeleted,
  normalizeTaskForStorage,
  saveTasks,
} from '../components/kanban/taskStorage.js'
import {
  filterTasksForVisibility,
  tasksForP2PBroadcast,
  taskVisibleInActiveProject,
} from '../utils/taskP2PSync.js'
import { broadcastTaskSync } from '../utils/hubManager.js'
import { sendToAllPeers } from '../utils/p2pManager.js'
import { upsertRemoteTasks } from '../utils/taskRemoteStorage.js'

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

function safeOrder(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function ProductRoadmapPage() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const ownerUserId = user?.id ?? null
  const ownerUserIdRef = useRef(ownerUserId)
  const { activeProject, memberProjectIds = [] } = useWorkspace()

  const [items, setItems] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedItemId, setSelectedItemId] = useState(null)

  const activeProjectId = activeProject?.id ?? null

  const agileSyncDebugEnabled = useMemo(() => {
    try {
      return (
        typeof window !== 'undefined' &&
        (window.__ZC_AGILE_SYNC_DEBUG === true ||
          window.localStorage?.getItem('zc-agile-sync-debug') === '1')
      )
    } catch {
      return false
    }
  }, [])

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

  const syncAgileItems = async (changedItems) => {
    if (!ownerUserId) return
    if (!activeProjectId) return
    if (!Array.isArray(memberProjectIds) || !memberProjectIds.includes(activeProjectId)) return
    const list = Array.isArray(changedItems) ? changedItems : []
    const normalized = list.map((it) => {
      if (!it?.projectId) return it
      return { ...it, calendarType: 'general', calendarId: 'general' }
    })
    const outgoing = tasksForP2PBroadcast(normalized, {
      activeProjectId,
      allowedProjectIds: memberProjectIds,
    })
    if (outgoing.length === 0) return
    if (agileSyncDebugEnabled) {
      console.log('[Agile Sync Debug] outgoing payload', {
        projectId: activeProjectId,
        count: outgoing.length,
        sample: outgoing.slice(0, 3),
      })
    }
    sendToAllPeers({ type: 'TASK_SYNC', tasks: outgoing, projectId: activeProjectId })
    await broadcastTaskSync(outgoing, activeProjectId)
    await upsertRemoteTasks(outgoing, ownerUserId)
  }

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

  const typed = useMemo(() => {
    const epics = []
    const features = []
    const stories = []
    const tasks = []

    for (const it of Array.isArray(visibleItems) ? visibleItems : []) {
      const k = normalizeItemType(it)
      if (k === 'epic') epics.push(it)
      else if (k === 'feature') features.push(it)
      else if (k === 'user_story') stories.push(it)
      else tasks.push(it)
    }

    const tasksByStory = new Map()
    for (const task of tasks) {
      const sid = task?.parentStoryId
      if (!sid) continue
      const list = tasksByStory.get(sid) ?? []
      list.push(task)
      tasksByStory.set(sid, list)
    }

    const featuresByEpic = new Map()
    for (const f of features) {
      const eid = f?.parentEpicId
      if (!eid) continue
      const list = featuresByEpic.get(eid) ?? []
      list.push(f)
      featuresByEpic.set(eid, list)
    }

    const storiesByFeature = new Map()
    for (const s of stories) {
      const fid = s?.parentFeatureId
      if (!fid) continue
      const list = storiesByFeature.get(fid) ?? []
      list.push(s)
      storiesByFeature.set(fid, list)
    }

    return {
      epics,
      features,
      stories,
      tasks,
      tasksByStory,
      featuresByEpic,
      storiesByFeature,
    }
  }, [visibleItems])

  const parentOptions = useMemo(() => {
    const epics = typed.epics.map((e) => ({ id: e.id, title: e.title || e.id }))
    const features = typed.features.map((f) => ({ id: f.id, title: f.title || f.id }))
    const stories = typed.stories.map((s) => ({ id: s.id, title: s.title || s.id }))
    return { epics, features, stories }
  }, [typed])

  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null
    return items.find((it) => it?.id === selectedItemId) ?? null
  }, [items, selectedItemId])

  const selectedItemChildWarning = useMemo(() => {
    const it = selectedItem
    if (!it?.id) return ''
    const itType = normalizeItemType(it)
    if (itType === 'epic') {
      const n = (typed.featuresByEpic.get(it.id) ?? []).length
      if (n > 0) return `Warning: this epic has ${n} linked feature(s). Deletion will not delete children.`
    }
    if (itType === 'feature') {
      const n = (typed.storiesByFeature.get(it.id) ?? []).length
      if (n > 0) return `Warning: this feature has ${n} linked user story(ies). Deletion will not delete children.`
    }
    if (itType === 'user_story') {
      const n = (typed.tasksByStory.get(it.id) ?? []).length
      if (n > 0) return `Warning: this story has ${n} linked task(s). Deletion will not delete children.`
    }
    return ''
  }, [selectedItem, typed])

  const roadmapPrimaryItems = useMemo(() => {
    // Roadmap focuses on high-level items; tasks are shown only as linked child work.
    const list = [...typed.epics, ...typed.features, ...typed.stories]
    return list
      .map((it) => ({
        ...it,
        __itemType: normalizeItemType(it),
        __bucket: normalizeBucket(it.roadmapBucket),
        __order: safeOrder(it.roadmapOrder),
        __state: normalizeBacklogState(it.backlogState),
      }))
      .sort((a, b) => a.__order - b.__order || String(a.title).localeCompare(String(b.title)))
  }, [typed])

  const byBucket = useMemo(() => {
    const out = { now: [], next: [], later: [] }
    for (const it of roadmapPrimaryItems) {
      out[it.__bucket].push(it)
    }
    return out
  }, [roadmapPrimaryItems])

  const updateItem = (itemId, updates) => {
    setItems((prev) => {
      const uid = ownerUserIdRef.current
      if (!uid) return prev
      const now = Date.now()
      const next = prev.map((it) => {
        if (it?.id !== itemId) return it
        const merged = { ...updates }
        if ('roadmapBucket' in merged) merged.roadmapBucket = normalizeBucket(merged.roadmapBucket)
        if ('roadmapOrder' in merged) merged.roadmapOrder = safeOrder(merged.roadmapOrder)
        if ('backlogState' in merged) merged.backlogState = normalizeBacklogState(merged.backlogState)
        const base = { ...it, ...merged, updatedAt: now }
        // Project-scoped roadmap edits must be shared/general for sync.
        if (base?.projectId) {
          base.calendarType = 'general'
          base.calendarId = 'general'
        }
        return base
      })
      void saveTasks(next, uid, { reason: 'ProductRoadmap update' })
      const changed = next.find((it) => it?.id === itemId) ?? null
      if (changed) void syncAgileItems([changed])
      return next
    })
  }

  const deleteItem = (itemId) => {
    setItems((prev) => {
      const uid = ownerUserIdRef.current
      if (!uid) return prev
      const list = Array.isArray(prev) ? prev : []
      const existing = list.find((it) => it?.id === itemId) ?? null
      if (!existing) return prev
      const isProjectScoped = !!existing.projectId
      const next = isProjectScoped
        ? list.map((it) =>
            it?.id === itemId ? markTaskSoftDeleted({ ...existing }, Date.now()) : it,
          )
        : list.filter((it) => it?.id !== itemId)
      void saveTasks(next, uid, { allowEmpty: true, reason: 'ProductRoadmap delete' })
      if (isProjectScoped) {
        const tomb = next.find((it) => it?.id === itemId)
        if (tomb) void syncAgileItems([tomb])
      }
      return next
    })
  }

  const RoadmapBucket = ({ title, bucketKey, items: list }) => {
    return (
      <section className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)]">
        <div className="border-b border-[rgb(var(--zc-border))] px-4 py-3">
          <h2 className="text-sm font-semibold text-[rgb(var(--zc-text))]">
            {title}
          </h2>
          <p className="text-xs text-[rgb(var(--zc-subtle))]">{list.length} items</p>
        </div>
        <div className="divide-y divide-[rgb(var(--zc-border))]">
          {list.length === 0 ? (
            <div className="px-4 py-4 text-sm text-[rgb(var(--zc-muted2))]">
              No items in this bucket yet.
            </div>
          ) : (
            list.map((it) => {
              const itType = it.__itemType
              const sprint = it.plannedSprint ?? ''
              let parentText = ''
              let childText = ''

              if (itType === 'feature' && it.parentEpicId) {
                parentText = `Parent epic: ${it.parentEpicId}`
              }
              if (itType === 'user_story' && it.parentFeatureId) {
                parentText = `Parent feature: ${it.parentFeatureId}`
              }

              if (itType === 'epic') {
                const childCount = (typed.featuresByEpic.get(it.id) ?? []).length
                childText = childCount ? `${childCount} linked features` : ''
              }
              if (itType === 'feature') {
                const childCount = (typed.storiesByFeature.get(it.id) ?? []).length
                childText = childCount ? `${childCount} linked stories` : ''
              }
              if (itType === 'user_story') {
                const childCount = (typed.tasksByStory.get(it.id) ?? []).length
                childText = childCount ? `${childCount} linked tasks` : ''
              }

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
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[rgb(var(--zc-subtle))]">
                        <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-indigo-200/90">
                          {itemTypeLabel(itType)}
                        </span>
                        <span>Priority: {it.priority || 'must'}</span>
                        <span>State: {it.__state}</span>
                        {parentText ? <span>{parentText}</span> : null}
                        {childText ? <span>{childText}</span> : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className="h-8 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 text-xs text-[rgb(var(--zc-text))]"
                        value={bucketKey}
                        onChange={(e) =>
                          updateItem(it.id, { roadmapBucket: e.target.value })
                        }
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Roadmap bucket"
                      >
                        <option value="now">Now</option>
                        <option value="next">Next</option>
                        <option value="later">Later</option>
                      </select>

                      <input
                        className="h-8 w-[120px] rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 text-xs text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))]"
                        value={String(sprint)}
                        placeholder="Planned sprint"
                        onChange={(e) =>
                          updateItem(it.id, { plannedSprint: e.target.value })
                        }
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Planned sprint"
                      />

                      <input
                        type="number"
                        className="h-8 w-[90px] rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 text-xs text-[rgb(var(--zc-text))]"
                        value={String(it.__order)}
                        onChange={(e) =>
                          updateItem(it.id, { roadmapOrder: e.target.value })
                        }
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Roadmap order"
                      />
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

  return (
    <section>
      {/* Product Roadmap is derived from prioritized Product Backlog items and is used to plan future sprint goals. */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[rgb(var(--zc-text))] sm:text-3xl">
          Product Roadmap
        </h1>
        <p className="mt-2 text-sm text-[rgb(var(--zc-muted))] sm:text-base">
          Product Roadmap prioritizes backlog items and shows which features will be developed first across future sprints.
        </p>
        <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
          New roadmap items default to Later until prioritized.
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

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {isLoading ? (
          <div className="lg:col-span-3 rounded-xl border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] p-6 text-sm text-[rgb(var(--zc-muted2))]">
            {t('loading_tasks')}
          </div>
        ) : (
          <>
            <RoadmapBucket title="Now" bucketKey="now" items={byBucket.now} />
            <RoadmapBucket title="Next" bucketKey="next" items={byBucket.next} />
            <RoadmapBucket title="Later" bucketKey="later" items={byBucket.later} />
          </>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.25)] px-4 py-3 text-xs text-[rgb(var(--zc-subtle))]">
        Roadmap shows Epics/Features/User Stories as primary items. Tasks appear only as linked child work counts.
      </div>

      <BacklogItemDetailModal
        open={!!selectedItemId}
        item={selectedItem}
        onClose={() => setSelectedItemId(null)}
        onSave={(updated) => updateItem(updated.id, updated)}
        onDelete={(id) => {
          deleteItem(id)
          setSelectedItemId(null)
        }}
        allItems={items}
        parentOptions={parentOptions}
        childWarningText={selectedItemChildWarning}
      />
    </section>
  )
}

