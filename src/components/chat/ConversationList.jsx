import { useLanguage } from '../../utils/LanguageContext.jsx'

function iconFor(item) {
  return item.type === 'dm' ? '•' : '#'
}

export function ConversationList({ conversations = [], activeId, onSelect }) {
  const { t } = useLanguage()
  const channels = conversations.filter((c) => c.type === 'channel')
  const dms = conversations.filter((c) => c.type === 'dm')

  const labelFor = (c) => {
    if (c?.name) return c.name
    const key = `channel_${String(c.id).replace(/:/g, '_')}`
    const tr = t(key)
    return tr !== key ? tr : c.id
  }

  return (
    <aside className="h-full w-full overflow-hidden rounded-xl border border-l-4 border-[rgb(var(--zc-border))] border-l-violet-500 bg-[rgb(var(--zc-panel)/0.45)] shadow-sm">
      <div className="border-b border-[rgb(var(--zc-border))] px-4 py-3">
        <p className="text-sm font-semibold text-transparent bg-clip-text bg-gradient-to-r from-violet-500 to-indigo-600">
          💬 {t('chat_conversations')}
        </p>
        <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
          {t('chat_conversations_sub')}
        </p>
      </div>

      <div className="h-[calc(100%-56px)] overflow-y-auto px-2 py-2">
        <Section title={t('chat_section_channels')} icon="#" accent="text-indigo-400">
          {channels.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[rgb(var(--zc-muted2))]">
              {t('chat_no_channels')}
            </p>
          ) : (
            channels.map((c) => (
              <Item
                key={c.id}
                label={labelFor(c)}
                active={c.id === activeId}
                onClick={() => onSelect?.(c.id)}
                icon={iconFor(c)}
              />
            ))
          )}
        </Section>

        <Section title={t('chat_section_dms')} icon="•" accent="text-emerald-400">
          {dms.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[rgb(var(--zc-muted2))]">
              {t('chat_no_dms')}
            </p>
          ) : (
            dms.map((c) => (
              <Item
                key={c.id}
                label={labelFor(c)}
                active={c.id === activeId}
                onClick={() => onSelect?.(c.id)}
                icon={iconFor(c)}
              />
            ))
          )}
        </Section>
      </div>
    </aside>
  )
}

function Section({ title, children, icon, accent }) {
  return (
    <div className="mb-3">
      <p className="flex items-center gap-1.5 px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--zc-subtle))]">
        {icon ? (
          <span className={accent || 'text-[rgb(var(--zc-muted2))]'} aria-hidden="true">
            {icon}
          </span>
        ) : null}
        {title}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Item({ label, active, onClick, icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
        active
          ? 'bg-indigo-500/15 font-medium text-indigo-300 ring-1 ring-inset ring-indigo-500/30'
          : 'text-[rgb(var(--zc-muted))] hover:bg-[rgb(var(--zc-border)/0.5)] hover:text-[rgb(var(--zc-text))]',
      ].join(' ')}
    >
      <span
        className={[
          'w-4 text-center',
          active ? 'text-indigo-300' : 'text-[rgb(var(--zc-muted2))]',
        ].join(' ')}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </button>
  )
}
