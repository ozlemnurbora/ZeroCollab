import { ChatShell } from '../components/chat/ChatShell.jsx'

export function ChatPage() {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight text-[rgb(var(--zc-text))] sm:text-3xl">
        Chat
      </h1>
      <p className="mt-2 text-sm text-[rgb(var(--zc-muted))] sm:text-base">
        Team messaging in a channel + DM layout. (Local only for now.)
      </p>

      <ChatShell />
    </section>
  )
}

