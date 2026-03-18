const SETTINGS_KEY = 'zerocollab.settings.v1'

export function initTheme() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    const theme = parsed?.app?.theme
    if (theme === 'light') document.body.dataset.theme = 'light'
    else document.body.dataset.theme = 'dark'
  } catch {
    // ignore
  }
}

