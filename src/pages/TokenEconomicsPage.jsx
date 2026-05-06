import { useEffect, useMemo, useState } from 'react'
import { TOKEN_TIERS, getTierByBalance, getTierLimits } from '../utils/tokenEconomics/tokenTiers.js'
import {
  clearTokenProfile,
  getTokenProfile,
  saveTokenProfile,
} from '../utils/tokenEconomics/tokenProfileStorage.js'
import { getQuotaUsage, resetQuotaUsage } from '../utils/tokenEconomics/quotaUsageStorage.js'
import { QUOTA_LABELS, QUOTA_KEYS } from '../utils/tokenEconomics/quotaRules.js'
import { getQuotaMessage } from '../utils/tokenEconomics/quotaService.js'
import {
  getAllComparisonRows,
  tierIncludesFeature,
} from '../utils/tokenEconomics/premiumFeatures.js'

function clampNumber(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.max(0, v)
}

const TIER_UI = {
  FREE: {
    label: 'Free',
    columnHead: 'border-slate-500/35 bg-gradient-to-b from-slate-500/15 to-blue-500/5 text-slate-200',
    cardRing: 'ring-1 ring-slate-500/35',
    badge: 'bg-slate-500/15 text-slate-200 ring-1 ring-slate-500/40',
    accentBar: 'from-slate-400/50 to-blue-500/40',
  },
  PLUS: {
    label: 'Plus',
    columnHead: 'border-violet-500/40 bg-gradient-to-b from-violet-500/20 to-violet-950/30 text-violet-100',
    cardRing: 'ring-1 ring-violet-500/45',
    badge: 'bg-violet-500/15 text-violet-200 ring-1 ring-violet-500/40',
    accentBar: 'from-violet-500/60 to-fuchsia-500/40',
  },
  PREMIUM: {
    label: 'Premium',
    columnHead: 'border-amber-500/45 bg-gradient-to-b from-amber-500/25 to-amber-950/20 text-amber-100',
    cardRing: 'ring-1 ring-amber-400/50',
    badge: 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/45',
    accentBar: 'from-amber-400/70 to-yellow-600/40',
  },
}

const TIER_KEYS = ['FREE', 'PLUS', 'PREMIUM']

const CAPABILITY_LABELS = [
  { key: 'aiPriority', label: 'Priority AI queue' },
  { key: 'premiumAnalytics', label: 'Premium analytics' },
  { key: 'roadmapAccess', label: 'Roadmap management' },
  { key: 'releaseManagementAccess', label: 'Release & delivery' },
  { key: 'advancedSprintMetrics', label: 'Advanced sprint metrics' },
  { key: 'exportReports', label: 'Export reports' },
  { key: 'crossProjectAnalytics', label: 'Cross-project analytics' },
]

function FeatureBadge({ unlocked, label }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium ring-1 ring-inset transition',
        unlocked
          ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25'
          : 'bg-[rgb(var(--zc-border)/0.5)] text-[rgb(var(--zc-muted2))] ring-[rgb(var(--zc-border))]',
      ].join(' ')}
    >
      <span
        className={[
          'h-1.5 w-1.5 rounded-full',
          unlocked ? 'bg-emerald-400' : 'bg-[rgb(var(--zc-subtle))]',
        ].join(' ')}
        aria-hidden
      />
      {unlocked ? 'Unlocked' : 'Locked'} · {label}
    </span>
  )
}

function SectionCard({ eyebrow, title, subtitle, accentClass, children }) {
  return (
    <div
      className={[
        'overflow-hidden rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.45)] shadow-sm',
        accentClass || '',
      ].join(' ')}
    >
      <div className="border-b border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] px-4 py-3">
        {eyebrow ? (
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--zc-muted2))]">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-0.5 text-sm font-semibold text-[rgb(var(--zc-text))]">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 text-xs text-[rgb(var(--zc-muted))]">{subtitle}</p>
        ) : null}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function QuotaBar({ used, limit, label }) {
  const safeUsed = clampNumber(used)
  const safeLimit = Math.max(0, clampNumber(limit))
  const pct =
    safeLimit === 0 ? 0 : Math.min(100, (safeUsed / safeLimit) * 100)
  const exceeded = safeUsed > safeLimit
  const near = !exceeded && pct >= 80

  const barColor = exceeded
    ? 'bg-rose-500'
    : near
      ? 'bg-amber-400'
      : 'bg-indigo-500'

  return (
    <div className="rounded-lg border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.45)] p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-[rgb(var(--zc-text))]">
            {label}
          </p>
          <p className="mt-1 text-[11px] tabular-nums text-[rgb(var(--zc-subtle))]">
            {safeUsed} / {safeLimit} · {safeLimit === 0 ? '—' : `${Math.round(pct)}%`}
          </p>
        </div>
        <span
          className={[
            'shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            exceeded
              ? 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30'
              : near
                ? 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/25'
                : 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/25',
          ].join(' ')}
        >
          {exceeded ? 'Exceeded' : near ? 'Near limit' : 'Within quota'}
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--zc-border)/0.7)]">
        <div
          className={['h-full rounded-full transition-[width]', barColor].join(
            ' ',
          )}
          style={{
            width: exceeded ? '100%' : `${pct}%`,
          }}
        />
      </div>
      {exceeded ? (
        <p className="mt-2 text-[11px] text-rose-300/95">
          Usage exceeds your tier limit. Increase ZC holdings or reduce usage.
        </p>
      ) : null}
    </div>
  )
}

