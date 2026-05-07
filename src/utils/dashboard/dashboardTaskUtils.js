import { filterTasksForVisibility } from '../taskP2PSync.js'

function isAgileHierarchyTaskItem(item) {
  // Agile hierarchy refactor: dashboard metrics should reflect Tasks only (no Epic/Feature/User Story).
  if (!item) return false
  if ('type' in item) return item.type === 'Task'
  const it = String(item.itemType ?? '').toLowerCase()
  return it === 'task'
}

function isDeletedLike(task) {
  if (!task) return true
  if (task.deleted === true) return true
  if (task.isDeleted === true) return true
  if (task._deleted === true) return true
  if (task.tombstone === true) return true
  if (task.deletedAt != null) return true
  if (task.deleted_at != null) return true
  return false
}

function normalizeStatus(value) {
  if (value == null) return 'todo'
  const raw = String(value).trim()
  const low = raw.toLowerCase()
  if (low === 'done') return 'done'
  if (
    low === 'in_progress' ||
    low === 'in progress' ||
    low === 'inprogress' ||
    low === 'in-progress'
  )
    return 'in_progress'
  if (
    low === 'in_review' ||
    low === 'in review' ||
    low === 'inreview' ||
    low === 'in-review'
  )
    return 'in_review'
  if (low === 'todo' || low === 'to do' || low === 'to-do') return 'todo'
  return low
}

