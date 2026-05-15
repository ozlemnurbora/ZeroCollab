import { Link } from 'react-router-dom'
import { KanbanBoard } from '../components/kanban/KanbanBoard.jsx'
import { useWorkspace } from '../utils/WorkspaceContext.jsx'

export function SprintBoardPage() {
  const { activeProject, activeSprint } = useWorkspace()

  if (!activeProject) {
    return (
      <section>
        <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">
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
          <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">
            Sprint Board
          </h2>
          <p className="text-sm text-[rgb(var(--zc-text))]">No active sprint.</p>
          <p className="text-sm text-[rgb(var(--zc-muted2))]">
            Create a sprint from Sprint Planning.
          </p>
        </div>
        <Link
          to="/sprint-planning"
          className="rounded-md bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-600 hover:to-purple-700 transition"
        >
          Go to Sprint Planning
        </Link>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">📌 Sprint Board</span>
        </h2>
        <p className="mt-1 text-sm text-[rgb(var(--zc-muted2))]">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            {activeProject.name} · Sprint #{activeSprint.sprint_number}
          </span>
        </p>
      </div>
      {/* Burndown chart is rendered inside KanbanBoard directly under the sprint summary (same task state as the board). */}
      <KanbanBoard variant="sprint_board" />
    </section>
  )
}
