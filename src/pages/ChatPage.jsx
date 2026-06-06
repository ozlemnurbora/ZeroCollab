import { ChatShell } from '../components/chat/ChatShell.jsx'
import { useLanguage } from '../utils/LanguageContext.jsx'
import { useWorkspace } from '../utils/WorkspaceContext.jsx'

export function ChatPage() {
  const { t } = useLanguage()
  const { activeProject } = useWorkspace()
  return (
    <section>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-500 via-pink-500 to-violet-600">
          💬 {t('page_chat_title')}
        </span>
      </h1>
      <p className="mt-1 text-sm text-[rgb(var(--zc-muted))] sm:text-base">
        {t('page_chat_subtitle')}
      </p>
      {activeProject ? (
        <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-indigo-500/15 px-3 py-1">
          <span className={`h-2 w-2 rounded-full ${activeProject.color}`} />
          <span className="text-xs font-medium text-indigo-300">
            {activeProject.name}
          </span>
        </div>
      ) : null}

      <ChatShell />
    </section>
  )
}
