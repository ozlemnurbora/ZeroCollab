import { useLanguage } from '../../utils/LanguageContext.jsx'

export function CallButton({ onClick, disabled = false }) {
  const { t } = useLanguage()
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? t('btn_call_offline_tooltip') : t('btn_call_tooltip')}
      className="h-9 rounded-md px-3 text-xs font-medium text-white shadow-sm transition-colors bg-emerald-600 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:text-white dark:bg-emerald-500/90 dark:hover:bg-emerald-400 dark:disabled:bg-emerald-500/40 dark:disabled:text-white"
    >
      {t('btn_call')}
    </button>
  )
}
