import { KanbanBoard } from '../components/kanban/KanbanBoard.jsx'

export function TasksPage() {
  return (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[rgb(var(--zc-text))] sm:text-3xl">
            Tasks
          </h1>
          <p className="mt-2 text-sm text-[rgb(var(--zc-muted))] sm:text-base">
            Plan, track, and move work across your team’s workflow.
          </p>
        </div>
      </div>

      <KanbanBoard />
    </section>
  )
}

