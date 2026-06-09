import { useEffect, useMemo, useRef, useState } from 'react'
import { useLanguage } from '../utils/LanguageContext.jsx'
import { useWorkspace } from '../utils/WorkspaceContext.jsx'
import { useAuth } from '../utils/AuthContext.jsx'
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
  tasksForP2PBroadcast,
  taskVisibleInActiveProject,
} from '../utils/taskP2PSync.js'
import { broadcastTaskSync } from '../utils/hubManager.js'
import { on, P2P_EVENTS, sendToAllPeers } from '../utils/p2pManager.js'
import {
  fetchRemoteProjectTasks,
  isSharedProjectTask,
  upsertRemoteTasks,
} from '../utils/taskRemoteStorage.js'
import { getPeerId } from '../utils/p2pManager.js'
import {
  normalizeAgileWorkItem,
  mergeAgileWorkItems,
  areAgileItemsEqual,
  buildAgileSyncPayload,
  shouldIgnoreIncomingSync,
  extractAgileItemsFromSyncMessage,
} from '../features/agile/sync/agileSyncEngine.js'
import { hasSeenSync, markSyncSeen } from '../features/agile/sync/syncDedupe.js'
import { addLogEntry } from '../utils/logService.js'
import { categoryFromItemType } from '../utils/logCategories.js'

