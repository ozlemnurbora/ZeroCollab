import { useEffect, useMemo, useRef, useState } from 'react'
import { TOKEN_TIERS, getTierByBalance, getTierLimits } from '../utils/tokenEconomics/tokenTiers.js'
import {
  clearTokenProfile,
  getTokenProfile,
  saveTokenProfile,
} from '../utils/tokenEconomics/tokenProfileStorage.js'
import { getQuotaUsage } from '../utils/tokenEconomics/quotaUsageStorage.js'
import { syncProjectsQuotaFromWorkspaceCount } from '../utils/tokenEconomics/quotaGuardService.js'
import { useWorkspace } from '../utils/WorkspaceContext.jsx'
import { useAuth } from '../utils/AuthContext.jsx'
import { useLanguage } from '../utils/LanguageContext.jsx'
import { isAdminRole } from '../utils/roleOntology.js'
import { QUOTA_LABELS, QUOTA_KEYS } from '../utils/tokenEconomics/quotaRules.js'
import { getQuotaMessage } from '../utils/tokenEconomics/quotaService.js'
import {
  getAllComparisonRows,
  tierIncludesFeature,
} from '../utils/tokenEconomics/premiumFeatures.js'
import {
  HEDERA_NETWORK,
  HEDERA_OPERATOR_ID,
  MIRROR_NODE_BASE_URL,
  ZC_TOKEN_ID,
  ZC_TOKEN_NETWORK,
} from '../utils/tokenEconomics/tokenConfig.js'
import {
  MirrorNodeError,
  fetchZcTokenBalance,
  isValidHederaAccountId,
} from '../utils/tokenEconomics/mirrorNodeService.js'

function clampNumber(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.max(0, v)
}

function coerceInputString(raw) {
  if (typeof raw === 'string') return raw.trim()
  if (typeof raw?.target?.value === 'string') return raw.target.value.trim()
  if (typeof raw?.currentTarget?.value === 'string') return raw.currentTarget.value.trim()
  if (typeof raw?.value === 'string') return raw.value.trim()
  return ''
}

function parseHederaPrivateKey(PrivateKey, raw) {
  const s = coerceInputString(raw)
  try {
    return PrivateKey.fromStringED25519(s)
  } catch {
    try {
      return PrivateKey.fromStringECDSA(s)
    } catch {
      return PrivateKey.fromString(s)
    }
  }
}

const TIER_UI = {
  FREE: {
    label: 'Free',
    columnHead: 'border-slate-500/40 bg-gradient-to-b from-slate-500/35 to-blue-500/20 text-[rgb(var(--zc-text))]',
    cardRing: 'ring-1 ring-slate-500/35',
    badge: 'bg-slate-500/15 text-[rgb(var(--zc-text))] ring-1 ring-slate-500/40',
    accentBar: 'from-slate-400/50 to-blue-500/40',
  },
  PLUS: {
    label: 'Plus',
    columnHead: 'border-violet-500/50 bg-gradient-to-b from-violet-500/45 to-violet-700/25 text-[rgb(var(--zc-text))]',
    cardRing: 'ring-1 ring-violet-500/45',
    badge: 'bg-violet-500/15 text-violet-200 ring-1 ring-violet-500/40',
    accentBar: 'from-violet-500/60 to-fuchsia-500/40',
  },
  PREMIUM: {
    label: 'Premium',
    columnHead: 'border-amber-500/55 bg-gradient-to-b from-amber-500/50 to-amber-600/30 text-[rgb(var(--zc-text))]',
    cardRing: 'ring-1 ring-amber-400/50',
    badge: 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/45',
    accentBar: 'from-amber-400/70 to-yellow-600/40',
  },
}

const TIER_KEYS = ['FREE', 'PLUS', 'PREMIUM']

/** Shipped capabilities only; `unlocked` reads live tier flags where relevant. */
const CAPABILITY_ROWS = [
  {
    key: 'quota-projects',
    label: 'Project quota (enforced on create)',
    unlocked: () => true,
  },
  {
    key: 'quota-evaluations',
    label: 'AI evaluation quota',
    unlocked: () => true,
  },
  {
    key: 'quota-team',
    label: 'Team member quota',
    unlocked: () => true,
  },
  {
    key: 'roadmap-view',
    label: 'Product Roadmap (view)',
    unlocked: () => true,
  },
  {
    key: 'roadmapAccess',
    label: 'Product Roadmap (edit & save)',
    unlocked: (tier) => Boolean(tier?.roadmapAccess),
  },
  {
    key: 'token-tier',
    label: 'ZC balance drives plan tier',
    unlocked: () => true,
  },
]

