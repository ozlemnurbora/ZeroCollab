import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLanguage } from '../utils/LanguageContext.jsx'
import { useWorkspace } from '../utils/WorkspaceContext.jsx'
import { useAuth } from '../utils/AuthContext.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Modal } from '../components/ui/Modal.jsx'
import { ActiveProjectBadge } from '../components/common/ActiveProjectBadge.jsx'
import {
  LOG_CATEGORY_META,
  LOG_SEVERITY_META,
} from '../utils/logCategories.js'
import {
  clearLogsForProject,
  exportLogsAsJson,
  formatLogTime,
  getLogs,
  getProjectLogs,
} from '../utils/logService.js'
import { deleteRemoteLogsForProject } from '../utils/logRemoteStorage.js'
import { isAdminRole, normalizeProjectRole } from '../utils/roleOntology.js'

// Hard ceiling matches MAX_LOG_ENTRIES in logService.js. We fetch everything,
// scope/filter in JS, then slice for display so the "Showing X of Y" counter
// reflects the post-scope pool — not the raw global store.
const FETCH_LIMIT = 5000
const DISPLAY_LIMIT = 500

const RANGE_OPTIONS = ['all', 'today', '7d', '30d']
const POLL_INTERVAL_MS = 30000

function rangeToSince(range) {
  const now = Date.now()
  if (range === 'today') {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  if (range === '7d') return now - 7 * 24 * 60 * 60 * 1000
  if (range === '30d') return now - 30 * 24 * 60 * 60 * 1000
  return null
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const LOG_VERB_KEYS = {
  created: 'logs_verb_created',
  updated: 'logs_verb_updated',
  deleted: 'logs_verb_deleted',
  completed: 'logs_verb_completed',
  added: 'logs_verb_added',
  removed: 'logs_verb_removed',
  scheduled: 'logs_verb_scheduled',
  joined: 'logs_verb_joined',
  left: 'logs_verb_left',
}

const LOG_MSG_KEYS = {
  'task.created': 'logs_msg_task_created',
  'task.deleted': 'logs_msg_task_deleted',
  'task.updated': 'logs_msg_task_updated',
  'story.created': 'logs_msg_story_created',
  'story.deleted': 'logs_msg_story_deleted',
  'epic.created': 'logs_msg_epic_created',
  'epic.deleted': 'logs_msg_epic_deleted',
  'feature.created': 'logs_msg_feature_created',
  'feature.deleted': 'logs_msg_feature_deleted',
  'meeting.created': 'logs_msg_meeting_created',
  'meeting.deleted': 'logs_msg_meeting_deleted',
  'calendar.created': 'logs_msg_calendar_created',
  'calendar.deleted': 'logs_msg_calendar_deleted',
  'project.created': 'logs_msg_project_created',
  'project.deleted': 'logs_msg_project_deleted',
  'team.created': 'logs_msg_team_created',
  'team.deleted': 'logs_msg_team_deleted',
}

// Logs are stored with English messages at creation time. Re-localize at display
// time from the action + the quoted entity name so the panel follows the active
// language. Unknown actions fall back to the stored message verbatim.
function localizeMessage(log, t) {
  const stored = log?.message || '—'
  const action = log?.action
  const message = String(log?.message || '')

  if (action === 'auth.login') {
    const email = message.replace(/^Signed in as\s*/i, '').trim()
    return email ? t('logs_msg_login', { email }) : stored
  }
  if (action === 'auth.logout') {
    const email = message.replace(/^Signed out\s*/i, '').trim()
    return email ? t('logs_msg_logout', { email }) : t('logs_action_logout')
  }
  if (action === 'evaluation.created') {
    const scoreMatch = message.match(/(\d+)\s*\/\s*100/)
    const score = scoreMatch ? scoreMatch[1] : ''
    return score ? t('logs_msg_eval_completed', { score }) : stored
  }

  const key = LOG_MSG_KEYS[action]
  if (!key) return stored
  const match = message.match(/["']([^"']+)["']/)
  const title = match ? match[1] : ''
  if (!title) return stored
  return t(key, { title })
}

function humanizeAction(action, t) {
  if (!action) return t('logs_activity')
  if (action === 'auth.login') return t('logs_action_login')
  if (action === 'auth.logout') return t('logs_action_logout')
  const parts = String(action).split('.')
  const noun = parts[0] || 'item'
  const verb = parts.slice(1).join('.') || 'updated'
  const nounLabel = LOG_CATEGORY_META[noun]
    ? t(`logs_cat_${noun}`)
    : `${noun[0].toUpperCase()}${noun.slice(1)}`
  const verbLabel = LOG_VERB_KEYS[verb] ? t(LOG_VERB_KEYS[verb]) : verb
  return `${nounLabel} ${verbLabel}`
}

export function LogManagementPage() {
  const { t } = useLanguage()
  const { activeProject } = useWorkspace()
  const { user } = useAuth()
  const currentUserId = user?.id ?? null
  // Only a project owner/admin may clear the project's shared audit trail.
  const isProjectOwner =
    !!activeProject &&
    (activeProject.owner_id === user?.id || activeProject.ownerId === user?.id)
  const currentMember =
    (activeProject?.projectMembers || []).find((m) => m?.userId === user?.id) || null
  const currentProjectRole = normalizeProjectRole(
    currentMember?.role,
    currentMember?.memberSource,
    currentMember?.customRole,
  )
  const canClear =
    !!activeProject?.id && (isProjectOwner || isAdminRole(currentProjectRole))
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [severity, setSeverity] = useState('all')
  const [range, setRange] = useState('all')
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)

  const searchTimerRef = useRef(null)
  const initialLoadRef = useRef(true)

  useEffect(() => {
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current)
    searchTimerRef.current = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
    }, 250)
    return () => {
      if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current)
    }
  }, [search])

  const filters = useMemo(() => {
    const since = rangeToSince(range)
    const built = {}
    if (category !== 'all') built.category = category
    if (severity !== 'all') built.severity = severity
    if (debouncedSearch) built.search = debouncedSearch
    if (since != null) built.since = since
    return built
  }, [category, severity, debouncedSearch, range])

  const refreshLogs = useCallback(async () => {
    if (initialLoadRef.current) {
      setLoading(true)
    }
    try {
      let scoped
      if (activeProject?.id) {
        // Merged local + remote logs for this project (so teammates' actions show).
        // Project-scoped logs are the shared audit trail — shown for ALL users.
        const projectLogs = await getProjectLogs(activeProject.id, {
          ...filters,
          limit: FETCH_LIMIT,
        })
        // Plus local-only workspace events (auth.login/logout etc., projectId == null)
        // which are not shared remotely. Scope these to the current account so
        // other accounts' auth events on this browser don't leak in.
        const localAll = await getLogs({ ...filters, limit: FETCH_LIMIT })
        const workspaceLogs = localAll.filter(
          (log) => log.projectId == null && log.userId === currentUserId,
        )
        const byId = new Map()
        for (const log of projectLogs) if (log?.id) byId.set(log.id, log)
        for (const log of workspaceLogs)
          if (log?.id && !byId.has(log.id)) byId.set(log.id, log)
        scoped = Array.from(byId.values())
        scoped.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      } else {
        // No active project: show only the current user's own logs.
        const localAll = await getLogs({ ...filters, limit: FETCH_LIMIT })
        const own = localAll.filter((log) => log.userId === currentUserId)
        // A single login/logout writes one auth log per member project, so
        // collapse them to a single row per event (same action + second + user).
        const seenAuth = new Set()
        scoped = own.filter((log) => {
          if (log.category !== 'auth') return true
          const key = `${log.action}|${Math.round((log.timestamp || 0) / 1000)}|${log.userId}`
          if (seenAuth.has(key)) return false
          seenAuth.add(key)
          return true
        })
      }
      setLogs(scoped.slice(0, DISPLAY_LIMIT))
      setTotal(scoped.length)
    } finally {
      if (initialLoadRef.current) {
        setLoading(false)
        initialLoadRef.current = false
      }
    }
  }, [filters, activeProject?.id, currentUserId])

  useEffect(() => {
    void refreshLogs()
    const handler = () => {
      void refreshLogs()
    }
    window.addEventListener('zc-log', handler)
    const interval = window.setInterval(() => {
      void refreshLogs()
    }, POLL_INTERVAL_MS)
    return () => {
      window.removeEventListener('zc-log', handler)
      window.clearInterval(interval)
    }
  }, [refreshLogs])

  const handleExport = async () => {
    const all = await exportLogsAsJson()
    const scoped = activeProject?.id
      ? all.filter(
          (log) =>
            log.projectId === activeProject.id ||
            (log.projectId == null && log.userId === currentUserId),
        )
      : all.filter((log) => log.userId === currentUserId)
    downloadJson(`zerocollab-logs-${new Date().toISOString()}.json`, scoped)
  }

  const handleConfirmClear = async () => {
    if (!canClear || !activeProject?.id) return
    // Wipe the active project's shared trail (remote) and this project's local
    // entries only — other projects' and personal/auth logs are preserved.
    await deleteRemoteLogsForProject(activeProject.id)
    await clearLogsForProject(activeProject.id)
    setConfirmClearOpen(false)
    void refreshLogs()
  }

  const categoryOptions = useMemo(() => Object.entries(LOG_CATEGORY_META), [])
  const severityOptions = useMemo(() => Object.entries(LOG_SEVERITY_META), [])

  return (
    <section>
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-500 to-purple-600">
              📜 {t('logs_page_title')}
            </span>
          </h1>
          <ActiveProjectBadge />
          <p className="mt-1 text-sm text-[rgb(var(--zc-muted))]">
            {t('logs_page_sub')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => void handleExport()}>
            ⬇ {t('logs_export')}
          </Button>
          {canClear ? (
            <Button
              variant="danger"
              onClick={() => setConfirmClearOpen(true)}
              disabled={total === 0}
            >
              🗑 {t('logs_clear_all')}
            </Button>
          ) : null}
        </div>
      </div>

      {/* ── Toolbar: Search + Filters ── */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--zc-subtle))]">
              🔍
            </span>
            <input
              type="text"
              placeholder={t('logs_search_placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] py-2 pl-9 pr-3 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-9 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 text-xs text-[rgb(var(--zc-text))] focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
          >
            <option value="all">{t('logs_filter_all_categories')}</option>
            {categoryOptions.map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.icon} {t(`logs_cat_${key}`)}
              </option>
            ))}
          </select>

          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="h-9 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 text-xs text-[rgb(var(--zc-text))] focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
          >
            <option value="all">{t('logs_filter_all_severities')}</option>
            {severityOptions.map(([key]) => (
              <option key={key} value={key}>
                {t(`logs_sev_${key}`)}
              </option>
            ))}
          </select>

          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="h-9 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 text-xs text-[rgb(var(--zc-text))] focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
          >
            {RANGE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {t(`logs_filter_range_${opt}`)}
              </option>
            ))}
          </select>
        </div>

        <span className="text-xs text-[rgb(var(--zc-subtle))]">
          {t('logs_showing')} {logs.length} {t('logs_of')} {total}{' '}
          {t('logs_entries')}
        </span>
      </div>

      {/* ── Log List ── */}
      <div className="mt-4 overflow-hidden rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)]">
        {loading ? (
          <div className="px-4 py-10 text-center text-sm text-[rgb(var(--zc-muted2))]">
            {t('logs_loading')}
          </div>
        ) : logs.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-base font-medium text-[rgb(var(--zc-text))]">
              {activeProject
                ? `${t('logs_empty_title')} — ${activeProject.name}`
                : t('logs_empty_title')}
            </p>
            <p className="mt-1 text-sm text-[rgb(var(--zc-muted2))]">
              {t('logs_empty_sub')}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[rgb(var(--zc-border))]">
            {logs.map((log) => {
              const catMeta =
                LOG_CATEGORY_META[log.category] || LOG_CATEGORY_META.system
              const sevMeta = LOG_SEVERITY_META[log.severity]
              const time = formatLogTime(log.timestamp, t)
              return (
                <li
                  key={log.id}
                  className="flex items-start gap-3 px-4 py-3 transition hover:bg-[rgb(var(--zc-border)/0.2)]"
                >
                  <span
                    className={`shrink-0 text-xl leading-none ${catMeta.color}`}
                    aria-hidden="true"
                  >
                    {catMeta.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[rgb(var(--zc-text))]">
                        {humanizeAction(log.action, t)}
                      </span>
                      {sevMeta && log.severity !== 'info' ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sevMeta.badgeClass}`}
                        >
                          {t(`logs_sev_${log.severity}`)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-[rgb(var(--zc-muted))]">
                      {localizeMessage(log, t)}
                      {log.projectName ? (
                        <span className="text-[rgb(var(--zc-subtle))]">
                          {' '}
                          · {t('logs_in_project', { name: log.projectName })}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-medium text-[rgb(var(--zc-text))]">
                      {log.userName || t('logs_user_system')}
                    </p>
                    <p
                      className="mt-0.5 text-[11px] text-[rgb(var(--zc-subtle))]"
                      title={time.absolute}
                    >
                      {time.relative}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <Modal
        open={confirmClearOpen}
        onClose={() => setConfirmClearOpen(false)}
        title={t('logs_clear_confirm_title')}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setConfirmClearOpen(false)}
            >
              {t('btn_cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => void handleConfirmClear()}
            >
              {t('logs_clear_yes')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[rgb(var(--zc-muted))]">
          {t('logs_clear_confirm_body', { project: activeProject?.name || '' })}
        </p>
      </Modal>
    </section>
  )
}
