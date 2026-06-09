import { useEffect, useMemo, useRef, useState } from 'react'
import { AssigneeInputWithDatalist } from './AssigneeInputWithDatalist.jsx'
import { Button } from '../ui/Button.jsx'
import { Modal } from '../ui/Modal.jsx'
import { useLanguage } from '../../utils/LanguageContext.jsx'
import {
  STORY_POINT_SELECT_OPTIONS,
  normalizeStoryPointsValue,
} from './taskStorage.js'
import {
  INVEST_CHECKLIST_HELPER_TEXT,
  INVEST_CHECKLIST_LABELS,
  itemTypeRequiresInvestChecklist,
  normalizeDefinitionOfReady,
} from './definitionOfReady.js'

const initialForm = {
  title: '',
  description: '',
  assignee: '',
  priority: 'must',
  itemType: 'task',
  parentEpicId: '',
  parentFeatureId: '',
  parentStoryId: '',
  userStoryRole: '',
  userStoryCapability: '',
  userStoryBenefit: '',
  acceptanceCriteria: '',
  backlogState: 'new',
  definitionOfReady: normalizeDefinitionOfReady(null),
  storyPoints: 0,
  startDate: '',
  dueDate: '',
  calendarId: 'general',
  projectId: '',
  teamId: '',
}