function FeatureBadge({ unlocked, label }) {
  const { t } = useLanguage()
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
      {unlocked ? t('te_unlocked') : t('te_locked')} · {label}
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
  const { t } = useLanguage()
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
          {exceeded ? t('te_exceeded') : near ? t('te_near_limit') : t('te_within_quota')}
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
          {t('te_quota_exceeded_note')}
        </p>
      ) : null}
    </div>
  )
}

export function TokenEconomicsPage() {
  const { t } = useLanguage()
  const { projects, activeProject } = useWorkspace()
  const { user } = useAuth()
  const activeProjectCount = Array.isArray(projects) ? projects.length : 0
  const [profile, setProfile] = useState(() => getTokenProfile())
  const [usage, setUsage] = useState(() => getQuotaUsage())
  const [status, setStatus] = useState(null)
  const [isFetchingBalance, setIsFetchingBalance] = useState(false)
  const [balanceFetchInfo, setBalanceFetchInfo] = useState(null)
  const [adminTransferForm, setAdminTransferForm] = useState({
    recipient: '',
    amount: '',
  })
  const [adminTransferInfo, setAdminTransferInfo] = useState(null)
  const [isSendingAdminTransfer, setIsSendingAdminTransfer] = useState(false)
  const adminOperatorKeyRef = useRef(null)

  const isProjectAdmin = useMemo(() => {
    if (!user?.id || !activeProject) return false
    const ownerId = activeProject.owner_id ?? activeProject.ownerId ?? null
    if (ownerId && ownerId === user.id) return true
    return isAdminRole(activeProject.role)
  }, [user?.id, activeProject])

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
  const tierLabel = (tk) => (tk === 'FREE' ? t('te_free') : TOKEN_TIERS[tk]?.label || tk)

  const quotaCards = useMemo(() => {
    return [
      {
        key: QUOTA_KEYS.projects,
        limit: derived.tier.projectLimit,
        used: activeProjectCount,
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
  }, [derived.tier, usage, activeProjectCount])

  const upgradeHints = useMemo(() => {
    const b = derived.tokenBalance
    const hints = []
    if (b < TOKEN_TIERS.PLUS.minBalance) {
      hints.push(t('te_hint_plus', { min: TOKEN_TIERS.PLUS.minBalance }))
    }
    if (b < TOKEN_TIERS.PREMIUM.minBalance) {
      hints.push(t('te_hint_premium', { min: TOKEN_TIERS.PREMIUM.minBalance }))
    }
    if (hints.length === 0) {
      hints.push(t('te_highest_tier'))
    }
    return hints
  }, [derived.tokenBalance, t])

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
    setStatus({ type: 'success', message: t('te_profile_saved') })
    window.setTimeout(() => setStatus(null), 2500)
  }

  const clear = () => {
    clearTokenProfile()
    syncProjectsQuotaFromWorkspaceCount(activeProjectCount)
    const next = getTokenProfile()
    setProfile(next)
    setUsage(getQuotaUsage())
    setStatus({ type: 'info', message: t('te_profile_cleared') })
    window.setTimeout(() => setStatus(null), 2500)
  }

  const clearAdminOperatorKey = () => {
    if (adminOperatorKeyRef.current) adminOperatorKeyRef.current.value = ''
  }

  const handleAdminTransfer = async () => {
    if (!isProjectAdmin) return
    const recipient = String(adminTransferForm.recipient || '').trim()
    const amount = Number(adminTransferForm.amount)
    const operatorKeyRaw = coerceInputString(adminOperatorKeyRef.current)

    const failBeforeSend = (message) => {
      setAdminTransferInfo({ type: 'error', message })
      clearAdminOperatorKey()
    }

    if (!recipient || !isValidHederaAccountId(recipient)) {
      failBeforeSend(t('te_err_invalid_recipient'))
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      failBeforeSend(t('te_err_amount'))
      return
    }
    if (!ZC_TOKEN_ID || !isValidHederaAccountId(ZC_TOKEN_ID)) {
      failBeforeSend(t('te_err_token_id'))
      return
    }
    if (!HEDERA_OPERATOR_ID || !isValidHederaAccountId(HEDERA_OPERATOR_ID)) {
      failBeforeSend(t('te_err_operator_id'))
      return
    }
    if (!operatorKeyRaw) {
      failBeforeSend(t('te_err_key_required'))
      return
    }

    let client
    setIsSendingAdminTransfer(true)
    setAdminTransferInfo({
      type: 'info',
      message: t('te_info_submitting'),
    })

    try {
      const {
        AccountId,
        Client,
        PrivateKey,
        TokenId,
        TransferTransaction,
      } = await import('@hashgraph/sdk')
      const operatorKey = parseHederaPrivateKey(PrivateKey, operatorKeyRaw)
      const operatorId = AccountId.fromString(HEDERA_OPERATOR_ID)
      const recipientId = AccountId.fromString(recipient)
      const tokenId = TokenId.fromString(ZC_TOKEN_ID)

      client = Client.forTestnet()
      client.setOperator(operatorId, operatorKey)

      const tx = new TransferTransaction()
        .addTokenTransfer(tokenId, operatorId, -amount)
        .addTokenTransfer(tokenId, recipientId, amount)

      const frozen = await tx.freezeWith(client)
      const signed = await frozen.sign(operatorKey)
      const submit = await signed.execute(client)
      const receipt = await submit.getReceipt(client)
      const txId = submit.transactionId?.toString?.() ?? '(unknown)'
      const receiptStatus = receipt.status?.toString?.() ?? String(receipt.status)

      if (receiptStatus !== 'SUCCESS') {
        throw new Error(t('te_err_transfer_status', { status: receiptStatus }))
      }

      setAdminTransferInfo({
        type: 'success',
        message: t('te_success_transfer', { txId }),
      })
    } catch (err) {
      const msg = err?.message || String(err)
      if (/TOKEN_NOT_ASSOCIATED_TO_ACCOUNT/i.test(msg)) {
        setAdminTransferInfo({
          type: 'error',
          message: t('te_err_not_associated'),
        })
      } else {
        setAdminTransferInfo({
          type: 'error',
          message: t('te_err_transfer', { msg }),
        })
      }
    } finally {
      client?.close?.()
      clearAdminOperatorKey()
      setIsSendingAdminTransfer(false)
    }
  }

  const handleFetchBalance = async () => {
    const acct = String(profile.hederaAccountId || '').trim()
    if (!acct) {
      setBalanceFetchInfo({
        type: 'error',
        message: t('te_err_enter_id'),
      })
      return
    }
    if (!isValidHederaAccountId(acct)) {
      setBalanceFetchInfo({
        type: 'error',
        message: t('te_err_invalid_account'),
      })
      return
    }

    setIsFetchingBalance(true)
    setBalanceFetchInfo({
      type: 'info',
      message: t('te_info_fetching'),
    })
    try {
      const result = await fetchZcTokenBalance(acct)
      const balance = clampNumber(result.balance)
      const tierKey = getTierByBalance(balance)
      const next = {
        ...profile,
        hederaAccountId: acct,
        tokenBalance: balance,
        tier: tierKey,
        lastCheckedAt: Date.now(),
      }
      saveTokenProfile(next)
      setProfile(next)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('zc-quota-changed'))
      }
      if (!result.hasToken) {
        setBalanceFetchInfo({
          type: 'warn',
          message: t('te_warn_no_balance'),
        })
      } else {
        setBalanceFetchInfo({
          type: 'success',
          message: t('te_success_fetched', { balance, network: result.network }),
        })
      }
    } catch (err) {
      let msg = t('te_err_fetch_failed')
      if (err instanceof MirrorNodeError) {
        if (err.code === 'invalid_account')
          msg = t('te_err_invalid_account')
        else if (err.code === 'not_found')
          msg = t('te_err_not_found')
        else if (err.code === 'network_error')
          msg = t('te_err_network')
        else msg = err.message
      } else if (err?.message) {
        msg = t('te_err_mirror', { msg: err.message })
      }
      setBalanceFetchInfo({ type: 'error', message: msg })
    } finally {
      setIsFetchingBalance(false)
    }
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
                {t('te_subscription_eyebrow')}
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[rgb(var(--zc-text))] sm:text-3xl">
                {t('te_title')}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-[rgb(var(--zc-muted))] sm:text-base">
                {t('te_intro')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={[
                  'rounded-lg px-3 py-1.5 text-xs font-semibold',
                  tierUi.badge,
                ].join(' ')}
              >
                {t('te_current')} {tierLabel(derived.tierKey)}
              </span>
              <span className="rounded-lg bg-[rgb(var(--zc-border)/0.45)] px-3 py-1.5 text-xs font-medium text-[rgb(var(--zc-muted))] ring-1 ring-[rgb(var(--zc-border))]">
                {derived.tokenBalance} ZC
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.35)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold uppercase tracking-wider text-[rgb(var(--zc-muted2))]">
              {t('te_token_id')}
            </span>
            <code className="rounded bg-[rgb(var(--zc-bg)/0.6)] px-2 py-0.5 font-mono text-[rgb(var(--zc-text))] ring-1 ring-[rgb(var(--zc-border))]">
              {ZC_TOKEN_ID || '—'}
            </code>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold uppercase tracking-wider text-[rgb(var(--zc-muted2))]">
              {t('te_network')}
            </span>
            <code className="rounded bg-[rgb(var(--zc-bg)/0.6)] px-2 py-0.5 font-mono text-[rgb(var(--zc-text))] ring-1 ring-[rgb(var(--zc-border))]">
              {ZC_TOKEN_NETWORK || '—'}
            </code>
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
            eyebrow={t('te_getting_started')}
            title={t('te_connect_wallet')}
            subtitle={t('te_connect_wallet_sub')}
          >
            <ol className="list-decimal space-y-2 pl-5 text-sm text-[rgb(var(--zc-muted))]">
              <li>{t('te_step_open_hashpack')}</li>
              <li>{t('te_step_create_testnet')}</li>
              <li>{t('te_step_copy_id')}</li>
              <li>{t('te_step_paste_id')}</li>
              <li>{t('te_step_click_fetch')}</li>
            </ol>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <a
                href="https://wallet.hashpack.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-md bg-indigo-500/20 px-4 py-2 text-sm font-medium text-indigo-300 ring-1 ring-indigo-500/30 transition hover:bg-indigo-500/30"
              >
                {t('te_open_hashpack')}
              </a>
            </div>
            <p className="mt-4 border-t border-[rgb(var(--zc-border))] pt-4 text-[11px] leading-relaxed text-[rgb(var(--zc-subtle))]">
              {t('te_privacy_note')}
            </p>
          </SectionCard>

          <SectionCard
            eyebrow={t('te_account_eyebrow')}
            title={t('te_token_profile')}
            subtitle={t('te_token_profile_sub')}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-[rgb(var(--zc-muted2))]">
                  {t('te_account_id')}
                </span>
                <input
                  type="text"
                  value={profile.hederaAccountId || ''}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, hederaAccountId: e.target.value }))
                  }
                  placeholder={HEDERA_OPERATOR_ID || '0.0.xxxxx'}
                  className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.5)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/45"
                />
                {HEDERA_OPERATOR_ID ? (
                  <span className="block text-[11px] text-[rgb(var(--zc-subtle))]">
                    {t('te_configured_operator')}{' '}
                    <code className="rounded bg-[rgb(var(--zc-bg)/0.6)] px-1.5 py-0.5 font-mono text-[rgb(var(--zc-muted))] ring-1 ring-[rgb(var(--zc-border))]">
                      {HEDERA_OPERATOR_ID}
                    </code>{' '}
                    ({HEDERA_NETWORK})
                  </span>
                ) : null}
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-medium text-[rgb(var(--zc-muted2))]">
                  {t('te_token_reference')}
                </span>
                <input
                  type="text"
                  value={profile.tokenId || ''}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, tokenId: e.target.value }))
                  }
                  placeholder={t('te_token_ref_placeholder')}
                  className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.5)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/45"
                />
              </label>

              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-xs font-medium text-[rgb(var(--zc-muted2))]">
                  {t('te_zc_balance')}
                </span>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div
                    className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.35)] px-3 py-2 text-sm tabular-nums text-[rgb(var(--zc-text))]"
                    role="status"
                    aria-live="polite"
                  >
                    {derived.tokenBalance} ZC
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleFetchBalance}
                      disabled={isFetchingBalance}
                      className="rounded-md bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-300 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                      title={t('te_fetch_balance_title')}
                    >
                      {isFetchingBalance ? t('te_fetching') : t('te_fetch_balance')}
                    </button>
                  </div>
                </div>
                <span className="block text-[11px] text-[rgb(var(--zc-subtle))]">
                  {t('te_balance_fetched_note')}
                </span>
                {balanceFetchInfo ? (
                  <span
                    className={[
                      'block text-[11px]',
                      balanceFetchInfo.type === 'success'
                        ? 'text-emerald-300'
                        : balanceFetchInfo.type === 'warn'
                          ? 'text-amber-300'
                          : balanceFetchInfo.type === 'error'
                            ? 'text-rose-300'
                            : 'text-[rgb(var(--zc-muted))]',
                    ].join(' ')}
                    role="status"
                  >
                    {balanceFetchInfo.message}
                  </span>
                ) : null}
                <span className="block text-[11px] text-[rgb(var(--zc-subtle))]">
                  {t('te_mirror_node_label')}{' '}
                  <code className="rounded bg-[rgb(var(--zc-bg)/0.6)] px-1.5 py-0.5 font-mono text-[rgb(var(--zc-muted))] ring-1 ring-[rgb(var(--zc-border))]">
                    {MIRROR_NODE_BASE_URL}
                  </code>
                </span>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[rgb(var(--zc-border))] pt-4">
              <button
                type="button"
                onClick={save}
                className="rounded-md bg-indigo-500/20 px-4 py-2 text-sm font-medium text-indigo-300 transition hover:bg-indigo-500/30"
              >
                {t('te_save_profile')}
              </button>
              <button
                type="button"
                onClick={clear}
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700"
              >
                {t('te_clear_profile')}
              </button>
              {profile.lastCheckedAt ? (
                <span className="text-xs text-[rgb(var(--zc-subtle))]">
                  {t('te_last_saved')} {new Date(profile.lastCheckedAt).toLocaleString()}
                </span>
              ) : (
                <span className="text-xs text-[rgb(var(--zc-subtle))]">
                  {t('te_not_saved')}
                </span>
              )}
            </div>
          </SectionCard>

          <SectionCard
            eyebrow={t('te_capabilities')}
            title={t('te_plan_capabilities')}
            subtitle={t('te_plan_capabilities_sub')}
          >
            <div className="flex flex-wrap gap-2">
              {CAPABILITY_ROWS.map(({ key, label, unlocked }) => (
                <FeatureBadge
                  key={key}
                  label={label}
                  unlocked={unlocked(derived.tier)}
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

          {isProjectAdmin ? (
            <SectionCard
              eyebrow={t('te_admin_eyebrow')}
              title={t('te_admin_distribution')}
              subtitle={t('te_admin_distribution_sub')}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-[rgb(var(--zc-muted2))]">
                    {t('te_recipient_id')}
                  </span>
                  <input
                    type="text"
                    value={adminTransferForm.recipient}
                    onChange={(e) =>
                      setAdminTransferForm((f) => ({
                        ...f,
                        recipient: e.target.value,
                      }))
                    }
                    placeholder="0.0.12345"
                    className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.5)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/45"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-[rgb(var(--zc-muted2))]">
                    {t('te_amount_zc')}
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="1"
                    value={adminTransferForm.amount}
                    onChange={(e) =>
                      setAdminTransferForm((f) => ({
                        ...f,
                        amount: e.target.value,
                      }))
                    }
                    placeholder="10"
                    className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.5)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/45"
                  />
                </label>
              </div>

              <label className="mt-3 block space-y-1.5">
                <span className="text-xs font-medium text-[rgb(var(--zc-muted2))]">
                  {t('te_operator_key')}
                </span>
                <input
                  ref={adminOperatorKeyRef}
                  type="password"
                  autoComplete="off"
                  placeholder={t('te_operator_key_placeholder')}
                  className="w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-bg)/0.5)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-2 focus:ring-indigo-500/45"
                />
                <span className="block text-[11px] text-[rgb(var(--zc-subtle))]">
                  {t('te_operator_key_note')}
                </span>
              </label>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleAdminTransfer}
                  disabled={isSendingAdminTransfer}
                  className="rounded-md bg-amber-500/15 px-3 py-2 text-xs font-medium text-amber-200 ring-1 ring-amber-500/30 transition hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                  title={t('te_send_zc_title')}
                >
                  {isSendingAdminTransfer ? t('te_sending') : t('te_send_zc')}
                </button>
                <span className="text-[11px] text-[rgb(var(--zc-subtle))]">
                  {t('te_token_label')} {ZC_TOKEN_ID || '—'} · {t('te_network')} {HEDERA_NETWORK}
                </span>
              </div>

              {adminTransferInfo ? (
                <div
                  className={[
                    'mt-3 rounded-md border px-3 py-2 text-[11px]',
                    adminTransferInfo.type === 'error'
                      ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                      : adminTransferInfo.type === 'success'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-200',
                  ].join(' ')}
                  role="status"
                >
                  <p>{adminTransferInfo.message}</p>
                </div>
              ) : null}

              <p className="mt-4 border-t border-[rgb(var(--zc-border))] pt-3 text-[11px] text-[rgb(var(--zc-subtle))]">
                {t('te_admin_footer')}
              </p>
            </SectionCard>
          ) : null}
        </div>

        <div className="space-y-6">
          <div
            className={[
              'rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.4)] p-4',
              tierUi.cardRing,
            ].join(' ')}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--zc-muted2))]">
              {t('te_active_plan')}
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xl font-semibold text-[rgb(var(--zc-text))]">
                  {tierLabel(derived.tierKey)}
                </p>
                <p className="mt-1 text-xs text-[rgb(var(--zc-subtle))]">
                  {t('te_from_ge', { min: derived.tier.minBalance })}
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
            eyebrow={t('te_usage')}
            title={t('te_quota_utilization')}
            subtitle={t('te_quota_utilization_sub')}
          >
            <div className="space-y-3">
              {quotaCards.map((q) => (
                <div key={q.key}>
                  <QuotaBar
                    used={q.used}
                    limit={q.limit}
                    label={t(QUOTA_LABELS[q.key])}
                  />
                  <p className="mt-2 text-[11px] leading-relaxed text-[rgb(var(--zc-muted))]">
                    {getQuotaMessage(
                      {
                        ...profile,
                        tier: derived.tierKey,
                        tokenBalance: derived.tokenBalance,
                      },
                      q.key,
                      t,
                    )}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-[rgb(var(--zc-border))] pt-4">
              <p className="text-[11px] text-[rgb(var(--zc-subtle))]">
                {t('te_storage_keys')} <code className="text-[rgb(var(--zc-muted))]">zc-token-profile-v1::user</code>,{' '}
                <code className="text-[rgb(var(--zc-muted))]">zc-quota-usage-v1::user</code>
              </p>
              <button
                type="button"
                onClick={() => setUsage(getQuotaUsage())}
                className="rounded-md bg-[rgb(var(--zc-border)/0.35)] px-3 py-2 text-xs font-medium text-[rgb(var(--zc-muted))] transition hover:bg-[rgb(var(--zc-border)/0.55)] hover:text-[rgb(var(--zc-text))]"
              >
                {t('te_refresh')}
              </button>
            </div>
          </SectionCard>
        </div>
      </div>

      <SectionCard
        eyebrow={t('te_compare_eyebrow')}
        title={t('te_comparison_title')}
        subtitle={t('te_comparison_sub')}
      >
        <div className="overflow-x-auto rounded-lg border border-[rgb(var(--zc-border))]">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b-2 border-[rgb(var(--zc-border))]">
                <th className="sticky left-0 z-10 bg-[rgb(var(--zc-panel))] px-3 py-3 text-sm font-semibold text-[rgb(var(--zc-text))]">
                  {t('te_feature')}
                </th>
                {TIER_KEYS.map((tk) => {
                  const ui = TIER_UI[tk]
                  const active = derived.tierKey === tk
                  return (
                    <th
                      key={tk}
                      className={[
                        'border-l border-[rgb(var(--zc-border)/0.4)] px-3 py-3 text-center text-sm font-bold',
                        ui.columnHead,
                        active ? 'ring-2 ring-indigo-400/40' : '',
                      ].join(' ')}
                    >
                      {tierLabel(tk)}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row, idx) => (
                <tr
                  key={`${row.label}-${idx}`}
                  className="border-b border-[rgb(var(--zc-border)/0.5)] last:border-0"
                >
                  <td className="sticky left-0 z-10 bg-[rgb(var(--zc-bg))] px-3 py-3 text-sm font-medium text-[rgb(var(--zc-text))]">
                    {t(row.label)}
                  </td>
                  {TIER_KEYS.map((tk) => {
                    const included = tierIncludesFeature(tk, row.introTier)
                    const isCurrentCol = derived.tierKey === tk
                    return (
                      <td
                        key={tk}
                        className={[
                          'border-l border-[rgb(var(--zc-border)/0.4)] px-2 py-3 text-center',
                          isCurrentCol ? 'bg-indigo-500/15' : '',
                        ].join(' ')}
                      >
                        {included ? (
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white font-bold ring-1 ring-emerald-700">
                            ✓
                          </span>
                        ) : (
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-400 text-white ring-1 ring-slate-500">
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
          {t('te_comparison_footnote')}
        </p>
      </SectionCard>
    </section>
  )
}
