import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/** Value stored on task.assignee (same as before). */
export function projectMemberAssigneeLabel(member) {
  if (!member || typeof member !== 'object') return ''
  const displayName = String(member.displayName ?? member.display_name ?? '').trim()
  if (displayName) return displayName
  const username = String(
    member.username ?? member.user_name ?? member.userName ?? '',
  ).trim()
  if (username) return username
  const email = String(member.email ?? member.user_email ?? '').trim()
  if (email) return email
  const name = String(member.name ?? '').trim()
  if (name) return name
  const id = String(member.userId ?? member.user_id ?? '').trim()
  return id
}

function enrichMember(member) {
  const email = String(member.email ?? member.user_email ?? '').trim()
  const displayName = String(member.displayName ?? member.display_name ?? '').trim()
  const username = String(
    member.username ?? member.user_name ?? member.userName ?? '',
  ).trim()
  const name = String(member.name ?? '').trim()
  let primary = displayName || username || name
  let secondary = email
  if (!primary && email) {
    primary = email
    secondary = ''
  }
  const assignValue = projectMemberAssigneeLabel(member)
  const initials = (primary || '?').slice(0, 2).toUpperCase()
  return {
    id: String(member.userId ?? member.user_id ?? assignValue),
    primary,
    secondary,
    assignValue,
    initials,
  }
}

export function buildAssigneeDatalistOptions(projectMembers) {
  const list = Array.isArray(projectMembers) ? projectMembers : []
  const byLabel = new Map()
  for (const m of list) {
    const label = projectMemberAssigneeLabel(m)
    if (!label) continue
    const key = label.toLowerCase()
    if (byLabel.has(key)) continue
    byLabel.set(key, {
      label,
      id: String(m.userId ?? m.user_id ?? key),
    })
  }
  return [...byLabel.values()].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  )
}

/**
 * Free-text assignee with dark-themed project member suggestions (no native datalist).
 */
export function AssigneeInputWithDatalist({
  projectMembers = [],
  value,
  onChange,
  disabled = false,
  placeholder = '',
  className = '',
  onBlur,
  inputId,
}) {
  const containerRef = useRef(null)
  const listRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [panelRect, setPanelRect] = useState({
    top: 0,
    left: 0,
    width: 0,
  })

  const updatePanelRect = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPanelRect({
      top: r.bottom + 4,
      left: r.left,
      width: r.width,
    })
  }, [])

  const rows = useMemo(() => {
    const list = Array.isArray(projectMembers) ? projectMembers : []
    const seen = new Set()
    const out = []
    for (const m of list) {
      const r = enrichMember(m)
      if (!r.assignValue) continue
      const k = r.assignValue.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      out.push(r)
    }
    return out.sort((a, b) =>
      a.primary.localeCompare(b.primary, undefined, { sensitivity: 'base' }),
    )
  }, [projectMembers])

  const filtered = useMemo(() => {
    const q = (value || '').trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.primary.toLowerCase().includes(q) ||
        (r.secondary && r.secondary.toLowerCase().includes(q)) ||
        r.assignValue.toLowerCase().includes(q),
    )
  }, [rows, value])

  useEffect(() => {
    if (!open) return
    updatePanelRect()
    window.addEventListener('resize', updatePanelRect)
    window.addEventListener('scroll', updatePanelRect, true)
    const onDoc = (e) => {
      if (containerRef.current?.contains(e.target)) return
      if (listRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => {
      window.removeEventListener('resize', updatePanelRect)
      window.removeEventListener('scroll', updatePanelRect, true)
      document.removeEventListener('mousedown', onDoc)
    }
  }, [open, updatePanelRect])

  const pick = (assignValue) => {
    onChange({ target: { value: assignValue } })
    setOpen(false)
  }

  const showPanel =
    open && !disabled && rows.length > 0 && filtered.length > 0

  const panel = showPanel ? (
    <ul
      ref={listRef}
      className="max-h-48 overflow-auto rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.98)] py-1 shadow-xl shadow-black/50 ring-1 ring-[rgb(var(--zc-border)/0.5)]"
      style={{
        position: 'fixed',
        top: panelRect.top,
        left: panelRect.left,
        width: panelRect.width,
        zIndex: 100,
      }}
      role="listbox"
    >
      {filtered.map((r) => (
        <li key={`${r.id}-${r.assignValue}`} role="presentation">
          <button
            type="button"
            role="option"
            className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-[rgb(var(--zc-border)/0.45)]"
            onMouseDown={(e) => {
              e.preventDefault()
              pick(r.assignValue)
            }}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/25 text-[10px] font-semibold uppercase tracking-tight text-indigo-200">
              {r.initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-[rgb(var(--zc-text))]">
                {r.primary}
              </div>
              {r.secondary ? (
                <div className="truncate text-xs text-[rgb(var(--zc-muted2))]">
                  {r.secondary}
                </div>
              ) : null}
            </div>
          </button>
        </li>
      ))}
    </ul>
  ) : null

  return (
    <div ref={containerRef} className="relative">
      <input
        id={inputId}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e)
          if (rows.length > 0) {
            setOpen(true)
            requestAnimationFrame(() => updatePanelRect())
          }
        }}
        onBlur={onBlur}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
        onFocus={() => {
          if (!disabled && rows.length > 0) {
            setOpen(true)
            requestAnimationFrame(() => updatePanelRect())
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            setOpen(false)
          }
        }}
      />
      {panel && typeof document !== 'undefined'
        ? createPortal(panel, document.body)
        : null}
    </div>
  )
}
