import { useEffect, useMemo, useState } from 'react'

export function usePwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    const checkInstalled = () => {
      const standalone =
        window.matchMedia?.('(display-mode: standalone)')?.matches || false
      const iosStandalone = window.navigator?.standalone === true
      setIsInstalled(Boolean(standalone || iosStandalone))
    }

    checkInstalled()
    window.addEventListener('appinstalled', checkInstalled)
    return () => window.removeEventListener('appinstalled', checkInstalled)
  }, [])

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      // eslint-disable-next-line no-console
      console.log('PWA: install prompt available')
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const canInstall = useMemo(() => {
    return Boolean(deferredPrompt) && !isInstalled
  }, [deferredPrompt, isInstalled])

  const promptInstall = async () => {
    if (!deferredPrompt) return { outcome: 'dismissed' }
    // eslint-disable-next-line no-console
    console.log('PWA: prompting install')
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    // eslint-disable-next-line no-console
    console.log('PWA: install choice', choice)
    setDeferredPrompt(null)
    return choice
  }

  return {
    canInstall,
    isInstalled,
    promptInstall,
  }
}