function safeDayKey(ts) {
  const n = Number(ts)
  if (!Number.isFinite(n) || n <= 0) return null
  const d = new Date(n)
  if (Number.isNaN(d.getTime())) return null
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

export function normalizeAssigneeKey(value) {
  if (value == null) return ''
  let s = String(value).trim().toLowerCase()
  if (!s) return ''
  // If email-like, use prefix before '@'
  const at = s.indexOf('@')
  if (at > 0) s = s.slice(0, at)
  // Collapse spaces
  s = s.replace(/\s+/g, '')
  return s
}

export function getTaskAssignee(task) {
  const t = task || {}
  return (
    t.assignee ??
    t.assigneeName ??
    t.assigneeEmail ??
    t.assignedTo ??
    t.ownerName ??
    t.ownerEmail ??
    t.userName ??
    t.userEmail ??
    ''
  )
}

export function getMemberDisplayName(member) {
  if (member == null) return ''
  if (typeof member === 'string') {
    const key = normalizeAssigneeKey(member)
    return key || ''
  }
  const username = member.username ?? member.user?.username ?? ''
  if (username) return String(username)
  const name = member.name ?? ''
  if (name) return String(name)
  const email =
    member.email ?? member.user?.email ?? member.user_email ?? member.userEmail ?? ''
  const emailKey = normalizeAssigneeKey(email)
  return emailKey || ''
}

export function getMemberKey(member) {
  if (member == null) return ''
  if (typeof member === 'string') return normalizeAssigneeKey(member)
  const username = member.username ?? member.user?.username ?? ''
  if (username) return normalizeAssigneeKey(username)
  const email =
    member.email ?? member.user?.email ?? member.user_email ?? member.userEmail ?? ''
  const emailKey = normalizeAssigneeKey(email)
  if (emailKey) return emailKey
  const name = member.name ?? ''
  return normalizeAssigneeKey(name)
}

export function buildDashboardMembers({ activeProject, teams, visibleTasks }) {
  const membersByKey = new Map()

  const add = (key, display) => {
    const k = normalizeAssigneeKey(key)
    if (!k) return
    const d = (display || '').toString().trim()
    if (!membersByKey.has(k)) membersByKey.set(k, d || k)
  }

  // Team/project members first (preferred display names)
  if (activeProject?.teamIds?.length && Array.isArray(teams) && teams.length) {
    const teamIds = new Set(activeProject.teamIds)
    for (const team of teams) {
      if (!teamIds.has(team?.id)) continue
      for (const m of team?.members || []) {
        const key = getMemberKey(m)
        const display = getMemberDisplayName(m)
        add(key, display)
      }
    }
  }

  // Also include assignees from visible tasks (so workload never drops to 0 due to missing team data)
  for (const t of Array.isArray(visibleTasks) ? visibleTasks : []) {
    const assignee = getTaskAssignee(t)
    const key = normalizeAssigneeKey(assignee)
    if (!key) continue
    add(key, key)
  }

  return Array.from(membersByKey.entries())
    .map(([key, display]) => ({ key, display }))
    .sort((a, b) => a.display.localeCompare(b.display))
}

export function getVisibleDashboardTasks({
  rawTasks,
  memberProjectIds,
  currentUserId,
  activeProjectId = null,
}) {
  const rawList = Array.isArray(rawTasks) ? rawTasks : []
  const prefiltered = rawList
    .filter((t) => t && !isDeletedLike(t))
    .filter(isAgileHierarchyTaskItem)
  const allowed = Array.isArray(memberProjectIds) ? memberProjectIds : []
  const scoped = filterTasksForVisibility(prefiltered, {
    allowedProjectIds: allowed,
    currentUserId: currentUserId ?? null,
  })

  if (!activeProjectId) return scoped

  // Match Tasks page behavior closely: when an active project is selected,
  // scope to that project's tasks + legacy/personal tasks with no projectId.
  return scoped.filter((t) => t?.projectId === activeProjectId || !t?.projectId)
}

export function calculateDashboardMetrics({
  visibleTasks,
  now = Date.now(),
  recentLimit = 5,
}) {
  const list = Array.isArray(visibleTasks) ? visibleTasks : []

  const statusCounts = {
    todo: 0,
    in_progress: 0,
    in_review: 0,
    done: 0,
  }

  for (const t of list) {
    const s = normalizeStatus(
      t?.status ?? t?.column ?? t?.state ?? t?.kanbanStatus ?? null,
    )
    if (s in statusCounts) statusCounts[s] += 1
    else statusCounts.todo += 1
  }

  const totalTasks = list.length
  const inProgressTasks = statusCounts.in_progress
  const inReviewTasks = statusCounts.in_review
  const completedTasks = statusCounts.done
  const completionPercent =
    totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100)

  const recentTasks = [...list]
    .sort(
      (a, b) =>
        (Number(b?.updatedAt ?? b?.createdAt ?? 0) || 0) -
        (Number(a?.updatedAt ?? a?.createdAt ?? 0) || 0),
    )
    .slice(0, Math.max(0, recentLimit))

  const workloadMap = new Map()
  for (const t of list) {
    const aRaw = getTaskAssignee(t)
    const key = normalizeAssigneeKey(aRaw)
    if (!key) continue
    workloadMap.set(key, (workloadMap.get(key) || 0) + 1)
  }
  const workloadByMember = Array.from(workloadMap.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))

  // Weekly activity (last 7 days, inclusive)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const createdByDay = new Map()
  const completedByDay = new Map()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    createdByDay.set(key, 0)
    completedByDay.set(key, 0)
  }

  for (const t of list) {
    const createdKey = safeDayKey(t?.createdAt)
    if (createdKey && createdByDay.has(createdKey)) {
      createdByDay.set(createdKey, (createdByDay.get(createdKey) || 0) + 1)
    }
    const completedAt = t?.completedAt ?? t?.doneAt ?? null
    const completedKey = safeDayKey(completedAt)
    if (
      normalizeStatus(t?.status) === 'done' &&
      completedKey &&
      completedByDay.has(completedKey)
    ) {
      completedByDay.set(
        completedKey,
        (completedByDay.get(completedKey) || 0) + 1,
      )
    }
  }

  const weeklyActivity = Array.from(createdByDay.keys()).map((key) => {
    const d = new Date(key)
    const label = `${d.getMonth() + 1}/${d.getDate()}`
    return {
      date: label,
      created: createdByDay.get(key) ?? 0,
      completed: completedByDay.get(key) ?? 0,
    }
  })

  return {
    totalTasks,
    inProgressTasks,
    inReviewTasks,
    completedTasks,
    recentTasks,
    workloadByMember,
    taskStatusCounts: statusCounts,
    completionPercent,
    weeklyActivity,
  }
}

