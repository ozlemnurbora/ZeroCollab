import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/tasks', label: 'Tasks' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/chat', label: 'Chat' },
  { to: '/evaluation', label: 'Evaluation' },
  { to: '/settings', label: 'Settings' },
]

export function SidebarLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const linkBaseClasses =
    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors'

  const getLinkClasses = ({ isActive }) => {
    const activeClasses = 'bg-slate-800 text-white'
    const inactiveClasses =
      'text-slate-300 hover:bg-slate-800/70 hover:text-white'
    return `${linkBaseClasses} ${isActive ? activeClasses : inactiveClasses}`
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 border-r border-slate-800 p-4 flex flex-col transform transition-transform duration-200 md:static md:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:w-64`}
      >
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-500 flex items-center justify-center text-xs font-bold">
              ZC
            </div>
            <span className="text-lg font-semibold tracking-tight">
              ZeroCollab
            </span>
          </div>
          <button
            type="button"
            className="md:hidden rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            onClick={() => setIsSidebarOpen(false)}
          >
            <span className="sr-only">Close sidebar</span>
            ✕
          </button>
        </div>

        <nav className="space-y-1 flex-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={getLinkClasses}
              onClick={() => setIsSidebarOpen(false)}
            >
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-6 pt-4 border-t border-slate-800 text-xs text-slate-500">
          <p>P2P Project Management &amp; Assessment</p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col md:ml-64">
        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-indigo-500 flex items-center justify-center text-[10px] font-bold">
              ZC
            </div>
            <span className="text-base font-semibold tracking-tight">
              ZeroCollab
            </span>
          </div>
          <button
            type="button"
            className="rounded-md p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
            onClick={() => setIsSidebarOpen((open) => !open)}
          >
            <span className="sr-only">Toggle sidebar</span>
            ☰
          </button>
        </header>

        <main className="flex-1 px-4 py-4 md:px-6 md:py-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

