import { KanbanBoard } from '../components/kanban/KanbanBoard.jsx'
import { useLanguage } from '../utils/LanguageContext.jsx'
import { useWorkspace } from '../utils/WorkspaceContext.jsx'

export function TasksPage() {
  const { t } = useLanguage()
  const { activeProject } = useWorkspace()
  return (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[rgb(var(--zc-text))] sm:text-3xl">
            {t('page_tasks_title')}
          </h1>
          {activeProject ? (
            <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-indigo-500/15 px-3 py-1">
              <span
                className={`h-2 w-2 rounded-full ${activeProject.color}`}
              />
              <span className="text-xs font-medium text-indigo-300">
                {activeProject.name}
              </span>
            </div>
          ) : null}
          <p className="mt-2 text-sm text-[rgb(var(--zc-muted))] sm:text-base">
            {t('page_tasks_subtitle')}
          </p>
        </div>
      </div>

      <KanbanBoard />
    </section>
  )
}
