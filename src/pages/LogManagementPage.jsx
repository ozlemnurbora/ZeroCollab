import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLanguage } from '../utils/LanguageContext.jsx'
import { useWorkspace } from '../utils/WorkspaceContext.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Modal } from '../components/ui/Modal.jsx'
import {
  LOG_CATEGORY_META,
  LOG_SEVERITY_META,
} from '../utils/logCategories.js'
import {
  clearLogs,
  exportLogsAsJson,
  formatLogTime,
  getLogs,
} from '../utils/logService.js'

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

function humanizeAction(action) {
  if (!action) return 'Activity'
  const parts = String(action).split('.')
  const noun = parts[0] || 'item'
  const verb = parts.slice(1).join(' ') || 'updated'
  return `${noun[0].toUpperCase()}${noun.slice(1)} ${verb}`
}

export function LogManagementPage() {
  const { t } = useLanguage()
  const { activeProject } = useWorkspace()
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
    setLoading(true)
    try {
      const raw = await getLogs({ ...filters, limit: FETCH_LIMIT })
      // Scope to active project. Workspace-level events (projectId == null)
      // such as auth.login/logout always show through.
      const scoped = activeProject?.id
        ? raw.filter(
            (log) => log.projectId === activeProject.id || log.projectId == null,
          )
        : raw
      setLogs(scoped.slice(0, DISPLAY_LIMIT))
      setTotal(scoped.length)
    } finally {
      setLoading(false)
    }
  }, [filters, activeProject?.id])

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
          (log) => log.projectId === activeProject.id || log.projectId == null,
        )
      : all
    downloadJson(`zerocollab-logs-${new Date().toISOString()}.json`, scoped)
  }

  const handleConfirmClear = async () => {
    await clearLogs()
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
          {activeProject ? (
            <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-indigo-500/15 px-3 py-1">
              <span className={`h-2 w-2 rounded-full ${activeProject.color}`} />
              <span className="text-xs font-medium text-indigo-300">
                {activeProject.name}
              </span>
            </div>
          ) : null}
          <p className="mt-1 text-sm text-[rgb(var(--zc-muted))]">
            {t('logs_page_sub')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => void handleExport()}>
            ⬇ {t('logs_export')}
          </Button>
          <Button
            variant="danger"
            onClick={() => setConfirmClearOpen(true)}
            disabled={total === 0}
          >
            🗑 {t('logs_clear_all')}
          </Button>
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
                {meta.icon} {meta.label}
              </option>
            ))}
          </select>

          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="h-9 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-2 text-xs text-[rgb(var(--zc-text))] focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
          >
            <option value="all">{t('logs_filter_all_severities')}</option>
            {severityOptions.map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.label}
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
              const time = formatLogTime(log.timestamp)
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
                        {humanizeAction(log.action)}
                      </span>
                      {sevMeta && log.severity !== 'info' ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sevMeta.badgeClass}`}
                        >
                          {sevMeta.label}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-[rgb(var(--zc-muted))]">
                      {log.message || '—'}
                      {log.projectName ? (
                        <span className="text-[rgb(var(--zc-subtle))]">
                          {' '}
                          · in {log.projectName}
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
              Cancel
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
          {t('logs_clear_confirm_body')}
        </p>
      </Modal>
    </section>
  )
}
