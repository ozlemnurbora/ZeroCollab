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
import { useTokenCapabilities } from '../utils/tokenEconomics/useTokenCapabilities.js'

const ROADMAP_LOCK_MESSAGE = 'Upgrade your ZC plan to unlock roadmap management.'

function normalizeItemType(item) {
  if (!item) return 'task'
  const it = String(item.itemType ?? '').toLowerCase().trim()
  if (it) {
    if (it === 'epic') return 'epic'
    if (it === 'feature') return 'feature'
    if (it === 'user_story' || it === 'user story' || it === 'userstory') return 'user_story'
    if (it === 'task') return 'task'
    return 'task'
  }
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
  const { canManageRoadmap, tier } = useTokenCapabilities()
  const roadmapLocked = !canManageRoadmap
  const lockTooltipProps = roadmapLocked
    ? { title: ROADMAP_LOCK_MESSAGE, 'aria-disabled': true }
    : {}

  const [items, setItems] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasLoadedItems, setHasLoadedItems] = useState(false)
  const itemsRef = useRef(items)
  const lastNonEmptyItemsRef = useRef([])
  const lastHydratedAtRef = useRef(0)
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
    console.log('[Roadmap Persistence Debug] ownerUserId', ownerUserId)
  }, [ownerUserId])

  useEffect(() => {
    itemsRef.current = items
    if (Array.isArray(items) && items.length > 0) {
      lastNonEmptyItemsRef.current = items
    }
  }, [items])

  const applyStateSnapshot = (sourceName, nextList) => {
    const nextArr = Array.isArray(nextList) ? nextList : []
    console.warn('[Roadmap State Source]', sourceName, nextArr.length)
    setItems((prev) => {
      const prevArr = Array.isArray(prev) ? prev : []

      if (nextArr.length === 0) {
        const last = lastNonEmptyItemsRef.current
        if (prevArr.length > 0) {
          console.warn('[Roadmap Navigation Guard] prevented empty navigation wipe')
          return prevArr
        }
        if (Array.isArray(last) && last.length > 0) {
          console.warn('[Roadmap Navigation Guard] prevented empty navigation wipe')
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
        console.warn('[Roadmap Merge Guard] ignored likely-stale snapshot', {
          source: sourceName,
          prev: prevArr.length,
          next: nextArr.length,
          msSinceHydrate,
        })
        return prevArr
      }

      const merged = dedupeAndNormalizePositions(mergeAgileWorkItems(prevArr, nextArr))
      console.warn('[Roadmap Merge Guard]', {
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
      console.log('[Roadmap Hydration Persist] local', localAll.length, 'remote', remoteCount, 'merged', 'pending')

      const merged = dedupeAndNormalizePositions(mergeAgileWorkItems(localAll, remoteItems))
      console.log('[Roadmap Hydration Persist] local', localAll.length, 'remote', remoteCount, 'merged', merged.length)

      // Never let empty remote wipe local. Only write if we actually have items.
      if (merged.length > 0) {
        await saveTasks(merged, ownerUserId, { reason: 'ProductRoadmap hydration persist' })
        console.log('[Roadmap Hydration Persist] saved to IndexedDB', merged.length)
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

  // Keep page state fresh when other pages save to IndexedDB.
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

      console.log('[Roadmap Central Sync] incoming', {
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

        console.log('[Roadmap Central Sync] merged', {
          before: Array.isArray(prev) ? prev.length : 0,
          after: next.length,
        })

        if (uid && next.length > 0) {
          void saveTasks(next, uid, { reason: 'ProductRoadmap inbound central sync persist' })
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

  const visibleItems = useMemo(() => {
    try {
      console.log('[Roadmap Render Debug] raw items', Array.isArray(items) ? items.length : 0)
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
      console.log('[Roadmap Render Debug] visible items', Array.isArray(merged) ? merged.length : 0)
    } catch {
      // ignore
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
      .sort((a, b) => {
        const od = a.__order - b.__order
        if (od !== 0) return od
        const au = Number(a.updatedAt ?? 0) || 0
        const bu = Number(b.updatedAt ?? 0) || 0
        if (au !== bu) return bu - au
        const at = String(a.title || '')
        const bt = String(b.title || '')
        const td = at.localeCompare(bt)
        if (td !== 0) return td
        return String(a.id || '').localeCompare(String(b.id || ''))
      })
  }, [typed])

  const byBucket = useMemo(() => {
    const out = { now: [], next: [], later: [] }
    for (const it of roadmapPrimaryItems) {
      out[it.__bucket].push(it)
    }
    return out
  }, [roadmapPrimaryItems])

  const timelineData = useMemo(() => {
    const withDates = roadmapPrimaryItems.filter((it) => it.targetDate)
    if (withDates.length === 0) return null

    const now = new Date()
    const startDates = withDates.map((it) => {
      const start = it.startDate ? new Date(it.startDate) : new Date(now.getFullYear(), now.getMonth(), 1)
      return start
    })
    const endDates = withDates.map((it) => new Date(it.targetDate))

    const minDate = new Date(Math.min(...startDates.map((d) => d.getTime()), now.getTime()))
    const maxDate = new Date(Math.max(...endDates.map((d) => d.getTime()), now.getTime()))

    // Generate months array from minDate to maxDate + 1 month
    const months = []
    const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
    const end = new Date(maxDate.getFullYear(), maxDate.getMonth() + 2, 1)
    while (cursor < end) {
      months.push({ year: cursor.getFullYear(), month: cursor.getMonth(), label: cursor.toLocaleString('en', { month: 'short', year: 'numeric' }) })
      cursor.setMonth(cursor.getMonth() + 1)
    }

    const totalDays = Math.max(1, (end.getTime() - new Date(months[0].year, months[0].month, 1).getTime()) / (1000 * 60 * 60 * 24))
    const timelineStart = new Date(months[0].year, months[0].month, 1).getTime()

    const items = withDates.map((it) => {
      const itemStart = it.startDate ? new Date(it.startDate) : new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const itemEnd = new Date(it.targetDate)
      const leftPercent = Math.max(0, ((itemStart.getTime() - timelineStart) / (totalDays * 24 * 60 * 60 * 1000)) * 100)
      const widthPercent = Math.max(2, ((itemEnd.getTime() - itemStart.getTime()) / (totalDays * 24 * 60 * 60 * 1000)) * 100)
      const isOverdue = itemEnd < now && it.__state !== 'done'
      const isDone = it.__state === 'done'
      return { ...it, leftPercent, widthPercent, isOverdue, isDone, itemStart, itemEnd }
    })

    // Today marker position
    const todayPercent = ((now.getTime() - timelineStart) / (totalDays * 24 * 60 * 60 * 1000)) * 100

    return { months, items, todayPercent, totalDays }
  }, [roadmapPrimaryItems])

  const updateItem = (itemId, updates) => {
    if (roadmapLocked) {
      console.log('[Roadmap Gate] update blocked', { itemId, updates, tier })
      if (typeof window !== 'undefined') window.alert(ROADMAP_LOCK_MESSAGE)
      return
    }
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
    if (roadmapLocked) {
      console.log('[Roadmap Gate] delete blocked', { itemId, tier })
      if (typeof window !== 'undefined') window.alert(ROADMAP_LOCK_MESSAGE)
      return
    }
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

              // Progress calculation
              let progressPercent = null
              let progressDone = 0
              let progressTotal = 0
              if (itType === 'user_story') {
                const linkedTasks = typed.tasksByStory.get(it.id) ?? []
                progressTotal = linkedTasks.length
                progressDone = linkedTasks.filter((t) => String(t.status ?? '').toLowerCase() === 'done').length
                progressPercent = progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : null
              } else if (itType === 'feature') {
                const linkedStories = typed.storiesByFeature.get(it.id) ?? []
                progressTotal = linkedStories.length
                progressDone = linkedStories.filter((s) => String(s.backlogState ?? '').toLowerCase() === 'done').length
                progressPercent = progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : null
              } else if (itType === 'epic') {
                const linkedFeatures = typed.featuresByEpic.get(it.id) ?? []
                progressTotal = linkedFeatures.length
                progressDone = linkedFeatures.filter((f) => String(f.backlogState ?? '').toLowerCase() === 'done').length
                progressPercent = progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : null
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
                        {it.targetDate && (
                          <span className={`font-medium ${new Date(it.targetDate) < new Date() && it.__state !== 'done' ? 'text-rose-400' : 'text-emerald-300'}`}>
                            Due: {it.targetDate}
                            {new Date(it.targetDate) < new Date() && it.__state !== 'done' ? ' (overdue)' : ''}
                          </span>
                        )}
                        {parentText ? <span>{parentText}</span> : null}
                        {childText ? <span>{childText}</span> : null}
                        {progressPercent !== null && (
                          <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-16 rounded-full bg-[rgb(var(--zc-border))]">
                              <div
                                className={`h-1.5 rounded-full transition-all ${progressPercent === 100 ? 'bg-emerald-400' : progressPercent >= 50 ? 'bg-indigo-400' : 'bg-amber-400'}`}
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                            <span className={`text-[10px] font-medium ${progressPercent === 100 ? 'text-emerald-400' : 'text-[rgb(var(--zc-subtle))]'}`}>
                              {progressPercent}% ({progressDone}/{progressTotal})
                            </span>
                          </div>
                        )}
                        {it.assignee && (
                          <span className="flex items-center gap-1 text-[10px] text-[rgb(var(--zc-subtle))]">
                            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500/25 text-[8px] font-bold text-indigo-300">
                              {String(it.assignee).charAt(0).toUpperCase()}
                            </span>
                            {it.assignee}
                          </span>
                        )}
                        {it.updatedAt && (
                          <span className="text-[10px] text-[rgb(var(--zc-subtle))]">
                            Updated: {(() => {
                              const diff = Date.now() - it.updatedAt
                              const minutes = Math.floor(diff / 60000)
                              if (minutes < 1) return 'just now'
                              if (minutes < 60) return `${minutes}m ago`
                              const hours = Math.floor(minutes / 60)
                              if (hours < 24) return `${hours}h ago`
                              const days = Math.floor(hours / 24)
                              if (days < 30) return `${days}d ago`
                              return `${Math.floor(days / 30)}mo ago`
                            })()}
                          </span>
                        )}
                      </div>
                    </div>

                    <div
                      className={[
                        'flex flex-wrap items-center gap-2',
                        roadmapLocked ? 'opacity-60' : '',
                      ].join(' ')}
                    >
                      <select
                        className="h-8 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 text-xs text-[rgb(var(--zc-text))] disabled:cursor-not-allowed"
                        value={bucketKey}
                        onChange={(e) =>
                          updateItem(it.id, { roadmapBucket: e.target.value })
                        }
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Roadmap bucket"
                        disabled={roadmapLocked}
                        {...lockTooltipProps}
                      >
                        <option value="now">Now</option>
                        <option value="next">Next</option>
                        <option value="later">Later</option>
                      </select>

                      <input
                        className="h-8 w-[120px] rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 text-xs text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] disabled:cursor-not-allowed"
                        value={String(sprint)}
                        placeholder="Planned sprint"
                        onChange={(e) =>
                          updateItem(it.id, { plannedSprint: e.target.value })
                        }
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Planned sprint"
                        disabled={roadmapLocked}
                        {...lockTooltipProps}
                      />

                      <input
                        type="date"
                        className="h-8 w-[140px] rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 text-xs text-[rgb(var(--zc-text))] disabled:cursor-not-allowed"
                        value={it.targetDate || ''}
                        onChange={(e) =>
                          updateItem(it.id, { targetDate: e.target.value })
                        }
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Target date"
                        disabled={roadmapLocked}
                        {...lockTooltipProps}
                      />

                      <input
                        type="number"
                        className="h-8 w-[90px] rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 text-xs text-[rgb(var(--zc-text))] disabled:cursor-not-allowed"
                        value={String(it.__order)}
                        onChange={(e) =>
                          updateItem(it.id, { roadmapOrder: e.target.value })
                        }
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Roadmap order"
                        disabled={roadmapLocked}
                        {...lockTooltipProps}
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
          Product Roadmap prioritizes backlog items, shows which features will be developed first, and tracks delivery timelines across future sprints.
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

        {roadmapLocked ? (
          <div
            className="mt-3 flex flex-col gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 sm:flex-row sm:items-center sm:justify-between"
            role="status"
          >
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-200 ring-1 ring-amber-500/30">
                Locked
              </span>
              <span className="font-medium">
                Roadmap editing is locked on your current plan.
              </span>
            </div>
            <span className="text-[11px] text-amber-200/85">
              {ROADMAP_LOCK_MESSAGE}
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

      {/* ── Timeline View ── */}
      {timelineData && timelineData.items.length > 0 && (
        <div className="mt-6 rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] overflow-hidden">
          <div className="border-b border-[rgb(var(--zc-border))] px-4 py-3">
            <h2 className="text-sm font-semibold text-[rgb(var(--zc-text))]">Timeline</h2>
            <p className="text-[11px] text-[rgb(var(--zc-subtle))]">Items with target dates shown on a timeline. Set target dates above to see items here.</p>
          </div>

          {/* Month headers */}
          <div className="relative border-b border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.3)]">
            <div className="flex">
              {timelineData.months.map((m, i) => (
                <div key={i} className="flex-1 border-r border-[rgb(var(--zc-border))] px-2 py-1.5 text-center text-[10px] font-medium text-[rgb(var(--zc-muted))]" style={{ minWidth: '80px' }}>
                  {m.label}
                </div>
              ))}
            </div>
          </div>

          {/* Timeline rows */}
          <div className="relative">
            {/* Today marker */}
            {timelineData.todayPercent > 0 && timelineData.todayPercent < 100 && (
              <div className="absolute top-0 bottom-0 z-10 w-0.5 bg-rose-400/60" style={{ left: `${timelineData.todayPercent}%` }}>
                <div className="absolute -top-0 -left-2.5 rounded bg-rose-400 px-1 py-0 text-[8px] font-bold text-white">TODAY</div>
              </div>
            )}

            {timelineData.items.map((it) => {
              const barColor = it.isDone
                ? 'bg-emerald-500/70'
                : it.isOverdue
                  ? 'bg-rose-500/70'
                  : it.__bucket === 'now'
                    ? 'bg-indigo-500/70'
                    : it.__bucket === 'next'
                      ? 'bg-violet-500/60'
                      : 'bg-slate-500/50'

              return (
                <button
                  key={it.id}
                  type="button"
                  className="relative flex w-full items-center border-b border-[rgb(var(--zc-border))] hover:bg-[rgb(var(--zc-border)/0.1)] transition"
                  onClick={() => setSelectedItemId(it.id)}
                >
                  {/* Item label (left side) */}
                  <div className="w-[200px] shrink-0 border-r border-[rgb(var(--zc-border))] px-3 py-2">
                    <p className="truncate text-xs font-medium text-[rgb(var(--zc-text))]">{it.title || '(untitled)'}</p>
                    <div className="mt-0.5 flex items-center gap-1">
                      <span className={`rounded px-1 py-0 text-[8px] font-semibold ${it.__itemType === 'epic' ? 'bg-purple-500/20 text-purple-300' : it.__itemType === 'feature' ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                        {itemTypeLabel(it.__itemType)}
                      </span>
                      <span className={`text-[8px] font-medium ${it.isDone ? 'text-emerald-400' : it.isOverdue ? 'text-rose-400' : 'text-[rgb(var(--zc-subtle))]'}`}>
                        {it.isDone ? 'Done' : it.isOverdue ? 'Overdue' : it.__state}
                      </span>
                    </div>
                  </div>

                  {/* Bar area */}
                  <div className="relative flex-1 h-10">
                    <div
                      className={`absolute top-2 h-6 rounded-md ${barColor} flex items-center px-1.5 min-w-[20px]`}
                      style={{ left: `${it.leftPercent}%`, width: `${Math.min(it.widthPercent, 100 - it.leftPercent)}%` }}
                    >
                      <span className="truncate text-[9px] font-medium text-white/90">
                        {it.targetDate}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-6 rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.25)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-6 text-xs text-[rgb(var(--zc-subtle))]">
          <span>Total items: {roadmapPrimaryItems.length}</span>
          <span>Now: {byBucket.now.length}</span>
          <span>Next: {byBucket.next.length}</span>
          <span>Later: {byBucket.later.length}</span>
          <span>
            With deadlines: {roadmapPrimaryItems.filter((it) => it.targetDate).length}
          </span>
          <span className="text-rose-400">
            Overdue: {roadmapPrimaryItems.filter((it) => it.targetDate && new Date(it.targetDate) < new Date() && it.__state !== 'done').length}
          </span>
          <span className="text-emerald-400">
            Done: {roadmapPrimaryItems.filter((it) => it.__state === 'done').length}
          </span>
          <span>
            Assigned: {roadmapPrimaryItems.filter((it) => it.assignee).length}
          </span>
        </div>
        <p className="mt-1.5 text-[11px] text-[rgb(var(--zc-subtle))]">
          Roadmap shows Epics, Features, and User Stories. Tasks appear as linked child counts. Set target dates to track delivery timelines.
        </p>
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
        readOnly={roadmapLocked}
        readOnlyMessage={ROADMAP_LOCK_MESSAGE}
      />
    </section>
  )
}

