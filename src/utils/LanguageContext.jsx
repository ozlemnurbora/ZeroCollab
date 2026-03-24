import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { loadSettings, saveSettings } from '../components/settings/settingsStorage.js'
import { interpolate, TRANSLATIONS } from './translations.js'

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState('en')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadSettings().then((s) => {
      if (cancelled) return
      const lang = s?.app?.language === 'tr' ? 'tr' : 'en'
      setLanguageState(lang)
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onIdb = (e) => {
      if (e?.detail?.store !== 'settings') return
      void loadSettings().then((s) => {
        const lang = s?.app?.language === 'tr' ? 'tr' : 'en'
        setLanguageState(lang)
      })
    }
    window.addEventListener('zerocollab:idb', onIdb)
    return () => window.removeEventListener('zerocollab:idb', onIdb)
  }, [])

  const setLanguage = useCallback(async (next) => {
    const lang = next === 'tr' ? 'tr' : 'en'
    setLanguageState(lang)
    const prev = await loadSettings()
    const base = prev && typeof prev === 'object' ? prev : {}
    await saveSettings({
      ...base,
      app: {
        ...(base.app ?? {}),
        language: lang,
      },
    })
  }, [])

  const t = useCallback(
    (key, vars) => {
      const raw = TRANSLATIONS[language]?.[key] ?? TRANSLATIONS.en[key] ?? key
      return vars ? interpolate(raw, vars) : raw
    },
    [language],
  )

  const locale = language === 'tr' ? 'tr-TR' : 'en-US'

  const value = useMemo(
    () => ({ language, locale, setLanguage, t, ready }),
    [language, locale, setLanguage, t, ready],
  )

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }
  return ctx
}