function createTaskId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `task_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function createInitialForm(initialValues, activeProject, activeTeam) {
  const calId = initialValues?.calendarId || initialValues?.calendarType
  const calendarId = calId || initialForm.calendarId
  return {
    ...initialForm,
    ...(initialValues ?? {}),
    assignee: initialValues?.assignee ?? initialForm.assignee,
    calendarId,
    projectId: activeProject?.id || '',
    teamId: activeTeam?.id || '',
  }
}

export function AddTaskModal({
  open,
  onClose,
  onCreate,
  initialValues,
  forceItemType = null,
  customCalendars,
  activeProject,
  activeTeam,
  titleText,
  submitText,
}) {
  const { t } = useLanguage()
  const [form, setForm] = useState(() =>
    createInitialForm(initialValues, activeProject, activeTeam),
  )
  const [touched, setTouched] = useState(false)
  const [teamScopeError, setTeamScopeError] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const draftIdRef = useRef(createTaskId())

  useEffect(() => {
    if (!open) return
    draftIdRef.current = createTaskId()
  }, [open])

  useEffect(() => {
    if (!open) return
    setTeamScopeError('')
  }, [open])

  useEffect(() => {
    if (!open) return
    if (!forceItemType) return
    setForm((s) => ({ ...s, itemType: forceItemType }))
  }, [forceItemType, open])

  const errors = useMemo(() => {
    const next = {}
    if (!form.title.trim()) next.title = t('error_title_required')
    if (!form.assignee.trim()) next.assignee = t('error_assignee_required')
    if (form.itemType === 'user_story') {
      if (!form.userStoryRole.trim()) next.userStoryRole = 'Role is required.'
      if (!form.userStoryCapability.trim()) next.userStoryCapability = 'Capability is required.'
      if (!form.userStoryBenefit.trim()) next.userStoryBenefit = 'Benefit is required.'
    }
    return next
  }, [form, t])

  const canSubmit = Object.keys(errors).length === 0 && !teamScopeError

  const calendarOptions = useMemo(() => {
    const base = [
      { id: 'general', name: t('cal_calendar_general') },
      { id: 'personal', name: t('cal_calendar_personal') },
    ]
    const customs = Array.isArray(customCalendars)
      ? customCalendars.map((c) => ({ id: c.id, name: c.name }))
      : []
    return [...base, ...customs]
  }, [customCalendars, t])

  const handleAiFill = async () => {
    const title = form.title?.trim()
    if (!title) {
      setAiError('Please enter a title first.')
      return
    }
    setAiLoading(true)
    setAiError('')
    try {
      const itemType = forceItemType || form.itemType || 'task'
      const prompt = itemType === 'epic'
        ? `You are a senior product manager. Given this Epic title: "${title}", generate a JSON response with: {"description": "2-3 sentence description of this epic", "acceptanceCriteria": "3-4 high-level acceptance criteria as a numbered list", "storyPoints": suggested story points (number between 8-21), "priority": "must" or "should"}`
        : itemType === 'feature'
        ? `You are a senior product manager. Given this Feature title: "${title}", generate a JSON response with: {"description": "2-3 sentence description of this feature", "acceptanceCriteria": "3-4 acceptance criteria as a numbered list", "storyPoints": suggested story points (number between 5-13), "priority": "must" or "should"}`
        : itemType === 'user_story'
        ? `You are a senior product manager. Given this User Story title: "${title}", generate a JSON response with: {"description": "1-2 sentence description", "userStoryRole": "the role (e.g. team member, project manager, user)", "userStoryCapability": "what they want to do", "userStoryBenefit": "why they want it", "acceptanceCriteria": "3-5 specific acceptance criteria as a numbered list", "storyPoints": suggested story points (number between 1-8), "priority": "must" or "should"}`
        : `You are a senior software developer. Given this Task title: "${title}", generate a JSON response with: {"description": "1-2 sentence technical description of what needs to be done", "acceptanceCriteria": "2-3 specific done criteria as a numbered list", "storyPoints": suggested story points (number between 1-5), "priority": "must" or "should"}`

      const storedKey = localStorage.getItem('zc-anthropic-key') || ''
      if (!storedKey) {
        setAiError('No API key found. Please set your Anthropic API key in the Evaluation page first.')
        setAiLoading(false)
        return
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': storedKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt + '\n\nRespond with ONLY valid JSON, no markdown, no backticks, no explanation.' }],
        }),
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()
      const text = data.content?.[0]?.text || ''
      const clean = text.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)

      setForm((prev) => ({
        ...prev,
        description: parsed.description || prev.description,
        acceptanceCriteria: parsed.acceptanceCriteria || prev.acceptanceCriteria,
        storyPoints: parsed.storyPoints || prev.storyPoints,
        priority: parsed.priority || prev.priority,
        ...(parsed.userStoryRole ? { userStoryRole: parsed.userStoryRole } : {}),
        ...(parsed.userStoryCapability ? { userStoryCapability: parsed.userStoryCapability } : {}),
        ...(parsed.userStoryBenefit ? { userStoryBenefit: parsed.userStoryBenefit } : {}),
      }))
    } catch (err) {
      console.error('[AI Fill] Error:', err)
      setAiError('AI suggestion failed. Please fill manually.')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={titleText || t('modal_add_task')}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('btn_cancel')}
          </Button>
          <Button
            onClick={() => {
              setTouched(true)
              if (!canSubmit) return
              const effectiveItemType = forceItemType || form.itemType || 'task'
              const calendarId = form.calendarId || 'general'
              const calendarType = calendarId === 'general' ? 'general' : 'personal'
              const isGeneral = calendarType === 'general'
              if (isGeneral && activeTeam) {
                const memberCount = Array.isArray(activeTeam.members)
                  ? activeTeam.members.length
                  : 0
                if (memberCount < 3) {
                  setTeamScopeError(
                    'Team must have at least 3 members before creating team-scoped tasks.',
                  )
                  return
                }
              }
              onCreate?.({
                id: draftIdRef.current,
                title: form.title.trim(),
                description: form.description.trim(),
                assignee: form.assignee.trim(),
                priority: form.priority || 'must',
                itemType: effectiveItemType,
                type: effectiveItemType === 'task' ? 'Task' : undefined,
                parentEpicId: form.parentEpicId ? form.parentEpicId.trim() : null,
                parentFeatureId: form.parentFeatureId
                  ? form.parentFeatureId.trim()
                  : null,
                parentStoryId: form.parentStoryId ? form.parentStoryId.trim() : null,
                backlogState: 'new',
                definitionOfReady: normalizeDefinitionOfReady(form.definitionOfReady),
                storyPoints: normalizeStoryPointsValue(form.storyPoints),
                acceptanceCriteria: form.acceptanceCriteria.trim(),
                userStoryRole: form.userStoryRole.trim(),
                userStoryCapability: form.userStoryCapability.trim(),
                userStoryBenefit: form.userStoryBenefit.trim(),
                userStoryText:
                  effectiveItemType === 'user_story'
                    ? `As a ${form.userStoryRole.trim()}, I want ${form.userStoryCapability.trim()}, so that ${form.userStoryBenefit.trim()}.`
                    : '',
                startDate: form.startDate || '',
                dueDate: form.dueDate || '',
                calendarType,
                calendarId,
                projectId: activeProject?.id ?? null,
                teamId: isGeneral ? form.teamId || activeTeam?.id || null : null,
              })
              onClose?.()
            }}
          >
            {submitText || t('btn_create_task')}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        {teamScopeError ? (
          <p className="text-xs text-rose-300">{teamScopeError}</p>
        ) : null}
        {activeProject && (
          <div className="flex items-center gap-2 rounded-lg bg-[rgb(var(--zc-border)/0.3)] px-3 py-2 text-xs">
            <span className={`h-2 w-2 rounded-full ${activeProject.color}`} />
            <span className="text-[rgb(var(--zc-muted))]">Project: </span>
            <span className="text-[rgb(var(--zc-text))] font-medium">{activeProject.name}</span>
            {activeTeam && (
              <>
                <span className="text-[rgb(var(--zc-subtle))]">·</span>
                <span className={`h-2 w-2 rounded-full ${activeTeam.color}`} />
                <span className="text-[rgb(var(--zc-text))] font-medium">{activeTeam.name}</span>
              </>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
            Item Type
          </label>
          {forceItemType ? (
            <select
              className="mt-1 w-full cursor-not-allowed rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] opacity-80 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              value={forceItemType}
              disabled
              aria-label="Item type (locked)"
            >
              <option value="task">Task</option>
            </select>
          ) : (
            <select
              className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              value={form.itemType || 'task'}
              onChange={(e) =>
                setForm((s) => ({
                  ...s,
                  itemType: e.target.value,
                  definitionOfReady: normalizeDefinitionOfReady(s.definitionOfReady),
                }))
              }
            >
              <option value="epic">Epic</option>
              <option value="feature">Feature</option>
              <option value="user_story">User Story</option>
              <option value="task">Task</option>
            </select>
          )}
        </div>

        {form.itemType === 'user_story' && !forceItemType ? (
          <div className="grid gap-4">
            <div>
              <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
                As a [role]
              </label>
              <input
                className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                value={form.userStoryRole}
                onChange={(e) =>
                  setForm((s) => ({ ...s, userStoryRole: e.target.value }))
                }
                onBlur={() => setTouched(true)}
              />
              {touched && errors.userStoryRole ? (
                <p className="mt-1 text-xs text-rose-300">{errors.userStoryRole}</p>
              ) : null}
            </div>
            <div>
              <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
                I want [capability]
              </label>
              <input
                className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                value={form.userStoryCapability}
                onChange={(e) =>
                  setForm((s) => ({ ...s, userStoryCapability: e.target.value }))
                }
                onBlur={() => setTouched(true)}
              />
              {touched && errors.userStoryCapability ? (
                <p className="mt-1 text-xs text-rose-300">{errors.userStoryCapability}</p>
              ) : null}
            </div>
            <div>
              <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
                So that [benefit]
              </label>
              <input
                className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                value={form.userStoryBenefit}
                onChange={(e) =>
                  setForm((s) => ({ ...s, userStoryBenefit: e.target.value }))
                }
                onBlur={() => setTouched(true)}
              />
              {touched && errors.userStoryBenefit ? (
                <p className="mt-1 text-xs text-rose-300">{errors.userStoryBenefit}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {(() => {
          const effectiveItemType = forceItemType || form.itemType || 'task'
          if (effectiveItemType === 'feature') {
            return (
              <div>
                <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
                  Parent Epic ID (optional)
                </label>
                <input
                  className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  placeholder="epic_..."
                  value={form.parentEpicId}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, parentEpicId: e.target.value }))
                  }
                />
              </div>
            )
          }
          if (effectiveItemType === 'user_story') {
            return (
              <div>
                <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
                  Parent Feature ID (optional)
                </label>
                <input
                  className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  placeholder="feature_..."
                  value={form.parentFeatureId}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, parentFeatureId: e.target.value }))
                  }
                />
              </div>
            )
          }
          if (effectiveItemType === 'task') {
            return (
              <div>
                <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
                  Parent User Story ID (optional)
                </label>
                <input
                  className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  placeholder="story_..."
                  value={form.parentStoryId}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, parentStoryId: e.target.value }))
                  }
                />
              </div>
            )
          }
          return null
        })()}

        <div>
          <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
            {t('label_title')}
          </label>
          <input
            className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            placeholder={t('placeholder_task_title')}
            value={form.title}
            onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
            onBlur={() => setTouched(true)}
          />
          {touched && errors.title ? (
            <p className="mt-1 text-xs text-rose-300">{errors.title}</p>
          ) : null}
        </div>

        {/* AI Auto-Fill Button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAiFill}
            disabled={aiLoading || !form.title?.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-md shadow-purple-500/20 hover:from-purple-600 hover:to-indigo-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {aiLoading ? (
              <>
                <span className="animate-spin text-sm">⏳</span>
                AI is thinking...
              </>
            ) : (
              <>
                <span className="text-sm">🤖</span>
                AI Auto-Fill
              </>
            )}
          </button>
          <span className="text-[10px] text-[rgb(var(--zc-subtle))]">
            Enter a title, then click to auto-fill details
          </span>
          {aiError && <span className="text-[10px] text-rose-400">{aiError}</span>}
        </div>

        <div>
          <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
            Priority
          </label>
          <select
            className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            value={form.priority || 'must'}
            onChange={(e) => setForm((s) => ({ ...s, priority: e.target.value }))}
          >
            <option value="must">Must-have</option>
            <option value="should">Should-have</option>
            <option value="could">Could-have</option>
            <option value="wont">Won’t-have</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
            Story Points
          </label>
          <select
            className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            value={normalizeStoryPointsValue(form.storyPoints)}
            onChange={(e) =>
              setForm((s) => ({ ...s, storyPoints: Number(e.target.value) }))
            }
          >
            {STORY_POINT_SELECT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
            {t('label_calendar')}
          </label>
          <select
            className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            value={form.calendarId || 'general'}
            onChange={(e) => setForm((s) => ({ ...s, calendarId: e.target.value }))}
          >
            {calendarOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
            {t('label_description')}
          </label>
          <textarea
            className="mt-1 min-h-[96px] w-full resize-y rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            placeholder={t('placeholder_task_desc')}
            value={form.description}
            onChange={(e) =>
              setForm((s) => ({ ...s, description: e.target.value }))
            }
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
            Acceptance Criteria
          </label>
          <textarea
            className="mt-1 min-h-[96px] w-full resize-y rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            placeholder={'- Criterion 1\n- Criterion 2\n- Criterion 3'}
            value={form.acceptanceCriteria}
            onChange={(e) =>
              setForm((s) => ({ ...s, acceptanceCriteria: e.target.value }))
            }
          />
        </div>

        {itemTypeRequiresInvestChecklist(form.itemType) ? (
          <details
            className="rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.25)] px-3 py-2"
            open
          >
            <summary className="cursor-pointer text-sm font-medium text-[rgb(var(--zc-text))]">
              Definition of Ready Checklist
            </summary>
            <p className="mt-2 text-xs text-[rgb(var(--zc-subtle))]">
              {INVEST_CHECKLIST_HELPER_TEXT}
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {INVEST_CHECKLIST_LABELS.map(({ key, label }) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2 text-sm text-[rgb(var(--zc-text))]"
                >
                  <input
                    type="checkbox"
                    checked={!!form.definitionOfReady?.[key]}
                    onChange={(e) =>
                      setForm((s) => ({
                        ...s,
                        definitionOfReady: {
                          ...normalizeDefinitionOfReady(s.definitionOfReady),
                          [key]: e.target.checked,
                        },
                      }))
                    }
                    className="rounded border-[rgb(var(--zc-border))]"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </details>
        ) : null}

        <div>
          <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
            {t('label_assignee')}
          </label>
          <AssigneeInputWithDatalist
            projectMembers={activeProject?.projectMembers ?? []}
            value={form.assignee}
            onChange={(e) => setForm((s) => ({ ...s, assignee: e.target.value }))}
            onBlur={() => setTouched(true)}
            placeholder="Type name or pick a project member…"
            className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
          {activeProject?.projectMembers?.length ? (
            <p className="mt-1 text-[11px] text-[rgb(var(--zc-subtle))]">
              Suggestions from {activeProject.name}. You can still enter any name.
            </p>
          ) : null}
          {touched && errors.assignee ? (
            <p className="mt-1 text-xs text-rose-300">{errors.assignee}</p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
              {t('task_start_date')}
            </label>
            <input
              type="date"
              className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              value={form.startDate}
              onChange={(e) =>
                setForm((s) => ({ ...s, startDate: e.target.value }))
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
              {t('label_due_date')}
            </label>
            <input
              type="date"
              className="mt-1 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              value={form.dueDate}
              onChange={(e) => setForm((s) => ({ ...s, dueDate: e.target.value }))}
            />
            <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
              {t('add_task_due_hint')}
            </p>
          </div>
        </div>
      </div>
    </Modal>
  )
}