export function TokenEconomicsPage() {
  const [profile, setProfile] = useState(() => getTokenProfile())
  const [usage, setUsage] = useState(() => getQuotaUsage())
  const [status, setStatus] = useState(null)

  useEffect(() => {
    const refreshFromStorage = () => {
      setProfile(getTokenProfile())
      setUsage(getQuotaUsage())
    }
    refreshFromStorage()
    const onVis = () => {
      if (document.visibilityState === 'visible') refreshFromStorage()
    }
    window.addEventListener('zc-quota-changed', refreshFromStorage)
    window.addEventListener('storage', refreshFromStorage)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('zc-quota-changed', refreshFromStorage)
      window.removeEventListener('storage', refreshFromStorage)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  const derived = useMemo(() => {
    const tokenBalance = clampNumber(profile.tokenBalance)
    const tierKey = getTierByBalance(tokenBalance)
    const tier = getTierLimits(tierKey)
    return { tokenBalance, tierKey, tier }
  }, [profile.tokenBalance])

  const tierUi = TIER_UI[derived.tierKey] || TIER_UI.FREE

  const quotaCards = useMemo(() => {
    return [
      {
        key: QUOTA_KEYS.projects,
        limit: derived.tier.projectLimit,
        used: clampNumber(usage.projects),
      },
      {
        key: QUOTA_KEYS.evaluations,
        limit: derived.tier.evaluationLimit,
        used: clampNumber(usage.evaluations),
      },
      {
        key: QUOTA_KEYS.teamMembers,
        limit: derived.tier.teamMemberLimit,
        used: clampNumber(usage.teamMembers),
      },
    ]
  }, [derived.tier, usage])

  const upgradeHints = useMemo(() => {
    const b = derived.tokenBalance
    const hints = []
    if (b < TOKEN_TIERS.PLUS.minBalance) {
      hints.push(
        `Hold ${TOKEN_TIERS.PLUS.minBalance}+ ZC to unlock Plus features (advanced sprint metrics, exports, priority AI).`,
      )
    }
    if (b < TOKEN_TIERS.PREMIUM.minBalance) {
      hints.push(
        `Hold ${TOKEN_TIERS.PREMIUM.minBalance}+ ZC to unlock Premium roadmap, release management, and cross-project analytics.`,
      )
    }
    if (hints.length === 0) {
      hints.push('You are on the highest feature tier for token holdings.')
    }
    return hints
  }, [derived.tokenBalance])

  const comparisonRows = useMemo(() => getAllComparisonRows(), [])

  const save = () => {
    const next = {
      ...profile,
      tokenBalance: derived.tokenBalance,
      tier: derived.tierKey,
      lastCheckedAt: Date.now(),
    }
    saveTokenProfile(next)
    setProfile(next)
    setStatus({ type: 'success', message: 'Profile saved locally.' })
    window.setTimeout(() => setStatus(null), 2500)
  }

  const clear = () => {
    clearTokenProfile()
    const next = getTokenProfile()
    setProfile(next)
    setStatus({ type: 'info', message: 'Profile cleared.' })
    window.setTimeout(() => setStatus(null), 2500)
  }

  const demoAdd10 = () => {
    const nextBalance = clampNumber(profile.tokenBalance) + 10
    const next = {
      ...profile,
      tokenBalance: nextBalance,
    }
    setProfile(next)
    setStatus({ type: 'info', message: 'Added 10 ZC (demo).' })
    window.setTimeout(() => setStatus(null), 2500)
  }

  const demoResetUsage = () => {
    const next = resetQuotaUsage()
    setUsage(next)
    setStatus({ type: 'info', message: 'Quota usage reset (demo).' })
    window.setTimeout(() => setStatus(null), 2500)
  }

  return (
    <section className="space-y-8">
      <div className="relative overflow-hidden rounded-2xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)]">
        <div
          className={[
            'absolute inset-x-0 top-0 h-1 bg-gradient-to-r',
            tierUi.accentBar,
          ].join(' ')}
        />
        <div className="px-5 py-6 sm:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[rgb(var(--zc-muted2))]">
                Subscription · Token economy
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[rgb(var(--zc-text))] sm:text-3xl">
                Token Economics
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-[rgb(var(--zc-muted))] sm:text-base">
                Align your ZC holdings with plan tiers, quotas, and product
                capabilities. Offline-first profile and usage — cloud sync when
                you connect Hedera.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={[
                  'rounded-lg px-3 py-1.5 text-xs font-semibold',
                  tierUi.badge,
                ].join(' ')}
              >
                Current: {derived.tier.label}
              </span>
              <span className="rounded-lg bg-[rgb(var(--zc-border)/0.45)] px-3 py-1.5 text-xs font-medium text-[rgb(var(--zc-muted))] ring-1 ring-[rgb(var(--zc-border))]">
                {derived.tokenBalance} ZC
              </span>
            </div>
          </div>
        </div>
      </div>

      {status ? (
        <div
          className={[
            'rounded-xl border px-4 py-3 text-sm',
            status.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200'
              : 'border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] text-[rgb(var(--zc-muted))]',
          ].join(' ')}
        >
          {status.message}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <SectionCard
            eyebrow="Account"
            title="Token profile"
            subtitle="Local persistence only. Link Hedera account when ready; balance can be adjusted here until mirror sync."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-[rgb(var(--zc-muted2))]">
                  Hedera Account ID
                </span>
                <input
                  type="text"
                  value={profile.hederaAccountId || ''}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, hederaAccountId: e.target.value }))
                  }
                  placeholder="0.0.xxxxx"
                  className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.5)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/45"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-medium text-[rgb(var(--zc-muted2))]">
                  Token ID
                </span>
                <input
                  type="text"
                  value={profile.tokenId || ''}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, tokenId: e.target.value }))
                  }
                  placeholder="0.0.123456 (after issuance)"
                  className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.5)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/45"
                />
              </label>

              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-xs font-medium text-[rgb(var(--zc-muted2))]">
                  ZC balance (manual until mirror node)
                </span>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    inputMode="decimal"
                    type="number"
                    min="0"
                    step="1"
                    value={String(profile.tokenBalance ?? 0)}
                    onChange={(e) =>
                      setProfile((p) => ({
                        ...p,
                        tokenBalance: e.target.value,
                      }))
                    }
                    className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.5)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] focus:outline-none focus:ring-2 focus:ring-indigo-500/45"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={demoAdd10}
                      className="rounded-md bg-[rgb(var(--zc-border)/0.55)] px-3 py-2 text-xs font-medium text-[rgb(var(--zc-text))] transition hover:bg-[rgb(var(--zc-border))]"
                    >
                      Demo: Add 10 ZC
                    </button>
                    <button
                      type="button"
                      onClick={demoResetUsage}
                      className="rounded-md bg-[rgb(var(--zc-border)/0.35)] px-3 py-2 text-xs font-medium text-[rgb(var(--zc-muted))] transition hover:bg-[rgb(var(--zc-border)/0.55)] hover:text-[rgb(var(--zc-text))]"
                    >
                      Demo: Reset Usage
                    </button>
                  </div>
                </div>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[rgb(var(--zc-border))] pt-4">
              <button
                type="button"
                onClick={save}
                className="rounded-md bg-indigo-500/20 px-4 py-2 text-sm font-medium text-indigo-300 transition hover:bg-indigo-500/30"
              >
                Save Profile
              </button>
              <button
                type="button"
                onClick={clear}
                className="rounded-md bg-rose-500/15 px-4 py-2 text-sm font-medium text-rose-300 transition hover:bg-rose-500/25"
              >
                Clear Profile
              </button>
              {profile.lastCheckedAt ? (
                <span className="text-xs text-[rgb(var(--zc-subtle))]">
                  Last saved: {new Date(profile.lastCheckedAt).toLocaleString()}
                </span>
              ) : (
                <span className="text-xs text-[rgb(var(--zc-subtle))]">
                  Not saved yet
                </span>
              )}
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Capabilities"
            title="Plan capabilities"
            subtitle="Gate flags from your tier. Locked rows indicate upgrade paths."
          >
            <div className="flex flex-wrap gap-2">
              {CAPABILITY_LABELS.map(({ key, label }) => (
                <FeatureBadge
                  key={key}
                  label={label}
                  unlocked={Boolean(derived.tier[key])}
                />
              ))}
            </div>
            <ul className="mt-4 space-y-2 border-t border-[rgb(var(--zc-border))] pt-4">
              {upgradeHints.map((hint, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-xs text-[rgb(var(--zc-muted))]"
                >
                  <span className="mt-0.5 text-indigo-400" aria-hidden>
                    →
                  </span>
                  <span>{hint}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <div
            className={[
              'rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.4)] p-4',
              tierUi.cardRing,
            ].join(' ')}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--zc-muted2))]">
              Active plan
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xl font-semibold text-[rgb(var(--zc-text))]">
                  {derived.tier.label}
                </p>
                <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                  From ≥ {derived.tier.minBalance} ZC · quotas scale with tier
                </p>
              </div>
              <span
                className={[
                  'rounded-lg px-3 py-1.5 text-xs font-semibold',
                  tierUi.badge,
                ].join(' ')}
              >
                {derived.tokenBalance} ZC
              </span>
            </div>
          </div>

          <SectionCard
            eyebrow="Usage"
            title="Quota utilization"
            subtitle="Progress reflects local counters vs tier limits. Warning near 80%; exceeded when over limit."
          >
            <div className="space-y-3">
              {quotaCards.map((q) => (
                <div key={q.key}>
                  <QuotaBar
                    used={q.used}
                    limit={q.limit}
                    label={QUOTA_LABELS[q.key]}
                  />
                  <p className="mt-2 text-[11px] leading-relaxed text-[rgb(var(--zc-muted))]">
                    {getQuotaMessage(
                      {
                        ...profile,
                        tier: derived.tierKey,
                        tokenBalance: derived.tokenBalance,
                      },
                      q.key,
                    )}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-[rgb(var(--zc-border))] pt-4">
              <p className="text-[11px] text-[rgb(var(--zc-subtle))]">
                Storage keys: <code className="text-[rgb(var(--zc-muted))]">zc-token-profile-v1</code>,{' '}
                <code className="text-[rgb(var(--zc-muted))]">zc-quota-usage-v1</code>
              </p>
              <button
                type="button"
                onClick={() => setUsage(getQuotaUsage())}
                className="rounded-md bg-[rgb(var(--zc-border)/0.35)] px-3 py-2 text-xs font-medium text-[rgb(var(--zc-muted))] transition hover:bg-[rgb(var(--zc-border)/0.55)] hover:text-[rgb(var(--zc-text))]"
              >
                Refresh
              </button>
            </div>
          </SectionCard>
        </div>
      </div>

      <SectionCard
        eyebrow="Compare"
        title="Tier Feature Comparison"
        subtitle="Product capabilities by release tier. Your current tier highlights in the header."
      >
        <div className="overflow-x-auto rounded-lg border border-[rgb(var(--zc-border))]">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--zc-border))]">
                <th className="sticky left-0 z-10 bg-[rgb(var(--zc-panel))] px-3 py-3 text-xs font-semibold text-[rgb(var(--zc-muted2))]">
                  Feature
                </th>
                {TIER_KEYS.map((tk) => {
                  const ui = TIER_UI[tk]
                  const active = derived.tierKey === tk
                  return (
                    <th
                      key={tk}
                      className={[
                        'px-3 py-3 text-center text-xs font-semibold',
                        ui.columnHead,
                        active ? 'ring-2 ring-indigo-400/40' : '',
                      ].join(' ')}
                    >
                      {TOKEN_TIERS[tk].label}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row, idx) => (
                <tr
                  key={`${row.label}-${idx}`}
                  className="border-b border-[rgb(var(--zc-border)/0.85)] last:border-0"
                >
                  <td className="sticky left-0 z-10 bg-[rgb(var(--zc-bg)/0.82)] px-3 py-2.5 text-xs text-[rgb(var(--zc-text))] backdrop-blur-sm">
                    {row.label}
                  </td>
                  {TIER_KEYS.map((tk) => {
                    const included = tierIncludesFeature(tk, row.introTier)
                    const isCurrentCol = derived.tierKey === tk
                    return (
                      <td
                        key={tk}
                        className={[
                          'px-2 py-2.5 text-center text-xs',
                          isCurrentCol
                            ? 'bg-indigo-500/5'
                            : 'bg-[rgb(var(--zc-bg)/0.2)]',
                        ].join(' ')}
                      >
                        {included ? (
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25">
                            ✓
                          </span>
                        ) : (
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[rgb(var(--zc-border)/0.6)] text-[rgb(var(--zc-subtle))] ring-1 ring-[rgb(var(--zc-border))]">
                            —
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-[rgb(var(--zc-subtle))]">
          ✓ = included in that tier. Higher tiers inherit lower-tier features.
        </p>
      </SectionCard>
    </section>
  )
}