function normalizeItemType(item) {
  if (!item) return 'task'
  const it = String(item.itemType ?? '').toLowerCase().trim()
  if (it) {
    if (it === 'epic') return 'epic'
    if (it === 'feature') return 'feature'
    if (it === 'user_story' || it === 'user story' || it === 'userstory') return 'user_story'
    if (it === 'task') return 'task'
    // Unknown: treat as task for grouping.
    return 'task'
  }
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
  const { activeProject, activeSprint, memberProjectIds = [] } = useWorkspace()

  const [items, setItems] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasLoadedItems, setHasLoadedItems] = useState(false)
  const itemsRef = useRef(items)
  const lastNonEmptyItemsRef = useRef([])
  const lastHydratedAtRef = useRef(0)

  const [createType, setCreateType] = useState(null) // epic|feature|user_story|task
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState(null)
  const [filterType, setFilterType] = useState('all') // 'all' | 'epic' | 'feature' | 'user_story' | 'task'
  const [filterState, setFilterState] = useState('all') // 'all' | 'new' | 'refined' | 'ready' | 'done'
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState('flat') // 'flat' | 'hierarchy'

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
    return { sourceUserId, sourcePeerId }
  }

  useEffect(() => {
    ownerUserIdRef.current = ownerUserId
  }, [ownerUserId])

  useEffect(() => {
    console.log('[Backlog Persistence Debug] ownerUserId', ownerUserId)
  }, [ownerUserId])

  useEffect(() => {
    itemsRef.current = items
    if (Array.isArray(items) && items.length > 0) {
      lastNonEmptyItemsRef.current = items
    }
  }, [items])

  const applyStateSnapshot = (sourceName, nextList) => {
    const nextArr = Array.isArray(nextList) ? nextList : []
    console.warn('[Backlog State Source]', sourceName, nextArr.length)
    setItems((prev) => {
      const prevArr = Array.isArray(prev) ? prev : []

      if (nextArr.length === 0) {
        const last = lastNonEmptyItemsRef.current
        if (prevArr.length > 0) {
          console.warn('[Backlog Navigation Guard] prevented empty navigation wipe')
          return prevArr
        }
        if (Array.isArray(last) && last.length > 0) {
          console.warn('[Backlog Navigation Guard] prevented empty navigation wipe')
          return last
        }
      }

      const msSinceHydrate = Date.now() - (lastHydratedAtRef.current || 0)
      if (
        msSinceHydrate >= 0 &&
        msSinceHydrate < 3000 &&
        nextArr.length > 0 &&
        nextArr.length < prevArr.length
      ) {
        console.warn('[Backlog Merge Guard] ignored likely-stale snapshot', {
          source: sourceName,
          prev: prevArr.length,
          next: nextArr.length,
          msSinceHydrate,
        })
        return prevArr
      }

      const merged = dedupeAndNormalizePositions(mergeAgileWorkItems(prevArr, nextArr))
      console.warn('[Backlog Merge Guard]', {
        source: sourceName,
        prev: prevArr.length,
        next: nextArr.length,
        merged: merged.length,
      })
      return areAgileItemsEqual(prevArr, merged) ? prevArr : merged
    })
  }

  useEffect(() => {
    if (!ownerUserId) {
      setItems([])
      setHasLoadedItems(false)
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
      applyStateSnapshot('initial local load', dedupeAndNormalizePositions(normalized))
      setIsLoading(false)
      setHasLoadedItems(true)
    })()
    return () => {
      cancelled = true
    }
  }, [ownerUserId])

  // When active project changes, reload safely without wiping current state while loading.
  useEffect(() => {
    if (!ownerUserId || !hasLoadedItems) return
    if (!activeProject?.id) return
    let cancelled = false
    ;(async () => {
      setIsLoading(true)
      const existing = await loadTasks(ownerUserId)
      if (cancelled) return
      const list = Array.isArray(existing) ? existing : []
      const normalized = list.map((it) => normalizeTaskForStorage(it, ownerUserId)).filter(Boolean)
      const next = dedupeAndNormalizePositions(normalized)
      applyStateSnapshot('project reload', next)
      setIsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [activeProject?.id, ownerUserId, hasLoadedItems])

  // Durable hydration: merge Supabase project work items into local cache (never wipes local).
  useEffect(() => {
    const projectId = activeProject?.id ?? null
    if (!projectId || !ownerUserId || !hasLoadedItems) return
    let cancelled = false
    ;(async () => {
      const remoteItems = await fetchRemoteProjectTasks(projectId)
      if (cancelled) return
      const localAll = Array.isArray(itemsRef.current) ? itemsRef.current : []
      const remoteCount = Array.isArray(remoteItems) ? remoteItems.length : 0
      console.log('[Backlog Hydration Persist] local', localAll.length, 'remote', remoteCount, 'merged', 'pending')

      const merged = dedupeAndNormalizePositions(mergeAgileWorkItems(localAll, remoteItems))
      console.log('[Backlog Hydration Persist] local', localAll.length, 'remote', remoteCount, 'merged', merged.length)

      // Never let empty remote wipe local. Only write if we actually have items.
      if (merged.length > 0) {
        // Persist hydration result even if UI already matches (prevents "shows once then empty after refresh").
        await saveTasks(merged, ownerUserId, { reason: 'ProductBacklog hydration persist' })
        console.log('[Backlog Hydration Persist] saved to IndexedDB', merged.length)
        lastHydratedAtRef.current = Date.now()
        applyStateSnapshot('remote hydration', merged)
      }

      // Backfill: if local has shared project items missing in Supabase, upsert them.
      const remoteIds = new Set((Array.isArray(remoteItems) ? remoteItems : []).map((t) => t?.id).filter(Boolean))
      const localSharedProject = localAll.filter(
        (t) => isSharedProjectTask(t) && String(t.projectId ?? '') === String(projectId),
      )
      const toBackfill = localSharedProject.filter((t) => t?.id && !remoteIds.has(t.id))
      if (toBackfill.length > 0) {
        console.log('[WorkItem Remote Upsert] count', toBackfill.length)
        await upsertRemoteTasks(toBackfill, ownerUserId)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeProject?.id, ownerUserId, hasLoadedItems])

  const visibilityOptions = useMemo(
    () => ({
      // IMPORTANT: Workspace membership can be temporarily empty during navigation/remount.
      // We still need to render active project items already in local cache.
      allowedProjectIds:
        Array.isArray(memberProjectIds) && memberProjectIds.length > 0
          ? memberProjectIds
          : activeProjectId
            ? [activeProjectId]
            : [],
      currentUserId: ownerUserId,
    }),
    [memberProjectIds, ownerUserId, activeProjectId],
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
          applyStateSnapshot('storage event reload', next)
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
    const applyIncomingPayload = (payload) => {
      const incoming = extractAgileItemsFromSyncMessage(payload)
      if (!Array.isArray(incoming) || incoming.length === 0) return

      const projectId = payload?.projectId ?? null
      if (projectId && !memberProjectIds.includes(projectId)) return
      if (activeProject?.id && projectId && projectId !== activeProject.id) return

      console.log('[Backlog Central Sync] incoming', {
        count: incoming.length,
        syncId: payload?.syncId ?? null,
      })

      setItems((prev) => {
        const uid = ownerUserIdRef.current
        const mergedBase = mergeAgileWorkItems(prev, incoming)
        if (mergedBase.length === 0 && prev.length > 0) return prev
        const next = dedupeAndNormalizePositions(
          mergedBase.map((t) => (uid ? { ...t, ownerUserId: uid } : t)),
        )

        console.log('[Backlog Central Sync] merged', {
          before: Array.isArray(prev) ? prev.length : 0,
          after: next.length,
        })

        if (uid && next.length > 0) {
          void saveTasks(next, uid, { reason: 'ProductBacklog inbound central sync persist' })
        }
        if (uid) {
          console.log('[WorkItem Remote Upsert] count', incoming.length)
          void upsertRemoteTasks(incoming, uid)
        }
        return areAgileItemsEqual(prev, next) ? prev : next
      })
    }

    const unsubMsg = on(P2P_EVENTS.MESSAGE, ({ data }) => {
      if (data?.type !== 'TASK_SYNC') return
      const payload = data
      if (shouldIgnoreIncomingSync(payload, ownerUserIdRef.current, hasSeenSync)) return
      if (payload?.syncId) markSyncSeen(payload.syncId)
      applyIncomingPayload(payload)
    })

    const onHub = (e) => {
      const payload = e.detail || {}
      if (payload?.action !== 'task-sync') return
      if (shouldIgnoreIncomingSync(payload, ownerUserIdRef.current, hasSeenSync)) return
      if (payload?.syncId) markSyncSeen(payload.syncId)
      applyIncomingPayload(payload)
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
    const outgoingNormalized = outgoing.map(normalizeAgileWorkItem).filter(Boolean)
    const payload = buildAgileSyncPayload({
      items: outgoingNormalized,
      projectId: activeProjectId,
      sourceUserId: meta.sourceUserId,
      sourcePeerId: meta.sourcePeerId,
    })
    sendToAllPeers(payload)
    await broadcastTaskSync(payload.items, activeProjectId, payload)
    await upsertRemoteTasks(payload.items, ownerUserId)
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
    // Render debug (filtering/derivation)
    try {
      const types = (Array.isArray(items) ? items : []).map((i) => i?.type || i?.itemType).filter(Boolean)
      const projIds = Array.from(new Set((Array.isArray(items) ? items : []).map((i) => i?.projectId).filter(Boolean)))
      console.log('[Backlog Render Debug] raw items', Array.isArray(items) ? items.length : 0)
      console.log('[Backlog Render Debug] item types', types)
      console.log('[Backlog Render Debug] project ids', projIds)
      console.log('[Backlog Render Debug] activeProject', activeProject?.id ?? null)
    } catch {
      // ignore
    }

    const visible = filterTasksForVisibility(items, visibilityOptions)
    if (!activeProject) return visible
    const scoped = visible.filter((it) =>
      taskVisibleInActiveProject(it, String(activeProject.id), ownerUserId),
    )
    const legacyNoProject = visible.filter((it) => it && !it.projectId)
    const merged = [...scoped]
    const seen = new Set(scoped.map((it) => it?.id).filter(Boolean))
    for (const it of legacyNoProject) {
      if (it?.id && !seen.has(it.id)) merged.push(it)
    }
    try {
      console.log('[Backlog Render Debug] visible items', Array.isArray(merged) ? merged.length : 0)
    } catch {
      // ignore
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

  const filteredItems = useMemo(() => {
    let list = Array.isArray(visibleItems) ? [...visibleItems] : []
    list = list.filter((it) => normalizeItemType(it) !== 'task')

    // Filter by type
    if (filterType !== 'all') {
      list = list.filter((it) => normalizeItemType(it) === filterType)
    }

    // Filter by backlog state
    if (filterState !== 'all') {
      list = list.filter((it) => normalizeBacklogState(it.backlogState) === filterState)
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(
        (it) =>
          (it.title || '').toLowerCase().includes(q) ||
          (it.description || '').toLowerCase().includes(q) ||
          (it.id || '').toLowerCase().includes(q),
      )
    }

    // Sort: by backlog state priority (new first, then refined, ready, done), then by updatedAt desc
    const stateOrder = { new: 0, refined: 1, ready: 2, done: 3 }
    const priorityOrder = { must: 0, should: 1, could: 2, wont: 3 }
    list.sort((a, b) => {
      // First: items with orderIndex come before items without
      const aOrder = Number(a.orderIndex ?? a.order_index ?? 0)
      const bOrder = Number(b.orderIndex ?? b.order_index ?? 0)
      if (aOrder > 0 && bOrder > 0) return aOrder - bOrder
      if (aOrder > 0 && bOrder === 0) return -1
      if (aOrder === 0 && bOrder > 0) return 1
      // Then by priority
      const pa = priorityOrder[String(a.priority ?? 'must').toLowerCase()] ?? 0
      const pb = priorityOrder[String(b.priority ?? 'must').toLowerCase()] ?? 0
      if (pa !== pb) return pa - pb
      const sa = stateOrder[normalizeBacklogState(a.backlogState)] ?? 0
      const sb = stateOrder[normalizeBacklogState(b.backlogState)] ?? 0
      if (sa !== sb) return sa - sb
      return (b.updatedAt || 0) - (a.updatedAt || 0)
    })

    return list
  }, [visibleItems, filterType, filterState, searchQuery])

  // For hierarchy view: group items under their parents
  const hierarchyItems = useMemo(() => {
    if (viewMode !== 'hierarchy') return []

    const getEpicParentId = (item) =>
      item?.parentEpicId ||
      item?.epicId ||
      item?.linkedEpicId ||
      item?.parentId ||
      null

    const getFeatureParentId = (item) =>
      item?.parentFeatureId ||
      item?.featureId ||
      item?.linkedFeatureId ||
      item?.parentId ||
      null

    const getStoryParentId = (item) =>
      item?.parentStoryId ||
      item?.storyId ||
      item?.linkedStoryId ||
      item?.parentId ||
      null

    // Use ALL visible items for hierarchy, then apply text/state filters after building tree
    let baseItems = Array.isArray(visibleItems) ? [...visibleItems] : []

    // Apply filters on the base items
    if (filterType !== 'all') {
      // In hierarchy mode with type filter, show the selected type AND all their ancestors
      const typeFiltered = baseItems.filter((it) => normalizeItemType(it) === filterType)
      const ancestorIds = new Set()
      for (const it of typeFiltered) {
        const storyP = getStoryParentId(it)
        const featureP = getFeatureParentId(it)
        const epicP = getEpicParentId(it)
        if (storyP) ancestorIds.add(storyP)
        if (featureP) ancestorIds.add(featureP)
        if (epicP) ancestorIds.add(epicP)
      }
      // Also find ancestors of ancestors
      for (const it of baseItems) {
        if (ancestorIds.has(it.id)) {
          const storyP = getStoryParentId(it)
          const featureP = getFeatureParentId(it)
          const epicP = getEpicParentId(it)
          if (storyP) ancestorIds.add(storyP)
          if (featureP) ancestorIds.add(featureP)
          if (epicP) ancestorIds.add(epicP)
        }
      }
      baseItems = baseItems.filter(
        (it) => normalizeItemType(it) === filterType || ancestorIds.has(it.id),
      )
    }
    if (filterState !== 'all') {
      baseItems = baseItems.filter((it) => normalizeBacklogState(it.backlogState) === filterState)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      baseItems = baseItems.filter(
        (it) =>
          (it.title || '').toLowerCase().includes(q) ||
          (it.description || '').toLowerCase().includes(q) ||
          (it.id || '').toLowerCase().includes(q),
      )
    }

    const epics = baseItems.filter((it) => normalizeItemType(it) === 'epic')
    const features = baseItems.filter((it) => normalizeItemType(it) === 'feature')
    const stories = baseItems.filter((it) => normalizeItemType(it) === 'user_story')
    const tasks = baseItems.filter((it) => normalizeItemType(it) === 'task')

    const usedFeatureIds = new Set()
    const usedStoryIds = new Set()
    const usedTaskIds = new Set()

    const result = []
    for (const epic of epics) {
      result.push({ ...epic, _depth: 0 })
      const epicFeatures = features.filter((f) => getEpicParentId(f) === epic.id)
      for (const feature of epicFeatures) {
        usedFeatureIds.add(feature.id)
        result.push({ ...feature, _depth: 1 })
        const featureStories = stories.filter((s) => getFeatureParentId(s) === feature.id)
        for (const story of featureStories) {
          usedStoryIds.add(story.id)
          result.push({ ...story, _depth: 2 })
          const storyTasks = tasks.filter((t) => getStoryParentId(t) === story.id)
          for (const task of storyTasks) {
            usedTaskIds.add(task.id)
            result.push({ ...task, _depth: 3 })
          }
        }
      }
    }
    // Add orphans with type-based depth fallback
    for (const f of features) {
      if (!usedFeatureIds.has(f.id)) result.push({ ...f, _depth: 1 })
    }
    for (const s of stories) {
      if (!usedStoryIds.has(s.id)) result.push({ ...s, _depth: 2 })
    }
    for (const t of tasks) {
      if (!usedTaskIds.has(t.id)) result.push({ ...t, _depth: 3 })
    }

    return result
  }, [visibleItems, viewMode, filterType, filterState, searchQuery])

  const openCreate = (type) => {
    setCreateType(type)
    setIsCreateOpen(true)
  }

  const updateItem = (itemId, updates) => {
    setItems((prev) => {
      const uid = ownerUserIdRef.current
      const now = Date.now()

      // User Story → Task Done validation (inline backlog dropdown path).
      // Block the change BEFORE any state mutation, saveTasks, or
      // syncAgileItems so storage / P2P / Supabase stay untouched on failure.
      console.log('[US Validation] updateItem', itemId, updates)
      const targetItem =
        (Array.isArray(prev) ? prev : []).find((it) => it?.id === itemId) ?? null
      if (
        targetItem &&
        normalizeItemType(targetItem) === 'user_story' &&
        String(updates?.backlogState || '').toLowerCase() === 'done'
      ) {
        const linkedTasks = (Array.isArray(prev) ? prev : []).filter(
          (t) =>
            normalizeItemType(t) === 'task' && t?.parentStoryId === targetItem.id,
        )
        const incompleteTasks = linkedTasks.filter(
          (t) => String(t?.backlogState || t?.status || '').toLowerCase() !== 'done',
        )
        console.log('[US Validation] linkedTasks', linkedTasks)
        console.log('[US Validation] incomplete', incompleteTasks.length)
        if (linkedTasks.length > 0 && incompleteTasks.length > 0) {
          if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert(
              `This User Story cannot be marked as Done. ${incompleteTasks.length} linked task(s) are still incomplete.`,
            )
          }
          return prev
        }
      }

      // Epic → Feature Done validation (inline backlog dropdown path).
      // Sibling rule to the User Story validation above; same bail-out
      // semantics so storage / P2P / Supabase stay untouched on failure.
      if (
        targetItem &&
        normalizeItemType(targetItem) === 'epic' &&
        String(updates?.backlogState || '').toLowerCase() === 'done'
      ) {
        const linkedFeatures = (Array.isArray(prev) ? prev : []).filter(
          (f) =>
            normalizeItemType(f) === 'feature' && f?.parentEpicId === targetItem.id,
        )
        const incompleteFeatures = linkedFeatures.filter(
          (f) => String(f?.backlogState || f?.status || '').toLowerCase() !== 'done',
        )
        console.log('[Epic Validation] linkedFeatures', linkedFeatures)
        console.log('[Epic Validation] incomplete', incompleteFeatures.length)
        if (linkedFeatures.length > 0 && incompleteFeatures.length > 0) {
          if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert(
              `This Epic cannot be marked as Done. ${incompleteFeatures.length} linked feature(s) are still incomplete.`,
            )
          }
          return prev
        }
      }

      // Feature → User Story Done validation (inline backlog dropdown path).
      // Sibling rule to the Epic / User Story validations above; same
      // bail-out semantics so storage / P2P / Supabase stay untouched.
      if (
        targetItem &&
        normalizeItemType(targetItem) === 'feature' &&
        String(updates?.backlogState || '').toLowerCase() === 'done'
      ) {
        const linkedStories = (Array.isArray(prev) ? prev : []).filter(
          (s) =>
            normalizeItemType(s) === 'user_story' &&
            s?.parentFeatureId === targetItem.id,
        )
        const incompleteStories = linkedStories.filter(
          (s) => String(s?.backlogState || s?.status || '').toLowerCase() !== 'done',
        )
        console.log('[Feature Validation] linkedStories', linkedStories)
        console.log('[Feature Validation] incomplete', incompleteStories.length)
        if (linkedStories.length > 0 && incompleteStories.length > 0) {
          if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert(
              `This Feature cannot be marked as Done. ${incompleteStories.length} linked user storie(s) are still incomplete.`,
            )
          }
          return prev
        }
      }

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
    // Determine create-vs-update from the pre-upsert snapshot; commit captured
    // inside the updater so we only log when the save actually goes through.
    const snapshotBefore = Array.isArray(itemsRef.current) ? itemsRef.current : []
    const existedBefore = snapshotBefore.some((it) => it?.id === updatedItem?.id)
    let committedItem = null
    setItems((prev) => {
      const uid = ownerUserIdRef.current
      const now = Date.now()

      // User Story → Task Done validation (modal Save path: onSave → upsertItem).
      // Block the change BEFORE any state mutation, saveTasks, or
      // syncAgileItems so storage / P2P / Supabase stay untouched on failure.
      console.log('[US Validation] upsertItem', updatedItem)
      if (
        updatedItem &&
        normalizeItemType(updatedItem) === 'user_story' &&
        String(updatedItem?.backlogState || '').toLowerCase() === 'done'
      ) {
        const storyId = updatedItem.id
        const linkedTasks = (Array.isArray(prev) ? prev : []).filter(
          (t) => normalizeItemType(t) === 'task' && t?.parentStoryId === storyId,
        )
        const incompleteTasks = linkedTasks.filter(
          (t) => String(t?.backlogState || t?.status || '').toLowerCase() !== 'done',
        )
        console.log('[US Validation] linkedTasks', linkedTasks)
        console.log('[US Validation] incomplete', incompleteTasks.length)
        if (linkedTasks.length > 0 && incompleteTasks.length > 0) {
          if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert(
              `This User Story cannot be marked as Done. ${incompleteTasks.length} linked task(s) are still incomplete.`,
            )
          }
          return prev
        }
      }

      // Epic → Feature Done validation (modal Save path: onSave → upsertItem).
      // Sibling rule to the User Story validation above; same bail-out
      // semantics so storage / P2P / Supabase stay untouched on failure.
      if (
        updatedItem &&
        normalizeItemType(updatedItem) === 'epic' &&
        String(updatedItem?.backlogState || '').toLowerCase() === 'done'
      ) {
        const epicId = updatedItem.id
        const linkedFeatures = (Array.isArray(prev) ? prev : []).filter(
          (f) => normalizeItemType(f) === 'feature' && f?.parentEpicId === epicId,
        )
        const incompleteFeatures = linkedFeatures.filter(
          (f) => String(f?.backlogState || f?.status || '').toLowerCase() !== 'done',
        )
        console.log('[Epic Validation] linkedFeatures', linkedFeatures)
        console.log('[Epic Validation] incomplete', incompleteFeatures.length)
        if (linkedFeatures.length > 0 && incompleteFeatures.length > 0) {
          if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert(
              `This Epic cannot be marked as Done. ${incompleteFeatures.length} linked feature(s) are still incomplete.`,
            )
          }
          return prev
        }
      }

      // Feature → User Story Done validation (modal Save path: onSave → upsertItem).
      // Sibling rule to the Epic / User Story validations above; same
      // bail-out semantics so storage / P2P / Supabase stay untouched.
      if (
        updatedItem &&
        normalizeItemType(updatedItem) === 'feature' &&
        String(updatedItem?.backlogState || '').toLowerCase() === 'done'
      ) {
        const featureId = updatedItem.id
        const linkedStories = (Array.isArray(prev) ? prev : []).filter(
          (s) =>
            normalizeItemType(s) === 'user_story' &&
            s?.parentFeatureId === featureId,
        )
        const incompleteStories = linkedStories.filter(
          (s) => String(s?.backlogState || s?.status || '').toLowerCase() !== 'done',
        )
        console.log('[Feature Validation] linkedStories', linkedStories)
        console.log('[Feature Validation] incomplete', incompleteStories.length)
        if (linkedStories.length > 0 && incompleteStories.length > 0) {
          if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert(
              `This Feature cannot be marked as Done. ${incompleteStories.length} linked user storie(s) are still incomplete.`,
            )
          }
          return prev
        }
      }

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
      committedItem = normalized
      return next
    })
    if (committedItem) {
      const logCat = categoryFromItemType(committedItem.itemType)
      const prevItem = snapshotBefore.find((it) => it?.id === updatedItem?.id) ?? null
      void addLogEntry({
        action: existedBefore ? `${logCat}.updated` : `${logCat}.created`,
        category: logCat,
        severity: existedBefore ? 'info' : 'success',
        message: `${existedBefore ? 'Updated' : 'Created'} ${logCat} "${committedItem.title || 'Untitled'}"`,
        userId: user?.id,
        userName: user?.email?.split('@')[0] || '',
        projectId: activeProject?.id,
        projectName: activeProject?.name || '',
        entityType: logCat,
        entityId: committedItem.id,
        entityName: committedItem.title || '',
        metadata: {
          assignee: committedItem.assignee || null,
          assigneeChanged: existedBefore
            ? (prevItem?.assignee || '') !== (committedItem.assignee || '')
            : false,
        },
      })
    }
  }

  const createItem = (payload) => {
    let createdItem = null
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
      createdItem = normalized
      return next
    })
    if (createdItem) {
      const logCat = categoryFromItemType(createdItem.itemType)
      void addLogEntry({
        action: `${logCat}.created`,
        category: logCat,
        severity: 'success',
        message: `Created ${logCat} "${createdItem.title || 'Untitled'}"`,
        userId: user?.id,
        userName: user?.email?.split('@')[0] || '',
        projectId: activeProject?.id,
        projectName: activeProject?.name || '',
        entityType: logCat,
        entityId: createdItem.id,
        entityName: createdItem.title || '',
        metadata: { assignee: createdItem.assignee || null },
      })
    }
  }

  const deleteItem = (itemId) => {
    const snapshot = Array.isArray(itemsRef.current) ? itemsRef.current : []
    const existingBefore = snapshot.find((it) => it?.id === itemId) ?? null
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
    if (existingBefore) {
      const logCat = categoryFromItemType(existingBefore.itemType)
      void addLogEntry({
        action: `${logCat}.deleted`,
        category: logCat,
        severity: 'warning',
        message: `Deleted ${logCat} "${existingBefore.title || 'Untitled'}"`,
        userId: user?.id,
        userName: user?.email?.split('@')[0] || '',
        projectId: activeProject?.id,
        projectName: activeProject?.name || '',
        entityType: logCat,
        entityId: existingBefore.id,
        entityName: existingBefore.title || '',
      })
    }
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

  // ── Type badge colors ──
  const typeBadge = (itemType) => {
    const colors = {
      epic: 'bg-purple-500/20 text-purple-300 ring-purple-500/30',
      feature: 'bg-blue-500/20 text-blue-300 ring-blue-500/30',
      user_story: 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/30',
      task: 'bg-amber-500/20 text-amber-300 ring-amber-500/30',
    }
    return colors[itemType] || colors.task
  }

  const stateBadge = (state) => {
    const colors = {
      new: 'bg-gray-500/20 text-gray-300',
      refined: 'bg-cyan-500/20 text-cyan-300',
      ready: 'bg-green-500/20 text-green-300',
      done: 'bg-indigo-500/20 text-indigo-300',
    }
    return colors[state] || colors.new
  }

  const displayItems = viewMode === 'hierarchy' ? hierarchyItems : filteredItems

  const sprintGroupedItems = useMemo(() => {
    if (!activeSprint?.id) return { sprintItems: [], backlogItems: displayItems, sprintLabel: null }
    const sprintItems = displayItems.filter(
      (it) => it.sprintId === activeSprint.id || it.inSprint === true,
    )
    const backlogItems = displayItems.filter(
      (it) => it.sprintId !== activeSprint.id && it.inSprint !== true,
    )
    const sprintNumber = activeSprint.sprint_number || activeSprint.sprintNumber || '?'
    return {
      sprintItems,
      backlogItems,
      sprintLabel: `Sprint #${sprintNumber}`,
    }
  }, [displayItems, activeSprint?.id, activeSprint?.sprint_number, activeSprint?.sprintNumber])

  const createInitialValues = useMemo(() => {
    const typeKey = createType || 'task'
    return {
      itemType: typeKey,
      backlogState: 'new',
    }
  }, [createType])

  // Reorder an item within its display group (sprint group or backlog group) by
  // swapping it with its neighbor. Persists order via sequential `orderIndex`
  // values for the whole group, which avoids the duplicate-number bug the old
  // free-text priority input allowed.
  const moveItemInGroup = (groupList, index, direction) => {
    const list = Array.isArray(groupList) ? groupList : []
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= list.length) return

    const reordered = [...list]
    const tmp = reordered[index]
    reordered[index] = reordered[targetIndex]
    reordered[targetIndex] = tmp

    const orderMap = new Map()
    reordered.forEach((it, i) => {
      if (it?.id) orderMap.set(it.id, i + 1)
    })

    setItems((prev) => {
      const uid = ownerUserIdRef.current
      const now = Date.now()
      const changed = []
      const next = (Array.isArray(prev) ? prev : []).map((it) => {
        if (!it?.id || !orderMap.has(it.id)) return it
        const newOrder = orderMap.get(it.id)
        if (Number(it.orderIndex ?? it.order_index ?? 0) === newOrder) return it
        const updated = { ...it, orderIndex: newOrder, updatedAt: now }
        changed.push(updated)
        return updated
      })
      if (uid) void saveTasks(next, uid, { reason: 'ProductBacklog reorder' })
      if (changed.length > 0) void syncAgileItems(changed, next)
      return next
    })
  }

  const renderItemRows = (itemList) => {
    return itemList.map((it, rowIndex) => {
      const isFirstInGroup = rowIndex === 0
      const isLastInGroup = rowIndex === itemList.length - 1
      const moveArrows = (
        <div className="flex flex-col items-center justify-center gap-0.5">
          {!isFirstInGroup && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Move up"
              title="Move up"
              onClick={(e) => {
                e.stopPropagation()
                moveItemInGroup(itemList, rowIndex, 'up')
              }}
              className="flex h-3.5 w-5 cursor-pointer items-center justify-center rounded text-[9px] leading-none text-[rgb(var(--zc-muted))] transition hover:bg-[rgb(var(--zc-border)/0.5)] hover:text-indigo-300"
            >
              ▲
            </span>
          )}
          {!isLastInGroup && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Move down"
              title="Move down"
              onClick={(e) => {
                e.stopPropagation()
                moveItemInGroup(itemList, rowIndex, 'down')
              }}
              className="flex h-3.5 w-5 cursor-pointer items-center justify-center rounded text-[9px] leading-none text-[rgb(var(--zc-muted))] transition hover:bg-[rgb(var(--zc-border)/0.5)] hover:text-indigo-300"
            >
              ▼
            </span>
          )}
        </div>
      )
      const itType = normalizeItemType(it)
      const state = normalizeBacklogState(it.backlogState)
      const typeDepthFallback = { epic: 0, feature: 1, user_story: 2, task: 3 }
      const depth = viewMode === 'hierarchy'
        ? (Number.isFinite(Number(it._depth)) ? Number(it._depth) : (typeDepthFallback[itType] ?? 0))
        : 0
      const indentPx = viewMode === 'hierarchy' ? depth * 34 : 0
      const priorityLabel = it.priority === 'must' ? 'Must' : it.priority === 'should' ? 'Should' : it.priority === 'could' ? 'Could' : it.priority === 'wont' ? "Won't" : it.priority || '—'
      const priorityIcon = it.priority === 'must' ? '🔴' : it.priority === 'should' ? '🟠' : it.priority === 'could' ? '🔵' : it.priority === 'wont' ? '⚪' : '⚪'
      const orderIndex = it.orderIndex ?? it.order_index ?? ''
      const assigneeName = it.assignee || ''
      const assigneeInitial = assigneeName ? assigneeName.charAt(0).toUpperCase() : ''
      const getRelativeTime = (timestamp) => {
        if (!timestamp) return '—'
        const now = Date.now()
        const diff = now - timestamp
        const minutes = Math.floor(diff / 60000)
        if (minutes < 1) return 'just now'
        if (minutes < 60) return `${minutes}m ago`
        const hours = Math.floor(minutes / 60)
        if (hours < 24) return `${hours}h ago`
        const days = Math.floor(hours / 24)
        if (days < 30) return `${days}d ago`
        const months = Math.floor(days / 30)
        return `${months}mo ago`
      }
      const lastUpdate = getRelativeTime(it.updatedAt || it.createdAt)
      const sp = it.storyPoints || it.story_points || 0
      const taskCount = itType === 'user_story' ? (hierarchyMaps.tasksByStory.get(it.id) ?? []).length : null
      const childCount = itType === 'epic' ? (hierarchyMaps.featuresByEpic.get(it.id) ?? []).length : itType === 'feature' ? (hierarchyMaps.storiesByFeature.get(it.id) ?? []).length : null

      let progressPercent = null
      let progressDone = 0
      let progressTotal = 0
      if (itType === 'user_story') {
        const linkedTasks = hierarchyMaps.tasksByStory.get(it.id) ?? []
        progressTotal = linkedTasks.length
        progressDone = linkedTasks.filter((t) => String(t.status ?? '').toLowerCase() === 'done').length
        progressPercent = progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : null
      } else if (itType === 'feature') {
        const linkedStories = hierarchyMaps.storiesByFeature.get(it.id) ?? []
        progressTotal = linkedStories.length
        progressDone = linkedStories.filter((s) => String(s.backlogState ?? '').toLowerCase() === 'done').length
        progressPercent = progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : null
      } else if (itType === 'epic') {
        const linkedFeatures = hierarchyMaps.featuresByEpic.get(it.id) ?? []
        progressTotal = linkedFeatures.length
        progressDone = linkedFeatures.filter((f) => String(f.backlogState ?? '').toLowerCase() === 'done').length
        progressPercent = progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : null
      }

      return (
        <button
          key={it.id}
          type="button"
          className="w-full py-3 text-left hover:bg-[rgb(var(--zc-border)/0.15)] transition group"
          style={{ paddingLeft: '16px', paddingRight: '16px' }}
          onClick={() => setSelectedItemId(it.id)}
        >
          <div className="sm:hidden">
            <div className="flex items-start gap-2">
              <div className="mt-0.5 shrink-0">{moveArrows}</div>
              <span className={`mt-0.5 inline-flex shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${typeBadge(itType)}`}>
                {itemTypeLabel(itType)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[rgb(var(--zc-text))]">
                  {orderIndex > 0 && <span className="text-indigo-400 mr-1">#{orderIndex}</span>}
                  {it.title || '(untitled)'}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {itType === 'task' && it.parentStoryId ? (
                    <span className="text-[10px] text-[rgb(var(--zc-subtle))]">
                      Story: {storyById.get(it.parentStoryId)?.title || it.parentStoryId}
                    </span>
                  ) : null}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${stateBadge(state)}`}>{state}</span>
                  <span className="text-[10px] text-[rgb(var(--zc-subtle))]">{priorityIcon} {priorityLabel}</span>
                  {sp > 0 && <span className="text-[10px] text-[rgb(var(--zc-subtle))]">SP: {sp}</span>}
                  {assigneeName ? (
                    <span className="flex items-center gap-1 text-[10px] text-[rgb(var(--zc-subtle))]">
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500/25 text-[8px] font-bold text-indigo-300">{assigneeInitial}</span>
                      {assigneeName}
                    </span>
                  ) : (
                    <span className="text-[10px] text-[rgb(var(--zc-subtle))]">Unassigned</span>
                  )}
                  <span className="text-[10px] text-[rgb(var(--zc-subtle))]">{lastUpdate}</span>
                  {taskCount !== null && <span className="text-[10px] text-[rgb(var(--zc-subtle))]">Tasks: {taskCount}</span>}
                  {childCount !== null && childCount > 0 && <span className="text-[10px] text-[rgb(var(--zc-subtle))]">Children: {childCount}</span>}
                  {progressPercent !== null && (
                    <div className="flex items-center gap-2 mt-1">
                      <div className="h-1.5 w-20 rounded-full bg-[rgb(var(--zc-border))]">
                        <div
                          className={`h-1.5 rounded-full transition-all ${progressPercent === 100 ? 'bg-emerald-400' : progressPercent >= 50 ? 'bg-indigo-400' : 'bg-amber-400'}`}
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <span className={`text-[10px] font-medium ${progressPercent === 100 ? 'text-emerald-400' : 'text-[rgb(var(--zc-subtle))]'}`}>{progressPercent}%</span>
                    </div>
                  )}
                </div>
              </div>
              <select
                className="h-7 shrink-0 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-1 text-[10px] text-[rgb(var(--zc-text))]"
                value={state}
                onChange={(e) => { e.stopPropagation(); updateItem(it.id, { backlogState: e.target.value }) }}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="new">New</option>
                <option value="refined">Refined</option>
                <option value="ready">Ready</option>
                <option value="done">Done</option>
              </select>
            </div>
          </div>

          <div className="hidden sm:grid sm:grid-cols-[40px_1fr_90px_80px_80px_50px_36px_70px] gap-2 items-center">
            {moveArrows}
            <div className="min-w-0 flex items-center" style={{ paddingLeft: `${indentPx}px` }}>
              {viewMode === 'hierarchy' && depth > 0 && (
                <span className="text-[rgb(var(--zc-subtle))] text-xs select-none shrink-0 mr-1.5">└</span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[rgb(var(--zc-text))] group-hover:text-indigo-300 transition">{it.title || '(untitled)'}</p>
                {it.description && <p className="mt-0.5 truncate text-xs text-[rgb(var(--zc-muted2))]">{it.description}</p>}
                {itType === 'task' && it.parentStoryId ? (
                  <p className="mt-0.5 truncate text-[10px] text-[rgb(var(--zc-subtle))]">
                    Story: {storyById.get(it.parentStoryId)?.title || it.parentStoryId}
                  </p>
                ) : null}
                <div className="flex items-center gap-2 flex-wrap">
                  {taskCount !== null && (
                    <span className="text-[10px] text-[rgb(var(--zc-subtle))]">{taskCount} task{taskCount !== 1 ? 's' : ''}</span>
                  )}
                  {childCount !== null && childCount > 0 && (
                    <span className="text-[10px] text-[rgb(var(--zc-subtle))]">{childCount} child{childCount !== 1 ? 'ren' : ''}</span>
                  )}
                  {progressPercent !== null && (
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="h-1.5 w-24 rounded-full bg-[rgb(var(--zc-border))]">
                        <div
                          className={`h-1.5 rounded-full transition-all ${progressPercent === 100 ? 'bg-emerald-400' : progressPercent >= 50 ? 'bg-indigo-400' : 'bg-amber-400'}`}
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <span className={`text-[10px] font-medium ${progressPercent === 100 ? 'text-emerald-400' : 'text-[rgb(var(--zc-subtle))]'}`}>{progressPercent}% ({progressDone}/{progressTotal})</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <span className={`inline-flex w-fit rounded-md px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${typeBadge(itType)}`}>{itemTypeLabel(itType)}</span>
            <select
              className="h-7 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-1 text-[10px] text-[rgb(var(--zc-text))] focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
              value={state}
              onChange={(e) => { e.stopPropagation(); updateItem(it.id, { backlogState: e.target.value }) }}
              onClick={(e) => e.stopPropagation()}
            >
              <option value="new">New</option>
              <option value="refined">Refined</option>
              <option value="ready">Ready</option>
              <option value="done">Done</option>
            </select>
            <span className="flex items-center gap-1 text-xs text-[rgb(var(--zc-muted))]">
              <span className="text-sm">{priorityIcon}</span>
              {priorityLabel}
            </span>
            <span className="text-xs text-[rgb(var(--zc-muted))] text-right">{sp > 0 ? sp : '—'}</span>
            <div className="flex justify-center">
              {assigneeName ? (
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/25 text-[10px] font-bold text-indigo-300" title={assigneeName}>
                  {assigneeInitial}
                </span>
              ) : (
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[rgb(var(--zc-border))] text-[10px] text-[rgb(var(--zc-subtle))]" title="Unassigned">
                  —
                </span>
              )}
            </div>
            <span className="text-[10px] text-[rgb(var(--zc-subtle))] text-right truncate" title={it.updatedAt ? new Date(it.updatedAt).toLocaleString() : ''}>{lastUpdate}</span>
          </div>
        </button>
      )
    })
  }

  return (
    <section>
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-500 to-indigo-600">{t('pb_title')}</span>
          </h1>
          <p className="mt-1 text-sm text-[rgb(var(--zc-muted))]">
            {t('pb_subtitle')}
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
        <button onClick={() => openCreate('task')} className="rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-600 hover:to-purple-700 transition">+ {t('pb_new_item')}</button>
      </div>

      {/* ── Toolbar: Search + Filters + View Toggle ── */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--zc-subtle))]">🔍</span>
            <input
              type="text"
              placeholder={t('pb_search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] py-2 pl-9 pr-3 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>

          {/* Type filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="h-9 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 text-xs text-[rgb(var(--zc-text))] focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
          >
            <option value="all">{t('pb_all_types')}</option>
            <option value="epic">Epic</option>
            <option value="feature">Feature</option>
            <option value="user_story">User Story</option>
          </select>

          {/* State filter */}
          <select
            value={filterState}
            onChange={(e) => setFilterState(e.target.value)}
            className="h-9 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 text-xs text-[rgb(var(--zc-text))] focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
          >
            <option value="all">{t('pb_all_states')}</option>
            <option value="new">New</option>
            <option value="refined">Refined</option>
            <option value="ready">Ready</option>
            <option value="done">Done</option>
          </select>
        </div>

        {/* View toggle + item count */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-[rgb(var(--zc-subtle))]">{displayItems.length} items</span>
          <div className="flex rounded-md border border-[rgb(var(--zc-border))]">
            <button
              type="button"
              onClick={() => setViewMode('flat')}
              className={`px-3 py-1.5 text-xs font-medium transition ${viewMode === 'flat' ? 'bg-indigo-600 text-white' : 'text-[rgb(var(--zc-muted))] hover:bg-[rgb(var(--zc-border)/0.4)]'}`}
            >
              {t('pb_view_list')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('hierarchy')}
              className={`px-3 py-1.5 text-xs font-medium transition ${viewMode === 'hierarchy' ? 'bg-indigo-600 text-white' : 'text-[rgb(var(--zc-muted))] hover:bg-[rgb(var(--zc-border)/0.4)]'}`}
            >
              {t('pb_view_hierarchy')}
            </button>
          </div>
        </div>
      </div>

      {/* ── Item List ── */}
      {isLoading ? (
        <div className="mt-4 rounded-lg border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.25)] px-4 py-8 text-center text-sm text-[rgb(var(--zc-muted2))]">
          {t('loading_tasks')}
        </div>
      ) : displayItems.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.25)] px-4 py-8 text-center text-sm text-[rgb(var(--zc-muted2))]">
          {searchQuery || filterType !== 'all' || filterState !== 'all'
            ? 'No items match your filters.'
            : 'No backlog items yet. Click "+ New Backlog Item" to create one.'}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Sprint Group */}
          {sprintGroupedItems.sprintLabel && sprintGroupedItems.sprintItems.length > 0 && (
            <div>
              <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-[rgb(var(--zc-border))] bg-gradient-to-r from-indigo-500/15 via-purple-500/10 to-indigo-500/5 px-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-indigo-300">{sprintGroupedItems.sprintLabel}</span>
                  <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-medium text-indigo-300">{sprintGroupedItems.sprintItems.length} items</span>
                </div>
                {activeSprint?.start_date && activeSprint?.end_date && (
                  <span className="text-[11px] text-[rgb(var(--zc-subtle))]">{activeSprint.start_date} → {activeSprint.end_date}</span>
                )}
              </div>
              <div className="rounded-b-lg border border-[rgb(var(--zc-border))] divide-y divide-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)]">
                {renderItemRows(sprintGroupedItems.sprintItems)}
              </div>
            </div>
          )}

          {/* Backlog Group */}
          <div>
            <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-[rgb(var(--zc-border))] bg-gradient-to-r from-slate-500/10 via-gray-500/5 to-transparent px-4 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[rgb(var(--zc-text))]">{t('pb_group_backlog')}</span>
                <span className="rounded-full bg-[rgb(var(--zc-border))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--zc-muted))]">{sprintGroupedItems.backlogItems.length} items</span>
              </div>
            </div>
            <div className="rounded-b-lg border border-[rgb(var(--zc-border))] divide-y divide-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)]">
              {sprintGroupedItems.backlogItems.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-[rgb(var(--zc-muted2))]">
                  All items are assigned to {sprintGroupedItems.sprintLabel || 'a sprint'}.
                </div>
              ) : (
                renderItemRows(sprintGroupedItems.backlogItems)
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Summary bar ── */}
      {!isLoading && displayItems.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-4 px-1 text-[11px] text-[rgb(var(--zc-subtle))]">
          <span>📋 Total: {displayItems.length}</span>
          <span><span className="inline-block h-2 w-2 rounded-full bg-gray-400 mr-1"></span>New: {displayItems.filter((it) => normalizeBacklogState(it.backlogState) === 'new').length}</span>
          <span><span className="inline-block h-2 w-2 rounded-full bg-cyan-400 mr-1"></span>Refined: {displayItems.filter((it) => normalizeBacklogState(it.backlogState) === 'refined').length}</span>
          <span><span className="inline-block h-2 w-2 rounded-full bg-green-400 mr-1"></span>Ready: {displayItems.filter((it) => normalizeBacklogState(it.backlogState) === 'ready').length}</span>
          <span><span className="inline-block h-2 w-2 rounded-full bg-indigo-400 mr-1"></span>Done: {displayItems.filter((it) => normalizeBacklogState(it.backlogState) === 'done').length}</span>
        </div>
      )}

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


