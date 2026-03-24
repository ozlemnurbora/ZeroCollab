import { ChatShell } from '../components/chat/ChatShell.jsx'
import { useLanguage } from '../utils/LanguageContext.jsx'

export function ChatPage() {
  const { t } = useLanguage()
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight text-[rgb(var(--zc-text))] sm:text-3xl">
        {t('page_chat_title')}
      </h1>
      <p className="mt-2 text-sm text-[rgb(var(--zc-muted))] sm:text-base">
        {t('page_chat_subtitle')}
      </p>

      <ChatShell />
    </section>
  )
}
