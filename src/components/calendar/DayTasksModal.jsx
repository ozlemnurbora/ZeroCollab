import { Modal } from '../ui/Modal.jsx'
import { Button } from '../ui/Button.jsx'
import { statusColorClasses } from './taskIndicators.js'
import { useLanguage } from '../../utils/LanguageContext.jsx'

export function DayTasksModal({ open, onClose, isoDate, tasks, onAdd }) {
  const { t } = useLanguage()
  const title = isoDate
    ? t('day_modal_title', { date: isoDate })
    : t('modal_add_task')

  const statusLabel = (status) => {
    if (status === 'done') return t('status_done')
    if (status === 'in_progress') return t('status_in_progress')
    return t('status_todo')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('btn_close')}
          </Button>
          <Button onClick={onAdd}>{t('btn_add_task')}</Button>
        </div>
      }
    >
      {tasks?.length ? (
        <ul className="divide-y divide-[rgb(var(--zc-border))]">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[rgb(var(--zc-text))]">
                  {task.title}
                </p>
                <p className="mt-1 text-xs text-[rgb(var(--zc-muted2))]">
                  {task.assignee
                    ? `${t('task_assignee')}: ${task.assignee}`
                    : t('dash_unassigned')}
                </p>
              </div>
              <span className="flex items-center gap-2">
                <span
                  className={[
                    'h-2 w-2 rounded-full',
                    statusColorClasses(task.status),
                  ].join(' ')}
                  aria-hidden="true"
                />
                <span className="text-xs text-[rgb(var(--zc-muted))]">
                  {statusLabel(task.status)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] p-4 text-sm text-[rgb(var(--zc-muted2))]">
          {t('day_modal_empty')}
        </div>
      )}
    </Modal>
  )
}
