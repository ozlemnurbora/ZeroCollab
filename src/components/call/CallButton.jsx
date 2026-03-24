import { useLanguage } from '../../utils/LanguageContext.jsx'

export function CallButton({ onClick, disabled = false }) {
  const { t } = useLanguage()
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-9 rounded-md bg-emerald-500/90 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/40"
    >
      {t('btn_call')}
    </button>
  )
}
