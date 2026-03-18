import { Modal } from '../ui/Modal.jsx'
import { Button } from '../ui/Button.jsx'
import { statusColorClasses } from './taskIndicators.js'

export function DayTasksModal({ open, onClose, isoDate, tasks, onAdd }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isoDate ? `Tasks on ${isoDate}` : 'Tasks'}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={onAdd}>Add task</Button>
        </div>
      }
    >
      {tasks?.length ? (
        <ul className="divide-y divide-[rgb(var(--zc-border))]">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[rgb(var(--zc-text))]">
                  {t.title}
                </p>
                <p className="mt-1 text-xs text-[rgb(var(--zc-muted2))]">
                  {t.assignee ? `Assignee: ${t.assignee}` : 'Unassigned'}
                </p>
              </div>
              <span className="flex items-center gap-2">
                <span
                  className={[
                    'h-2 w-2 rounded-full',
                    statusColorClasses(t.status),
                  ].join(' ')}
                  aria-hidden="true"
                />
                <span className="text-xs text-[rgb(var(--zc-muted))]">
                  {t.status === 'done'
                    ? 'Done'
                    : t.status === 'in_progress'
                      ? 'In Progress'
                      : 'To Do'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] p-4 text-sm text-[rgb(var(--zc-muted2))]">
          No tasks due on this day.
        </div>
      )}
    </Modal>
  )
}

