import { useEffect, useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../utils/AuthContext.jsx'
import { useLanguage } from '../utils/LanguageContext.jsx'
import { supabase } from '../utils/supabase.js'

const inputClass =
  'w-full rounded-md border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel)/0.6)] px-3 py-2 text-sm text-[rgb(var(--zc-text))] placeholder:text-[rgb(var(--zc-subtle))] focus:outline-none focus:ring-1 focus:ring-indigo-500/50'

const inputWithToggleClass = `${inputClass} pr-10`

function validatePassword(password) {
  const errors = []
  if (password.length < 8) errors.push('At least 8 characters')
  if (!/[A-Z]/.test(password)) errors.push('At least one uppercase letter')
  if (!/[0-9]/.test(password)) errors.push('At least one number')
  return errors
}

function EyeOpenIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function SignUpFormFields({
  loading,
  t,
  signUpEmail,
  setSignUpEmail,
  signUpPassword,
  setSignUpPassword,
  confirmPassword,
  setConfirmPassword,
  showPassword,
  setShowPassword,
  showConfirmPassword,
  setShowConfirmPassword,
  onSubmit,
}) {
  const passwordFieldId = useId()
  const confirmFieldId = useId()
  const passwordName = `password-${passwordFieldId}`
  const confirmName = `password-confirm-${confirmFieldId}`

  const passErrors = validatePassword(signUpPassword)
  const passwordsMatch =
    signUpPassword.length > 0 && confirmPassword.length > 0 && signUpPassword === confirmPassword
  const signUpSubmitDisabled =
    loading ||
    !signUpEmail.trim() ||
    passErrors.length > 0 ||
    signUpPassword !== confirmPassword

  return (
    <form onSubmit={onSubmit} className="space-y-4" autoComplete="off" data-lpignore="true">
      <input type="text" style={{ display: 'none' }} />
      <input type="password" style={{ display: 'none' }} />
      <div>
        <label htmlFor="auth-email-up" className="mb-1 block text-xs font-medium text-[rgb(var(--zc-muted2))]">
          Email
        </label>
        <input
          key="signup-email"
          type="text"
          autoComplete="off"
          data-lpignore="true"
          data-form-type="other"
          name="signup-email-field"
          placeholder="Email"
          value={signUpEmail}
          onChange={(e) => setSignUpEmail(e.target.value)}
          id="auth-email-up"
          required
          className={inputClass}
          disabled={loading}
        />
      </div>
      <div>
        <label htmlFor="auth-password-up" className="mb-1 block text-xs font-medium text-[rgb(var(--zc-muted2))]">
          Password
        </label>
        <div className="relative">
          <input
            key="signup-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            readOnly
            onFocus={(e) => e.target.removeAttribute('readonly')}
            value={signUpPassword}
            onChange={(e) => setSignUpPassword(e.target.value)}
            data-lpignore="true"
            data-form-type="other"
            name={passwordName}
            id="auth-password-up"
            required
            className={inputWithToggleClass}
            disabled={loading}
          />
          <button
            type="button"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center justify-center text-[rgb(var(--zc-muted2))] hover:text-[rgb(var(--zc-text))]"
            onClick={() => setShowPassword((v) => !v)}
            disabled={loading}
          >
            {showPassword ? <EyeOpenIcon /> : <EyeOffIcon />}
          </button>
        </div>
        {signUpPassword.length > 0 ? (
          <div className="mt-2 space-y-1">
            {[
              { key: 'auth_pass_length', met: signUpPassword.length >= 8 },
              { key: 'auth_pass_uppercase', met: /[A-Z]/.test(signUpPassword) },
              { key: 'auth_pass_number', met: /[0-9]/.test(signUpPassword) },
            ].map((req) => (
              <p
                key={req.key}
                className={`text-xs flex items-center gap-1 ${req.met ? 'text-emerald-400' : 'text-rose-400'}`}
              >
                <span>{req.met ? '✓' : '✗'}</span>
                {t(req.key)}
              </p>
            ))}
          </div>
        ) : null}
      </div>
      <div>
        <label htmlFor="auth-password-confirm" className="mb-1 block text-xs font-medium text-[rgb(var(--zc-muted2))]">
          Confirm password
        </label>
        <div className="relative">
          <input
            key="signup-password-confirm"
            type={showConfirmPassword ? 'text' : 'password'}
            autoComplete="new-password"
            readOnly
            onFocus={(e) => e.target.removeAttribute('readonly')}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            data-lpignore="true"
            data-form-type="other"
            name={confirmName}
            id="auth-password-confirm"
            required
            className={inputWithToggleClass}
            disabled={loading}
          />
          <button
            type="button"
            aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
            className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center justify-center text-[rgb(var(--zc-muted2))] hover:text-[rgb(var(--zc-text))]"
            onClick={() => setShowConfirmPassword((v) => !v)}
            disabled={loading}
          >
            {showConfirmPassword ? <EyeOpenIcon /> : <EyeOffIcon />}
          </button>
        </div>
        {confirmPassword.length > 0 && signUpPassword.length > 0 ? (
          <p
            className={`mt-2 text-xs flex items-center gap-1 ${passwordsMatch ? 'text-emerald-400' : 'text-rose-400'}`}
          >
            <span>{passwordsMatch ? '✓' : '✗'}</span>
            {passwordsMatch ? t('auth_pass_match') : t('auth_pass_no_match')}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={signUpSubmitDisabled}
        className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? 'Creating account…' : 'Sign Up'}
      </button>
    </form>
  )
}

export function AuthPage() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const { signIn, signUp } = useAuth()
  const [view, setView] = useState('signin')
  const [signupFormKey, setSignupFormKey] = useState(0)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signUpEmail, setSignUpEmail] = useState('')
  const [signUpPassword, setSignUpPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [forgotSuccess, setForgotSuccess] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  useEffect(() => {
    if (view === 'signup') {
      setSignUpEmail('')
      setSignUpPassword('')
      setConfirmPassword('')
      setShowPassword(false)
      setShowConfirmPassword(false)
      setSignupFormKey((k) => k + 1)
    }
  }, [view])

  const resetMessages = () => {
    setError(null)
    setInfo(null)
    setForgotSuccess(null)
  }

  const handleSignIn = async (e) => {
    e.preventDefault()
    resetMessages()
    setLoading(true)
    try {
      await signIn(email.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err?.message ?? 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async (e) => {
    e.preventDefault()
    resetMessages()
    if (!signUpEmail.trim()) return
    if (signUpPassword !== confirmPassword) {
      setError(t('auth_pass_no_match'))
      return
    }
    const pwErrors = validatePassword(signUpPassword)
    if (pwErrors.length > 0) {
      if (signUpPassword.length < 8) setError(t('auth_pass_length'))
      else if (!/[A-Z]/.test(signUpPassword)) setError(t('auth_pass_uppercase'))
      else setError(t('auth_pass_number'))
      return
    }
    setLoading(true)
    try {
      await signUp(signUpEmail.trim(), signUpPassword)
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        navigate('/', { replace: true })
      } else {
        setInfo('Check your email to confirm your account, then sign in.')
      }
    } catch (err) {
      setError(err?.message ?? 'Sign up failed')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    if (!resetEmail.trim()) return
    setLoading(true)
    setError(null)
    setForgotSuccess(null)
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (resetErr) throw resetErr
      setForgotSuccess(t('auth_reset_sent'))
      setResetEmail('')
    } catch (err) {
      setError(err?.message ?? 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  const tabBtn = (id, label) => (
    <button
      key={id}
      type="button"
      onClick={() => {
        setView(id)
        resetMessages()
      }}
      className={[
        'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        view === id
          ? 'bg-[rgb(var(--zc-border))] text-[rgb(var(--zc-text))]'
          : 'text-[rgb(var(--zc-muted))] hover:text-[rgb(var(--zc-text))]',
      ].join(' ')}
    >
      {label}
    </button>
  )

  return (
    <div className="min-h-screen bg-[rgb(var(--zc-bg))] text-[rgb(var(--zc-text))] flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-indigo-500 flex items-center justify-center text-sm font-bold text-white">
              ZC
            </div>
            <span className="text-xl font-semibold tracking-tight">ZeroCollab</span>
          </div>
        </div>

        <div className="rounded-xl border border-[rgb(var(--zc-border))] bg-[rgb(var(--zc-panel))] p-6 shadow-lg">
          {view !== 'forgot' ? (
            <div className="mb-6 flex gap-1 rounded-lg bg-[rgb(var(--zc-bg))] p-1">
              {tabBtn('signin', 'Sign In')}
              {tabBtn('signup', 'Sign Up')}
            </div>
          ) : null}

          {error ? (
            <p className="mb-4 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          ) : null}
          {forgotSuccess ? (
            <p className="mb-4 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              {forgotSuccess}
            </p>
          ) : null}
          {info ? (
            <p className="mb-4 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              {info}
            </p>
          ) : null}

          {view === 'forgot' ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-[rgb(var(--zc-text))]">{t('auth_reset_title')}</h2>
                <p className="mt-1 text-sm text-[rgb(var(--zc-muted2))]">{t('auth_reset_subtitle')}</p>
              </div>
              <div>
                <label htmlFor="auth-reset-email" className="mb-1 block text-xs font-medium text-[rgb(var(--zc-muted2))]">
                  Email
                </label>
                <input
                  id="auth-reset-email"
                  type="email"
                  autoComplete="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className={inputClass}
                  disabled={loading}
                />
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleForgotPassword()}
                className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? '…' : t('auth_reset_send')}
              </button>
              <p className="text-center text-sm">
                <button
                  type="button"
                  className="text-indigo-300 hover:text-indigo-200 hover:underline"
                  onClick={() => {
                    setView('signin')
                    resetMessages()
                    setResetEmail('')
                  }}
                >
                  {t('auth_back_signin')}
                </button>
              </p>
            </div>
          ) : view === 'signin' ? (
            <form key="signin-form" onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label htmlFor="auth-email-in" className="mb-1 block text-xs font-medium text-[rgb(var(--zc-muted2))]">
                  Email
                </label>
                <input
                  id="auth-email-in"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  disabled={loading}
                />
              </div>
              <div>
                <label htmlFor="auth-password-in" className="mb-1 block text-xs font-medium text-[rgb(var(--zc-muted2))]">
                  Password
                </label>
                <input
                  id="auth-password-in"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  disabled={loading}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
              <p className="text-center text-sm">
                <button
                  type="button"
                  className="text-indigo-300 hover:text-indigo-200 hover:underline"
                  onClick={() => {
                    setView('forgot')
                    resetMessages()
                    setResetEmail('')
                  }}
                >
                  {t('auth_forgot_password')}
                </button>
              </p>
            </form>
          ) : (
            <div key={`signup-form-${view}`}>
              <SignUpFormFields
                key={signupFormKey}
                loading={loading}
                t={t}
                signUpEmail={signUpEmail}
                setSignUpEmail={setSignUpEmail}
                signUpPassword={signUpPassword}
                setSignUpPassword={setSignUpPassword}
                confirmPassword={confirmPassword}
                setConfirmPassword={setConfirmPassword}
                showPassword={showPassword}
                setShowPassword={setShowPassword}
                showConfirmPassword={showConfirmPassword}
                setShowConfirmPassword={setShowConfirmPassword}
                onSubmit={handleSignUp}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
