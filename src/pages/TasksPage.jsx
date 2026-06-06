import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KanbanBoard } from '../components/kanban/KanbanBoard.jsx'
import { AddMeetingModal } from '../components/meetings/AddMeetingModal.jsx'
import { MeetingDetailModal } from '../components/meetings/MeetingDetailModal.jsx'
import { Button } from '../components/ui/Button.jsx'
import { useLanguage } from '../utils/LanguageContext.jsx'
import { useWorkspace } from '../utils/WorkspaceContext.jsx'
import { useAuth } from '../utils/AuthContext.jsx'
import {
  deleteMeeting,
  loadMeetings,
  saveMeeting,
} from '../utils/meetingStorage.js'
import { broadcastMeetingUpdate } from '../utils/hubManager.js'

function meetingStorageProjectId(_meeting, activeProject) {
  return activeProject?.id ?? null
}

export function TasksPage() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const { user } = useAuth()
  const ownerUserId = user?.id ?? null
  const { activeProject, memberProjectIds = [] } = useWorkspace()
  const [meetings, setMeetings] = useState([])
  const [isAddMeetingOpen, setIsAddMeetingOpen] = useState(false)
  const [selectedMeeting, setSelectedMeeting] = useState(null)

  useEffect(() => {
    if (!ownerUserId) {
      setMeetings([])
      return
    }
    loadMeetings(ownerUserId).then((data) => {
      console.log('[Meeting] loaded from DB:', data)
      const list = Array.isArray(data) ? data : []
      const visible = list.filter((meeting) => {
        if (!meeting?.projectId || !memberProjectIds.includes(meeting.projectId)) return false
        if (meeting.calendarType === 'general') return true
        return meeting.ownerUserId === ownerUserId
      })
      setMeetings(visible)
    })
  }, [memberProjectIds, ownerUserId])

  useEffect(() => {
    const handleMeetingUpdate = async (e) => {
      const { meeting, meetingId, meetingAction, projectId } = e.detail || {}
      console.log('[TasksPage] hub:meeting-update received:', meetingAction, meeting?.id)
      if (meetingAction === 'upsert' && meeting) {
        if (meeting.calendarType === 'general') {
          if (projectId && !memberProjectIds.includes(projectId)) return
          if (activeProject?.id && projectId && projectId !== activeProject.id) return
          if (!meeting.projectId || !memberProjectIds.includes(meeting.projectId)) return
        } else {
          if (!ownerUserId || meeting.ownerUserId !== ownerUserId) return
          if (!meeting.projectId || !memberProjectIds.includes(meeting.projectId)) return
        }
        if (ownerUserId) await saveMeeting(meeting, ownerUserId)
        setMeetings((prev) => {
          const exists = prev.find((m) => m.id === meeting.id)
          if (exists) return prev.map((m) => (m.id === meeting.id ? meeting : m))
          return [...prev, meeting]
        })
      } else if (meetingAction === 'delete' && meetingId) {
        if (projectId && !memberProjectIds.includes(projectId)) return
        if (activeProject?.id && projectId && projectId !== activeProject.id) return
        if (ownerUserId) await deleteMeeting(meetingId, ownerUserId)
        setMeetings((prev) => prev.filter((m) => m.id !== meetingId))
      }
    }
    window.addEventListener('hub:meeting-update', handleMeetingUpdate)
    return () => window.removeEventListener('hub:meeting-update', handleMeetingUpdate)
  }, [activeProject?.id, memberProjectIds, ownerUserId])

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

      <KanbanBoard
        // Tasks page intentionally creates only Task items as part of Agile hierarchy separation.
        createOnlyTask
        headerActions={
          <Button variant="secondary" onClick={() => setIsAddMeetingOpen(true)}>
            📅 {t('tasks_schedule_meeting')}
          </Button>
        }
      />

      <div className="mt-8">
        <h2 className="mb-3 text-base font-semibold text-[rgb(var(--zc-text))]">
          📅 {t('tasks_scheduled_meetings')}
        </h2>
        {meetings.length === 0 ? (
          <p className="text-sm text-[rgb(var(--zc-muted2))]">{t('tasks_no_meetings')}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {meetings
              .filter((meeting) => {
                if (meeting.calendarType === 'general') {
                  if (!meeting.projectId || !memberProjectIds.includes(meeting.projectId))
                    return false
                  if (activeProject?.id && meeting.projectId !== activeProject.id) return false
                  return true
                }
                if (meeting.ownerUserId !== ownerUserId) return false
                if (activeProject?.id && meeting.projectId !== activeProject.id) return false
                return true
              })
              .map((meeting) => (
                <div
                  key={meeting.id}
                  className="group cursor-pointer rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 transition hover:border-violet-500/60 hover:bg-violet-500/10"
                  onClick={() => navigate(`/meetings/${meeting.id}`)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-violet-300">
                        📅 {meeting.title}
                      </p>
                      <p className="mt-1 text-xs text-[rgb(var(--zc-muted))]">
                        {meeting.date} {t('tasks_at')} {meeting.time}
                      </p>
                      <p className="text-xs text-[rgb(var(--zc-muted2))]">
                        {meeting.duration} {t('tasks_min')}
                        {meeting.recurring !== 'none' &&
                          ` • ${t('tasks_repeats', { freq: t(`tasks_freq_${meeting.recurring}`) })}`}
                      </p>
                      {meeting.description && (
                        <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                          {meeting.description}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation()
                        if (ownerUserId) await deleteMeeting(meeting.id, ownerUserId)
                        setMeetings((prev) =>
                          prev.filter((entry) => entry.id !== meeting.id),
                        )
                        if (
                          meeting.calendarType === 'general' &&
                          meeting.projectId &&
                          activeProject?.id
                        ) {
                          void broadcastMeetingUpdate(
                            { id: meeting.id },
                            'delete',
                            meeting.projectId,
                          )
                        }
                      }}
                      className="shrink-0 text-xs text-rose-400 opacity-0 group-hover:opacity-100 hover:text-rose-300"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/meetings/${meeting.id}`)
                      }}
                      className="rounded-md bg-violet-500 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-violet-400"
                    >
                      {t('tasks_join_meeting')}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedMeeting(meeting)
                      }}
                      className="rounded-md border border-[rgb(var(--zc-border))] px-2.5 py-1 text-[11px] text-[rgb(var(--zc-muted2))] hover:bg-[rgb(var(--zc-border)/0.4)]"
                    >
                      {t('tasks_details')}
                    </button>
                  </div>
                  <div className="mt-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] ${
                        meeting.calendarType === 'general'
                          ? 'bg-indigo-500/15 text-indigo-300'
                          : 'bg-emerald-500/15 text-emerald-300'
                      }`}
                    >
                      {meeting.calendarType}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      <AddMeetingModal
        open={isAddMeetingOpen}
        onClose={() => setIsAddMeetingOpen(false)}
        existingMeetings={meetings}
        onCreate={async (meeting) => {
          console.log('[Meeting] creating meeting:', meeting)
          const newMeeting = {
            ...meeting,
            projectId: meetingStorageProjectId(meeting, activeProject),
            ownerUserId: ownerUserId ?? meeting.ownerUserId ?? null,
          }
          console.log('[Meeting] saving:', newMeeting)
          if (ownerUserId) await saveMeeting(newMeeting, ownerUserId)
          console.log('[Meeting] saved, updating state')
          setMeetings((prev) => {
            console.log('[Meeting] prev meetings:', prev)
            return [...prev, newMeeting]
          })
          if (
            newMeeting.calendarType === 'general' &&
            newMeeting.projectId &&
            activeProject?.id
          ) {
            void broadcastMeetingUpdate(newMeeting, 'upsert', newMeeting.projectId)
          }
        }}
      />

      <MeetingDetailModal
        open={!!selectedMeeting}
        onClose={() => setSelectedMeeting(null)}
        meeting={selectedMeeting}
        onUpdate={async (updated) => {
          const normalized = {
            ...updated,
            projectId: meetingStorageProjectId(updated, activeProject),
          }
          if (ownerUserId) await saveMeeting(normalized, ownerUserId)
          setMeetings((prev) => prev.map((m) => (m.id === normalized.id ? normalized : m)))
          setSelectedMeeting(null)
          if (
            normalized.calendarType === 'general' &&
            normalized.projectId &&
            activeProject?.id
          ) {
            void broadcastMeetingUpdate(normalized, 'upsert', normalized.projectId)
          }
        }}
        onDelete={async (id) => {
          const prevMeeting = selectedMeeting
          if (ownerUserId) await deleteMeeting(id, ownerUserId)
          setMeetings((prev) => prev.filter((m) => m.id !== id))
          setSelectedMeeting(null)
          if (
            prevMeeting?.calendarType === 'general' &&
            prevMeeting?.projectId &&
            activeProject?.id
          ) {
            void broadcastMeetingUpdate({ id }, 'delete', prevMeeting.projectId)
          }
        }}
      />
    </section>
  )
}
