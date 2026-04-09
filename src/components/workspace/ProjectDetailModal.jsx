import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal.jsx'
import { Button } from '../ui/Button.jsx'

export function ProjectDetailModal({
  open,
  onClose,
  project,
  teams,
  onUpdate,
  onDelete,
}) {
  const [name, setName] = useState(project?.name || '')
  const [description, setDescription] = useState(project?.description || '')
  const [selectedTeamIds, setSelectedTeamIds] = useState(
    project?.teamIds || [],
  )
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    if (!project) return
    setName(project.name || '')
    setDescription(project.description || '')
    setSelectedTeamIds(project.teamIds || [])
  }, [project])

  useEffect(() => {
    if (!open) setIsEditing(false)
  }, [open])

  if (!project) return null

  const toggleTeam = (teamId) => {
    setSelectedTeamIds((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId],
    )
  }

  const handleSave = () => {
    onUpdate?.({ ...project, name, description, teamIds: selectedTeamIds })
    setIsEditing(false)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit Project' : project.name}
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="danger"
            onClick={() => {
              onDelete?.(project.id)
              onClose?.()
            }}
          >
            Delete Project
          </Button>
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setName(project.name || '')
                    setDescription(project.description || '')
                    setSelectedTeamIds(project.teamIds || [])
                    setIsEditing(false)
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleSave}>Save</Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={onClose}>
                  Close
                </Button>
                <Button onClick={() => setIsEditing(true)}>Edit</Button>
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {isEditing ? (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-[rgb(var(--zc-muted))]">
                Project Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[rgb(var(--zc-muted))]">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[rgb(var(--zc-muted))]">
                Assign Teams
              </label>
              <div className="space-y-1">
                {teams?.length === 0 && (
                  <p className="text-xs text-[rgb(var(--zc-subtle))]">
                    No teams created yet.
                  </p>
                )}
                {teams?.map((team) => (
                  <label
                    key={team.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-[rgb(var(--zc-border)/0.3)]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTeamIds.includes(team.id)}
                      onChange={() => toggleTeam(team.id)}
                      className="rounded"
                    />
                    <span className={`h-2 w-2 rounded-full ${team.color}`} />
                    <span className="text-sm text-[rgb(var(--zc-text))]">
                      {team.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            {project.description ? (
              <p className="text-sm text-[rgb(var(--zc-muted))]">
                {project.description}
              </p>
            ) : null}
            <div>
              <p className="mb-2 text-sm font-medium text-[rgb(var(--zc-muted))]">
                Assigned Teams
              </p>
              {selectedTeamIds.length === 0 ? (
                <p className="text-xs text-[rgb(var(--zc-subtle))]">
                  No teams assigned. Click Edit to assign teams.
                </p>
              ) : (
                <div className="space-y-1">
                  {teams
                    ?.filter((t) => selectedTeamIds.includes(t.id))
                    .map((team) => (
                      <div
                        key={team.id}
                        className="flex items-center gap-2 rounded-lg bg-[rgb(var(--zc-border)/0.3)] px-2 py-2"
                      >
                        <span className={`h-2 w-2 rounded-full ${team.color}`} />
                        <span className="text-sm text-[rgb(var(--zc-text))]">
                          {team.name}
                        </span>
                        <span className="ml-auto text-xs text-[rgb(var(--zc-subtle))]">
                          {team.members?.length || 0} members
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
