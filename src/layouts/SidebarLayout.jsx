import { useMemo, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { OfflineBanner } from '../components/pwa/OfflineBanner.jsx'
import { useLanguage } from '../utils/LanguageContext.jsx'

export function SidebarLayout() {
  const { t } = useLanguage()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const navItems = useMemo(
    () => [
      { to: '/', label: t('nav_dashboard'), end: true },
      { to: '/tasks', label: t('nav_tasks') },
      { to: '/calendar', label: t('nav_calendar') },
      { to: '/chat', label: t('nav_chat') },
      { to: '/evaluation', label: t('nav_evaluation') },
      { to: '/settings', label: t('nav_settings') },
    ],
    [t],
  )

  const linkBaseClasses =
    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors'

  const getLinkClasses = ({ isActive }) => {
    const activeClasses =
      'bg-[rgb(var(--zc-border))] text-[rgb(var(--zc-text))]'
    const inactiveClasses =
      'text-[rgb(var(--zc-muted))] hover:bg-[rgb(var(--zc-border)/0.7)] hover:text-[rgb(var(--zc-text))]'
    return `${linkBaseClasses} ${isActive ? activeClasses : inactiveClasses}`
  }

  return (
    <div className="min-h-screen bg-[rgb(var(--zc-bg))] text-[rgb(var(--zc-text))] flex">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[rgb(var(--zc-panel))] border-r border-[rgb(var(--zc-border))] p-4 flex flex-col transform transition-transform duration-200 md:relative md:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:w-64`}
      >
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-500 flex items-center justify-center text-xs font-bold">
              ZC
            </div>
            <span className="text-lg font-semibold tracking-tight">ZeroCollab</span>
          </div>
          <button
            type="button"
            className="md:hidden rounded-md p-1 text-[rgb(var(--zc-muted2))] hover:bg-[rgb(var(--zc-border))] hover:text-[rgb(var(--zc-text))]"
            onClick={() => setIsSidebarOpen(false)}
          >
            <span className="sr-only">{t('sidebar_close')}</span>✕
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

        <div className="mt-6 pt-4 border-t border-[rgb(var(--zc-border))] text-xs text-[rgb(var(--zc-subtle))]">
          <p>{t('brand_tagline')}</p>
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        <OfflineBanner />
        <header className="flex items-center justify-between border-b border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.8)] px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-indigo-500 flex items-center justify-center text-[10px] font-bold">
              ZC
            </div>
            <span className="text-base font-semibold tracking-tight">ZeroCollab</span>
          </div>
          <button
            type="button"
            className="rounded-md p-1.5 text-[rgb(var(--zc-muted))] hover:bg-[rgb(var(--zc-border))] hover:text-[rgb(var(--zc-text))]"
            onClick={() => setIsSidebarOpen((open) => !open)}
          >
            <span className="sr-only">{t('sidebar_toggle')}</span>☰
          </button>
        </header>

        <main className="flex-1 px-4 py-4 md:px-6 md:py-6">
          <div className="w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
