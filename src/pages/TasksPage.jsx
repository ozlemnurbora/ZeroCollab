import { KanbanBoard } from '../components/kanban/KanbanBoard.jsx'
import { useLanguage } from '../utils/LanguageContext.jsx'

export function TasksPage() {
  const { t } = useLanguage()
  return (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[rgb(var(--zc-text))] sm:text-3xl">
            {t('page_tasks_title')}
          </h1>
          <p className="mt-2 text-sm text-[rgb(var(--zc-muted))] sm:text-base">
            {t('page_tasks_subtitle')}
          </p>
        </div>
      </div>

      <KanbanBoard />
    </section>
  )
}
