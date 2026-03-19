import { useEffect, useMemo, useState } from 'react'
import { Button } from '../ui/Button.jsx'
import { SectionCard } from './SectionCard.jsx'
import { Toggle } from './Toggle.jsx'
import { ColorPicker } from './ColorPicker.jsx'
import { DataManagement } from './DataManagement.jsx'
import { APP_VERSION, AVATAR_COLORS, USERS } from './settingsConstants.js'
import { getOrCreatePeerId, loadSettings, saveSettings } from './settingsStorage.js'
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
    currentUser: USERS[0],
    displayName: '',
    avatarColor: AVATAR_COLORS[0].value,
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
  const [settings, setSettings] = useState(() => mergeDefaults(null))
  const [peerId, setPeerId] = useState('')
  const [connectPeer, setConnectPeer] = useState('')
  const [p2pStatus, setP2pStatus] = useState(P2P_STATUS.OFFLINE)
  const [connectedPeers, setConnectedPeers] = useState([])

  useEffect(() => {
    void saveSettings(settings)
    applyTheme(settings.app.theme)
  }, [settings])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const saved = await loadSettings()
      if (!cancelled) {
        const merged = mergeDefaults(saved)
        setSettings(merged)
        applyTheme(merged.app.theme)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const id = await getOrCreatePeerId()
      if (!cancelled) setPeerId(id)
    })()
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
    // eslint-disable-next-line no-console
    console.log('[SettingsShell] connectToPeer', value)
    await connectToPeer(value)
    setConnectedPeers(getConnectedPeers())
  }

  const displayNamePreview = useMemo(() => {
    return settings.profile.displayName?.trim() || settings.profile.currentUser
  }, [settings.profile.currentUser, settings.profile.displayName])

  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="User Profile"
          subtitle="Identity settings used across the app."
        >
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
                  Current user
                </label>
                <select
                  className="mt-1 h-9 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  value={settings.profile.currentUser}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      profile: { ...prev.profile, currentUser: e.target.value },
                    }))
                  }
                >
                  {USERS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
                  Display name
                </label>
                <input
                  className="mt-1 h-9 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  placeholder="e.g. Nisanur K."
                  value={settings.profile.displayName}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      profile: { ...prev.profile, displayName: e.target.value },
                    }))
                  }
                />
                <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                  Preview:{' '}
                  <span className="text-[rgb(var(--zc-muted))]">
                    {displayNamePreview}
                  </span>
                </p>
              </div>
            </div>

            <ColorPicker
              label="Avatar color"
              colors={AVATAR_COLORS}
              value={settings.profile.avatarColor}
              onChange={(color) =>
                setSettings((prev) => ({
                  ...prev,
                  profile: { ...prev.profile, avatarColor: color },
                }))
              }
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Application Settings"
          subtitle="Preferences stored locally (dark theme default)."
        >
          <div className="grid gap-4">
            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] px-3 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[rgb(var(--zc-text))]">
                    Theme
                  </p>
                  <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                    Saves preference to localStorage.
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
                    Dark
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
                    Light
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[rgb(var(--zc-muted))]">
                Language
              </label>
              <select
                className="mt-1 h-9 w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                value={settings.app.language}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    app: { ...prev.app, language: e.target.value },
                  }))
                }
              >
                <option value="en">English</option>
                <option value="tr">Turkish</option>
              </select>
              <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                Preference is saved; translations will be added later.
              </p>
            </div>

            <div className="grid gap-3">
              <p className="text-sm font-semibold text-[rgb(var(--zc-text))]">
                Notification preferences
              </p>
              <Toggle
                label="Task updates"
                description="When tasks change status or due date."
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
                label="Chat messages"
                description="When new messages arrive in a channel or DM."
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
                label="Calendar reminders"
                description="Reminders for upcoming due dates."
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
          title="P2P Connection"
          subtitle="Browser-to-browser messaging via PeerJS (WebRTC)."
        >
          <div className="grid gap-4">
            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] px-3 py-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-[rgb(var(--zc-text))]">
                    Status
                  </p>
                  <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                    Connection status for the P2P chat transport.
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
                      ? 'Connected'
                      : p2pStatus === P2P_STATUS.CONNECTING
                        ? 'Connecting'
                        : 'Disconnected'}
                  </span>
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] px-3 py-3">
              <p className="text-sm font-medium text-[rgb(var(--zc-text))]">
                Peer ID
              </p>
              <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                This tab&apos;s PeerJS ID (derived from your stored base ID).
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
                  Copy
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] px-3 py-3">
              <p className="text-sm font-medium text-[rgb(var(--zc-text))]">
                Connect to Peer
              </p>
              <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                Paste another person&apos;s Peer ID to establish a P2P link.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  className="h-9 flex-1 rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  placeholder="Enter peer ID"
                  value={connectPeer}
                  onChange={(e) => setConnectPeer(e.target.value)}
                />
                <Button
                  variant="secondary"
                  onClick={handleConnect}
                  disabled={!connectPeer.trim()}
                >
                  Connect
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] px-3 py-3">
              <p className="text-sm font-medium text-[rgb(var(--zc-text))]">
                Connected peers
              </p>
              <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                Active P2P data connections in this tab.
              </p>
              {connectedPeers.length === 0 ? (
                <p className="mt-2 text-xs text-[rgb(var(--zc-muted2))]">
                  No peers connected yet.
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
          title="Data Management"
          subtitle="Export, import, or clear local data."
        >
          <DataManagement
            onAfterImportOrClear={() => {
              setSettings(mergeDefaults(loadSettings()))
              setPeerId(getOrCreatePeerId())
            }}
          />
        </SectionCard>
      </div>

      <SectionCard
        title="About"
        subtitle="Academic project information"
      >
        <div className="grid gap-3 text-sm text-[rgb(var(--zc-muted))]">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] px-3 py-3">
            <span className="text-[rgb(var(--zc-muted2))]">App</span>
            <span className="font-medium text-[rgb(var(--zc-text))]">
              ZeroCollab
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] px-3 py-3">
            <span className="text-[rgb(var(--zc-muted2))]">Version</span>
            <span className="font-medium text-[rgb(var(--zc-text))]">
              {APP_VERSION}
            </span>
          </div>
          <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] px-3 py-3">
            <p className="text-[rgb(var(--zc-muted2))]">Team</p>
            <p className="mt-1 font-medium text-[rgb(var(--zc-text))]">
              Özlem Nur Bora, Songül Nur Öztürk, Nisanur Karataş
            </p>
          </div>
          <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] px-3 py-3">
            <p className="text-[rgb(var(--zc-muted2))]">Advisor</p>
            <p className="mt-1 font-medium text-[rgb(var(--zc-text))]">
              Dr. Yusuf Altunel
            </p>
          </div>
          <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.4)] px-3 py-3">
            <p className="text-[rgb(var(--zc-muted2))]">Institution</p>
            <p className="mt-1 font-medium text-[rgb(var(--zc-text))]">
              Istanbul Kültür University — COM 8090 Capstone Project
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

