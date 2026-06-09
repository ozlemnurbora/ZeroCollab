import { useWorkspace } from '../../utils/WorkspaceContext.jsx'

/**
 * Shared "active project" pill shown immediately under a page title.
 * Solid indigo-600 + white text so it stays readable in light mode.
 */
export function ActiveProjectBadge({ className = '' }) {
  const { activeProject } = useWorkspace()
  if (!activeProject) return null
  return (
    <div className={`mt-2 inline-flex items-center gap-2 rounded-full bg-indigo-600 px-3 py-1 ${className}`}>
      <span className="h-2 w-2 rounded-full bg-white" />
      <span className="text-xs font-semibold text-white">{activeProject.name}</span>
    </div>
  )
}
