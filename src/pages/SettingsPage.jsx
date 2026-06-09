import { SettingsShell } from '../components/settings/SettingsShell.jsx'
import { useLanguage } from '../utils/LanguageContext.jsx'

export function SettingsPage() {
  const { t } = useLanguage()
  return (
    <section>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-500 via-indigo-500 to-violet-600">⚙️ {t('page_settings_title')}</span>
      </h1>
      <p className="mt-2 text-sm text-[rgb(var(--zc-muted))] sm:text-base">
        {t('page_settings_subtitle')}
      </p>

      <SettingsShell />
    </section>
  )
}
