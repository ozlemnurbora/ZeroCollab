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
    <aside className="h-full w-full overflow-hidden rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.3)]">
      <div className="border-b border-[rgb(var(--zc-border))] px-4 py-3">
        <p className="text-sm font-semibold text-[rgb(var(--zc-text))]">
          {t('chat_conversations')}
        </p>
        <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
          {t('chat_conversations_sub')}
        </p>
      </div>

      <div className="h-[calc(100%-56px)] overflow-y-auto px-2 py-2">
        <Section title={t('chat_section_channels')}>
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

        <Section title={t('chat_section_dms')}>
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

function Section({ title, children }) {
  return (
    <div className="mb-3">
      <p className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--zc-subtle))]">
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
        'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
        active
          ? 'bg-[rgb(var(--zc-border))] text-[rgb(var(--zc-text))]'
          : 'text-[rgb(var(--zc-muted))] hover:bg-[rgb(var(--zc-border)/0.7)] hover:text-[rgb(var(--zc-text))]',
      ].join(' ')}
    >
      <span
        className="w-4 text-center text-[rgb(var(--zc-muted2))]"
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </button>
  )
}
