import { useEffect, useMemo, useState } from 'react'
import { Button } from '../ui/Button.jsx'
import { SectionCard } from './SectionCard.jsx'
import { Toggle } from './Toggle.jsx'
import { DataManagement } from './DataManagement.jsx'
import { APP_VERSION } from './settingsConstants.js'
import { getOrCreatePeerId, loadSettings, saveSettings } from './settingsStorage.js'
import { usePwaInstallPrompt } from '../../utils/pwaInstall.js'
import { useAuth } from '../../utils/AuthContext.jsx'
import { useLanguage } from '../../utils/LanguageContext.jsx'
import { requestNotificationPermission } from '../../utils/taskReminder.js'
import {
  P2P_EVENTS,
  P2P_STATUS,
  connectToPeer,
  getConnectedPeers,
  getPeerId,
  getStatus,
  initP2P,
  on as onP2PEvent,
} from '../../utils/p2pManager.js'

const defaultSettings = {
  profile: {
    currentUser: '',
    displayName: '',
  },
  app: {
    theme: 'dark',
    language: 'en',
    notifications: {
      taskUpdates: true,
      chatMessages: true,
      calendarReminders: true,
    },
  },
}

function mergeDefaults(saved) {
  const s = saved && typeof saved === 'object' ? saved : {}
  return {
    profile: { ...defaultSettings.profile, ...(s.profile ?? {}) },
    app: {
      ...defaultSettings.app,
      ...(s.app ?? {}),
      notifications: {
        ...defaultSettings.app.notifications,
        ...(s.app?.notifications ?? {}),
      },
    },
  }
}

function applyTheme(theme) {
  try {
    document.body.dataset.theme = theme === 'light' ? 'light' : 'dark'
  } catch {
    // ignore
  }
}

