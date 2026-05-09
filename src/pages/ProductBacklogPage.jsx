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
  const { activeProject, memberProjectIds = [] } = useWorkspace()

  const [items, setItems] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasLoadedItems, setHasLoadedItems] = useState(false)
  const itemsRef = useRef(items)
  const lastNonEmptyItemsRef = useRef([])
  const lastHydratedAtRef = useRef(0)

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

