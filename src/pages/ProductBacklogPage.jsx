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
  markTaskSoftDeleted,
  normalizeTaskForStorage,
  saveTasks,
} from '../components/kanban/taskStorage.js'
import {
  filterTasksForVisibility,
  mergeTasksFromSync,
  tasksForP2PBroadcast,
  taskVisibleInActiveProject,
} from '../utils/taskP2PSync.js'
import { broadcastTaskSync } from '../utils/hubManager.js'
import { on, P2P_EVENTS, sendToAllPeers } from '../utils/p2pManager.js'
import { upsertRemoteTasks } from '../utils/taskRemoteStorage.js'
import { getPeerId } from '../utils/p2pManager.js'
import { hasSeenSync, markSyncSeen } from '../utils/sync/syncDedupe.js'

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

  const buildSyncMeta = () => {
    const sourceUserId = ownerUserIdRef.current ?? null
    const sourcePeerId = getPeerId?.() ?? null
    const syncId = `${sourceUserId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    return { sourceUserId, sourcePeerId, syncId, sentAt: Date.now(), projectId: activeProjectId }
  }

  const agileItemsSignature = (list) => {
    const arr = Array.isArray(list) ? list : []
    const parts = arr
      .filter((it) => it?.id)
      .map((it) => {
        const u = Number(it.updatedAt ?? it.updated_at ?? 0) || 0
        const d = Number(it.deletedAt ?? it.deleted_at ?? 0) || 0
        return [
          it.id,
          u,
          d,
          it.type ?? '',
          it.itemType ?? '',
          it.projectId ?? '',
          it.calendarType ?? '',
          it.sprintId ?? '',
          it.backlogState ?? '',
          it.parentEpicId ?? '',
          it.parentFeatureId ?? '',
          it.parentStoryId ?? '',
          it.roadmapBucket ?? '',
          it.plannedSprint ?? '',
          it.roadmapOrder ?? '',
        ].join('|')
      })
      .sort()
    return parts.join('\n')
  }

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

  // Keep page state fresh when other pages (KanbanBoard/Sprint Planning/etc) save to IndexedDB.
  useEffect(() => {
    if (!ownerUserId) return
    let timer
    const onChanged = (e) => {
      const detail = e?.detail || {}
      if (detail.ownerUserId && detail.ownerUserId !== ownerUserId) return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void (async () => {
          const existing = await loadTasks(ownerUserId)
          const list = Array.isArray(existing) ? existing : []
          const normalized = list
            .map((it) => normalizeTaskForStorage(it, ownerUserId))
            .filter(Boolean)
          const next = dedupeAndNormalizePositions(normalized)
          setItems((prev) => (agileItemsSignature(prev) === agileItemsSignature(next) ? prev : next))
        })()
      }, 150)
    }
    window.addEventListener('zc-tasks-changed', onChanged)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('zc-tasks-changed', onChanged)
    }
  }, [ownerUserId])

  // Inbound sync listeners (P2P + hub) similar to KanbanBoard; includes ALL item types.
  useEffect(() => {
    if (!ownerUserId) return
    const applyIncoming = (incomingItems, projectId) => {
      const incoming = Array.isArray(incomingItems) ? incomingItems : []
      if (incoming.length === 0) {
        console.log('[Agile Sync Stable] ignored empty payload')
        return
      }
      if (projectId && !memberProjectIds.includes(projectId)) return
      if (activeProject?.id && projectId && projectId !== activeProject.id) return

      console.log('[ProductBacklog Sync] incoming', incoming)

      setItems((prev) => {
        const uid = ownerUserIdRef.current
        const nextBase = mergeTasksFromSync(prev, incoming, visibilityOptions)
        if (incoming.length === 0) return prev
        if (prev.length > 0 && nextBase.length === 0) return prev
        const next = dedupeAndNormalizePositions(
          nextBase.map((t) => (uid ? { ...t, ownerUserId: uid } : t)),
        )
        if (uid) void saveTasks(next, uid, { reason: 'ProductBacklog inbound sync' })
        if (uid) void upsertRemoteTasks(incoming, uid)
        console.log('[ProductBacklog Sync] merged count', next.length)
        console.log('[Agile Sync Stable] merged', { before: prev.length, incoming: incoming.length, after: next.length })
        return next
      })
    }

    const unsubMsg = on(P2P_EVENTS.MESSAGE, ({ data }) => {
      if (data?.type !== 'TASK_SYNC') return
      const syncId = data?.syncId ?? null
      const sourceUserId = data?.sourceUserId ?? null
      if (syncId && hasSeenSync(syncId)) {
        console.log('[Agile Sync Stable] ignored duplicate sync', syncId)
        return
      }
      if (sourceUserId && sourceUserId === ownerUserIdRef.current) {
        console.log('[Agile Sync Stable] ignored own sync', syncId)
        return
      }
      if (syncId) markSyncSeen(syncId)
      applyIncoming(data.items ?? data.tasks, data.projectId ?? null)
    })

    const onHub = (e) => {
      const payload = e.detail || {}
      if (payload?.action !== 'task-sync') return
      const syncId = payload?.syncId ?? null
      const sourceUserId = payload?.sourceUserId ?? null
      if (syncId && hasSeenSync(syncId)) {
        console.log('[Agile Sync Stable] ignored duplicate sync', syncId)
        return
      }
      if (sourceUserId && sourceUserId === ownerUserIdRef.current) {
        console.log('[Agile Sync Stable] ignored own sync', syncId)
        return
      }
      if (syncId) markSyncSeen(syncId)
      applyIncoming(payload.items ?? payload.tasks, payload.projectId ?? null)
    }
    window.addEventListener('hub:message', onHub)
    return () => {
      unsubMsg()
      window.removeEventListener('hub:message', onHub)
    }
  }, [ownerUserId, memberProjectIds, activeProject?.id, visibilityOptions])

  const syncAgileItems = async (changedItems, fullList) => {
    if (!ownerUserId) return
    if (!activeProjectId) return
    if (!Array.isArray(memberProjectIds) || !memberProjectIds.includes(activeProjectId)) return
    const list = Array.isArray(changedItems) ? changedItems : []
    const normalized = list.map((it) => {
      if (!it?.projectId) return it
      // Project-scoped backlog items must be shared/general for teammate consistency.
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

    const meta = buildSyncMeta()
    sendToAllPeers({
      type: 'TASK_SYNC',
      items: outgoing,
      projectId: activeProjectId,
      ...meta,
    })
    await broadcastTaskSync(outgoing, activeProjectId, meta)
    await upsertRemoteTasks(outgoing, ownerUserId)
  }

  // One-time migration: if legacy backlog items were created as "personal" but have a projectId,
  // flip them to shared/general so they sync consistently across teammates.
  useEffect(() => {
    if (!ownerUserId || !activeProjectId) return
    if (!Array.isArray(memberProjectIds) || !memberProjectIds.includes(activeProjectId)) return
    if (isLoading) return
    const key = `zc-agile-sync-migrated:${ownerUserId}:${activeProjectId}`
    try {
      if (typeof window !== 'undefined' && window.localStorage?.getItem(key) === '1') return
    } catch {
      // ignore
    }
    const candidates = (Array.isArray(items) ? items : []).filter(
      (it) =>
        it &&
        String(it.projectId ?? '') === String(activeProjectId) &&
        (it.calendarType === 'personal' || it.calendarType === 'custom'),
    )
    if (candidates.length === 0) {
      try {
        if (typeof window !== 'undefined') window.localStorage?.setItem(key, '1')
      } catch {
        // ignore
      }
      return
    }
    const migrated = candidates.map((it) => ({
      ...it,
      calendarType: 'general',
      calendarId: 'general',
      updatedAt: Date.now(),
    }))
    setItems((prev) => {
      const uid = ownerUserIdRef.current
      const merged = Array.isArray(prev) ? [...prev] : []
      const byId = new Map(merged.map((x) => [x?.id, x]))
      for (const m of migrated) byId.set(m.id, m)
      const next = Array.from(byId.values()).map((t) => normalizeTaskForStorage(t, uid)).filter(Boolean)
      void saveTasks(next, uid, { reason: 'Agile sync migration' })
      void syncAgileItems(migrated, next)
      return next
    })
    try {
      if (typeof window !== 'undefined') window.localStorage?.setItem(key, '1')
    } catch {
      // ignore
    }
  }, [ownerUserId, activeProjectId, memberProjectIds, isLoading, items])

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
      const changed = next.find((it) => it?.id === itemId) ?? null
      if (changed) void syncAgileItems([changed], next)
      return next
    })
  }

  const upsertItem = (updatedItem) => {
    setItems((prev) => {
      const uid = ownerUserIdRef.current
      const now = Date.now()
      const merged = {
        ...updatedItem,
        // Ensure project-scoped backlog items are shared/general for sync.
        ...(updatedItem?.projectId
          ? { calendarType: 'general', calendarId: 'general' }
          : {}),
        updatedAt: now,
      }
      const normalized = uid ? normalizeTaskForStorage(merged, uid) : merged
      if (!normalized) return prev
      const next = dedupeAndNormalizePositions([
        normalized,
        ...(Array.isArray(prev) ? prev.filter((it) => it?.id !== normalized.id) : []),
      ])
      if (uid) void saveTasks(next, uid, { reason: 'ProductBacklog upsert' })
      void syncAgileItems([normalized], next)
      return next
    })
  }

  const createItem = (payload) => {
    setItems((prev) => {
      const uid = ownerUserIdRef.current
      if (!uid) return prev
      const normalized = normalizeTaskForStorage(
        payload?.projectId ? { ...payload, calendarType: 'general', calendarId: 'general' } : payload,
        uid,
      )
      if (!normalized) return prev
      const next = dedupeAndNormalizePositions([
        normalized,
        ...(Array.isArray(prev) ? prev.filter((it) => it?.id !== normalized.id) : []),
      ])
      void saveTasks(next, uid, { reason: 'ProductBacklog create' })
      void syncAgileItems([normalized], next)
      return next
    })
  }

  const deleteItem = (itemId) => {
    setItems((prev) => {
      const uid = ownerUserIdRef.current
      const list = Array.isArray(prev) ? prev : []
      const existing = list.find((it) => it?.id === itemId) ?? null
      if (!existing) return prev
      // For project-scoped items, use tombstone delete so peers/Supabase receive the deletion.
      const isProjectScoped = !!existing.projectId
      const next = isProjectScoped
        ? list.map((it) =>
            it?.id === itemId ? markTaskSoftDeleted({ ...existing }, Date.now()) : it,
          )
        : list.filter((it) => it?.id !== itemId)
      if (uid) void saveTasks(next, uid, { allowEmpty: true, reason: 'ProductBacklog delete' })
      if (isProjectScoped) {
        const tomb = next.find((it) => it?.id === itemId)
        if (tomb) void syncAgileItems([tomb], next)
      }
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

