import { Link } from 'react-router-dom'
import { KanbanBoard } from '../components/kanban/KanbanBoard.jsx'
import { useWorkspace } from '../utils/WorkspaceContext.jsx'
import { useLanguage } from '../utils/LanguageContext.jsx'
import { ActiveProjectBadge } from '../components/common/ActiveProjectBadge.jsx'

export function SprintBoardPage() {
  const { t } = useLanguage()
  const { activeProject, activeSprint } = useWorkspace()

  if (!activeProject) {
    return (
      <section>
        <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-600">
          {t('sb_title')}
        </h2>
        <p className="mt-3 text-sm text-[rgb(var(--zc-muted2))]">
          {t('sb_no_project')}
        </p>
      </section>
    )
  }

  if (!activeSprint?.id) {
    return (
      <section className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="max-w-md space-y-2">
          <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-600">
            {t('sb_title')}
          </h2>
          <p className="text-sm text-[rgb(var(--zc-text))]">{t('po_no_active_sprint')}</p>
          <p className="text-sm text-[rgb(var(--zc-muted2))]">
            {t('sb_create_hint')}
          </p>
        </div>
        <Link
          to="/sprint-planning"
          className="rounded-md bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-600 hover:to-purple-700 transition"
        >
          {t('sb_go_planning')}
        </Link>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-600">📌 {t('sb_title')}</span>
        </h2>
        <div className="flex items-center gap-2">
          <ActiveProjectBadge />
          <span className="mt-2 text-sm text-[rgb(var(--zc-muted2))]">Sprint #{activeSprint.sprint_number}</span>
        </div>
      </div>
      {/* Burndown chart is rendered inside KanbanBoard directly under the sprint summary (same task state as the board). */}
      <KanbanBoard variant="sprint_board" />
    </section>
  )
}
