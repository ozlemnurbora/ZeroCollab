import { CHAT_CHANNELS } from './chatConstants.js'
import { useLanguage } from '../../utils/LanguageContext.jsx'

function iconFor(item) {
  return item.type === 'dm' ? '•' : '#'
}

export function ConversationList({ activeId, onSelect }) {
  const { t } = useLanguage()
  const channels = CHAT_CHANNELS.filter((c) => c.type === 'channel')
  const dms = CHAT_CHANNELS.filter((c) => c.type === 'dm')

  const labelFor = (id) => {
    const key = `channel_${id.replace(/:/g, '_')}`
    return t(key)
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
          {channels.map((c) => (
            <Item
              key={c.id}
              label={labelFor(c.id)}
              active={c.id === activeId}
              onClick={() => onSelect?.(c.id)}
              icon={iconFor(c)}
            />
          ))}
        </Section>

        <Section title={t('chat_section_dms')}>
          {dms.map((c) => (
            <Item
              key={c.id}
              label={labelFor(c.id)}
              active={c.id === activeId}
              onClick={() => onSelect?.(c.id)}
              icon={iconFor(c)}
            />
          ))}
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
