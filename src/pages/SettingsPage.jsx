import { SettingsShell } from '../components/settings/SettingsShell.jsx'

export function SettingsPage() {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight text-[rgb(var(--zc-text))] sm:text-3xl">
        Settings
      </h1>
      <p className="mt-2 text-sm text-[rgb(var(--zc-muted))] sm:text-base">
        Manage your profile, app preferences, and local data.
      </p>

      <SettingsShell />
    </section>
  )
}