export function SettingsShell() {
  const { user } = useAuth()
  const { language, setLanguage, t } = useLanguage()
  const [settings, setSettings] = useState(() => mergeDefaults(null))
  const [settingsHydrated, setSettingsHydrated] = useState(false)
  const [peerId, setPeerId] = useState('')
  const [connectPeer, setConnectPeer] = useState('')
  const [p2pStatus, setP2pStatus] = useState(P2P_STATUS.OFFLINE)
  const [connectedPeers, setConnectedPeers] = useState([])
  const { canInstall, isInstalled, promptInstall } = usePwaInstallPrompt()
  const [browserNotifPermission, setBrowserNotifPermission] = useState(
    () =>
      typeof window !== 'undefined' && 'Notification' in window
        ? Notification.permission
        : 'unsupported',
  )

  const refreshBrowserNotifPermission = () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setBrowserNotifPermission('unsupported')
      return
    }
    setBrowserNotifPermission(Notification.permission)
  }

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setBrowserNotifPermission('unsupported')
      return
    }
    setBrowserNotifPermission(Notification.permission)
  }, [])

  useEffect(() => {
    if (!settingsHydrated) return
    void saveSettings({
      ...settings,
      app: { ...settings.app, language },
    })
    applyTheme(settings.app.theme)
  }, [settings, language, settingsHydrated])

  useEffect(() => {
    let cancelled = false
    void loadSettings().then((saved) => {
      if (cancelled) return
      const merged = mergeDefaults(saved)
      setSettings(merged)
      applyTheme(merged.app.theme)
      setSettingsHydrated(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void getOrCreatePeerId().then((id) => {
      if (!cancelled) setPeerId(id)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { peerId: id } = await initP2P()
      if (!cancelled) {
        setPeerId(id ?? '')
        setP2pStatus(getStatus())
        setConnectedPeers(getConnectedPeers())
      }
    })()

    const offStatus = onP2PEvent(P2P_EVENTS.STATUS_CHANGE, (s) => {
      setP2pStatus(s)
    })
    const offConnected = onP2PEvent(P2P_EVENTS.PEER_CONNECTED, () => {
      setConnectedPeers(getConnectedPeers())
    })
    const offDisconnected = onP2PEvent(P2P_EVENTS.PEER_DISCONNECTED, () => {
      setConnectedPeers(getConnectedPeers())
    })

    return () => {
      cancelled = true
      offStatus()
      offConnected()
      offDisconnected()
    }
  }, [])

  const handleConnect = async () => {
    const value = connectPeer.trim()
    if (!value || value === getPeerId()) return
    await connectToPeer(value)
    setConnectedPeers(getConnectedPeers())
  }

  const displayNamePreview = useMemo(() => {
    return settings.profile.displayName?.trim() || user?.email?.split('@')[0] || 'User'
  }, [settings.profile.displayName, user])

  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title={t('settings_profile_title')}
          subtitle={t('settings_profile_sub')}
        >
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
                  {t('settings_current_user')}
                </label>
                <div className="mt-1 h-9 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.4)] px-3 flex items-center">
                  <span className="text-sm text-[rgb(var(--zc-muted))] truncate">
                    {user?.email || 'Not logged in'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                  Logged in via Supabase Auth
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
                  {t('settings_display_name')}
                </label>
                <input
                  className="mt-1 h-9 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  placeholder={user?.email?.split('@')[0] || t('settings_display_placeholder')}
                  value={settings.profile.displayName}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      profile: { ...prev.profile, displayName: e.target.value },
                    }))
                  }
                />
                <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                  {t('settings_preview')}:{' '}
                  <span className="text-[rgb(var(--zc-muted))]">
                    {displayNamePreview}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title={t('settings_app_title')}
          subtitle={t('settings_app_sub')}
        >
          <div className="grid gap-4">
            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] px-3 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[rgb(var(--zc-text))]">
                    {t('settings_theme')}
                  </p>
                  <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                    {t('settings_theme_hint')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={[
                      'h-8 rounded-md px-3 text-xs font-medium ring-1 ring-inset transition',
                      settings.app.theme === 'dark'
                        ? 'bg-indigo-500/15 text-indigo-200 ring-indigo-500/30'
                        : 'bg-[rgb(var(--zc-bg)/0.4)] text-[rgb(var(--zc-muted))] ring-[rgb(var(--zc-border))] hover:bg-[rgb(var(--zc-panel)/0.6)]',
                    ].join(' ')}
                    onClick={() =>
                      setSettings((p) => ({ ...p, app: { ...p.app, theme: 'dark' } }))
                    }
                  >
                    {t('btn_dark')}
                  </button>
                  <button
                    type="button"
                    className={[
                      'h-8 rounded-md px-3 text-xs font-medium ring-1 ring-inset transition',
                      settings.app.theme === 'light'
                        ? 'bg-indigo-500/15 text-indigo-200 ring-indigo-500/30'
                        : 'bg-[rgb(var(--zc-bg)/0.4)] text-[rgb(var(--zc-muted))] ring-[rgb(var(--zc-border))] hover:bg-[rgb(var(--zc-panel)/0.6)]',
                    ].join(' ')}
                    onClick={() =>
                      setSettings((p) => ({ ...p, app: { ...p.app, theme: 'light' } }))
                    }
                  >
                    {t('btn_light')}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] px-3 py-3">
              <p className="text-sm font-medium text-[rgb(var(--zc-text))]">
                {t('settings_notifications')}
              </p>
              <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                {browserNotifPermission === 'unsupported'
                  ? t('settings_notif_unsupported')
                  : browserNotifPermission === 'granted'
                    ? t('settings_notif_granted')
                    : browserNotifPermission === 'denied'
                      ? t('settings_notif_denied')
                      : t('settings_notif_status_prompt')}
              </p>
              {browserNotifPermission === 'default' ? (
                <div className="mt-3">
                  <Button
                    onClick={() => {
                      void requestNotificationPermission().then(() => {
                        refreshBrowserNotifPermission()
                      })
                    }}
                  >
                    {t('settings_notif_enable')}
                  </Button>
                </div>
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
                {t('settings_language')}
              </label>
              <select
                className="mt-1 h-9 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                value={language}
                onChange={(e) => {
                  const v = e.target.value
                  void setLanguage(v)
                  setSettings((prev) => ({
                    ...prev,
                    app: { ...prev.app, language: v === 'tr' ? 'tr' : 'en' },
                  }))
                }}
              >
                <option value="en">{t('lang_english')}</option>
                <option value="tr">{t('lang_turkish')}</option>
              </select>
              <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                {t('settings_language_hint')}
              </p>
            </div>

            <div className="grid gap-3">
              <p className="text-sm font-semibold text-[rgb(var(--zc-text))]">
                {t('settings_notification_prefs')}
              </p>
              <Toggle
                label={t('settings_notif_tasks')}
                description={t('settings_notif_tasks_desc')}
                checked={settings.app.notifications.taskUpdates}
                onChange={(v) =>
                  setSettings((prev) => ({
                    ...prev,
                    app: {
                      ...prev.app,
                      notifications: { ...prev.app.notifications, taskUpdates: v },
                    },
                  }))
                }
              />
              <Toggle
                label={t('settings_notif_chat')}
                description={t('settings_notif_chat_desc')}
                checked={settings.app.notifications.chatMessages}
                onChange={(v) =>
                  setSettings((prev) => ({
                    ...prev,
                    app: {
                      ...prev.app,
                      notifications: { ...prev.app.notifications, chatMessages: v },
                    },
                  }))
                }
              />
              <Toggle
                label={t('settings_notif_cal')}
                description={t('settings_notif_cal_desc')}
                checked={settings.app.notifications.calendarReminders}
                onChange={(v) =>
                  setSettings((prev) => ({
                    ...prev,
                    app: {
                      ...prev.app,
                      notifications: {
                        ...prev.app.notifications,
                        calendarReminders: v,
                      },
                    },
                  }))
                }
              />
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title={t('settings_p2p_title')}
          subtitle={t('settings_p2p_sub')}
        >
          <div className="grid gap-4">
            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] px-3 py-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-[rgb(var(--zc-text))]">
                    {t('settings_status')}
                  </p>
                  <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                    {t('settings_status_sub')}
                  </p>
                </div>
                <span
                  className={[
                    'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ring-1 ring-inset',
                    p2pStatus === P2P_STATUS.ONLINE
                      ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/40'
                      : p2pStatus === P2P_STATUS.CONNECTING
                        ? 'bg-amber-500/10 text-amber-300 ring-amber-500/40'
                        : 'bg-rose-500/10 text-rose-300 ring-rose-500/40',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'h-2 w-2 rounded-full',
                      p2pStatus === P2P_STATUS.ONLINE
                        ? 'bg-emerald-400'
                        : p2pStatus === P2P_STATUS.CONNECTING
                          ? 'bg-amber-400'
                          : 'bg-rose-400',
                    ].join(' ')}
                  />
                  <span className="capitalize">
                    {p2pStatus === P2P_STATUS.ONLINE
                      ? t('p2p_connected')
                      : p2pStatus === P2P_STATUS.CONNECTING
                        ? t('p2p_connecting')
                        : t('p2p_disconnected')}
                  </span>
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] px-3 py-3">
              <p className="text-sm font-medium text-[rgb(var(--zc-text))]">
                {t('chat_peer_id')}
              </p>
              <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                {t('settings_peer_id_sub')}
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="flex-1 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.5)] px-3 py-2 text-xs text-[rgb(var(--zc-muted))]">
                  {peerId}
                </code>
                <Button
                  variant="secondary"
                  onClick={() => {
                    try {
                      navigator.clipboard?.writeText(peerId)
                    } catch {
                      // ignore
                    }
                  }}
                >
                  {t('settings_copy')}
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] px-3 py-3">
              <p className="text-sm font-medium text-[rgb(var(--zc-text))]">
                {t('settings_connect_peer')}
              </p>
              <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                {t('settings_connect_peer_sub')}
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  className="h-9 flex-1 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  placeholder={t('placeholder_peer_id')}
                  value={connectPeer}
                  onChange={(e) => setConnectPeer(e.target.value)}
                />
                <Button
                  variant="secondary"
                  onClick={handleConnect}
                  disabled={!connectPeer.trim()}
                >
                  {t('btn_connect')}
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] px-3 py-3">
              <p className="text-sm font-medium text-[rgb(var(--zc-text))]">
                {t('settings_connected_peers')}
              </p>
              <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                {t('settings_connected_peers_sub')}
              </p>
              {connectedPeers.length === 0 ? (
                <p className="mt-2 text-xs text-[rgb(var(--zc-muted2))]">
                  {t('settings_no_peers')}
                </p>
              ) : (
                <ul className="mt-2 space-y-1 text-xs font-mono text-[rgb(var(--zc-muted))]">
                  {connectedPeers.map((id) => (
                    <li key={id} className="truncate">
                      {id}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title={t('settings_install_title')}
          subtitle={t('settings_install_sub')}
        >
          <div className="grid gap-3">
            {isInstalled ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-200">
                {t('settings_installed_msg')}
              </div>
            ) : canInstall ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[rgb(var(--zc-text))]">
                    {t('settings_install_ready')}
                  </p>
                  <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                    {t('settings_install_ready_sub')}
                  </p>
                </div>
                <Button
                  onClick={() => {
                    void promptInstall()
                  }}
                >
                  {t('settings_install_btn')}
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] px-3 py-3 text-sm text-[rgb(var(--zc-muted))]">
                {t('settings_install_unavailable')}
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title={t('settings_data_title')}
          subtitle={t('settings_data_sub')}
        >
          <DataManagement
            onAfterImportOrClear={() => {
              void loadSettings().then((saved) => setSettings(mergeDefaults(saved)))
              void getOrCreatePeerId().then((id) => setPeerId(id))
            }}
          />
        </SectionCard>
      </div>

      <SectionCard title={t('settings_about_title')} subtitle={t('settings_about_sub')}>
        <div className="grid gap-3 text-sm text-[rgb(var(--zc-muted))]">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] px-3 py-3">
            <span className="text-[rgb(var(--zc-muted2))]">{t('settings_about_app')}</span>
            <span className="font-medium text-[rgb(var(--zc-text))]">ZeroCollab</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] px-3 py-3">
            <span className="text-[rgb(var(--zc-muted2))]">{t('settings_about_version')}</span>
            <span className="font-medium text-[rgb(var(--zc-text))]">{APP_VERSION}</span>
          </div>
          <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] px-3 py-3">
            <p className="text-[rgb(var(--zc-muted2))]">{t('settings_about_team')}</p>
            <p className="mt-1 font-medium text-[rgb(var(--zc-text))]">
              {t('settings_team_value')}
            </p>
          </div>
          <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] px-3 py-3">
            <p className="text-[rgb(var(--zc-muted2))]">{t('settings_about_advisor')}</p>
            <p className="mt-1 font-medium text-[rgb(var(--zc-text))]">
              {t('settings_advisor_value')}
            </p>
          </div>
          <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] px-3 py-3">
            <p className="text-[rgb(var(--zc-muted2))]">{t('settings_about_institution')}</p>
            <p className="mt-1 font-medium text-[rgb(var(--zc-text))]">
              {t('settings_institution_value')}
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
