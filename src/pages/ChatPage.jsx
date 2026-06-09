import { ChatShell } from '../components/chat/ChatShell.jsx'
import { useLanguage } from '../utils/LanguageContext.jsx'
import { ActiveProjectBadge } from '../components/common/ActiveProjectBadge.jsx'

export function ChatPage() {
  const { t } = useLanguage()
  return (
    <section>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-500 via-pink-500 to-violet-600">
          💬 {t('page_chat_title')}
        </span>
      </h1>
      <ActiveProjectBadge />
      <p className="mt-1 text-sm text-[rgb(var(--zc-muted))] sm:text-base">
        {t('page_chat_subtitle')}
      </p>

      <ChatShell />
    </section>
  )
}
