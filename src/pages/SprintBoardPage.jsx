import { Link } from 'react-router-dom'
import { KanbanBoard } from '../components/kanban/KanbanBoard.jsx'
import { useWorkspace } from '../utils/WorkspaceContext.jsx'

export function SprintBoardPage() {
  const { activeProject, activeSprint } = useWorkspace()

  if (!activeProject) {
    return (
      <section>
        <h2 className="text-2xl font-semibold text-[rgb(var(--zc-text))]">
          Sprint Board
        </h2>
        <p className="mt-3 text-sm text-[rgb(var(--zc-muted2))]">
          Select an active project to view the sprint board.
        </p>
      </section>
    )
  }

  if (!activeSprint?.id) {
    return (
      <section className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="max-w-md space-y-2">
          <h2 className="text-2xl font-semibold text-[rgb(var(--zc-text))]">
            Sprint Board
          </h2>
          <p className="text-sm text-[rgb(var(--zc-text))]">No active sprint.</p>
          <p className="text-sm text-[rgb(var(--zc-muted2))]">
            Create a sprint from Sprint Planning.
          </p>
        </div>
        <Link
          to="/sprint-planning"
          className="rounded-md bg-indigo-500/25 px-4 py-2 text-sm font-medium text-indigo-200 hover:bg-indigo-500/35"
        >
          Go to Sprint Planning
        </Link>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-[rgb(var(--zc-text))]">
          Sprint Board
        </h2>
        <p className="mt-1 text-sm text-[rgb(var(--zc-muted2))]">
          {activeProject.name} · Sprint #{activeSprint.sprint_number}
        </p>
      </div>
      {/* Burndown chart is rendered inside KanbanBoard directly under the sprint summary (same task state as the board). */}
      <KanbanBoard variant="sprint_board" />
    </section>
  )
}
