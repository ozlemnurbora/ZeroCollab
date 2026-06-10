import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { addLogEntry } from './logService.js'
import { fetchUserMemberProjectIds } from './logRemoteStorage.js'
import { setTokenProfileUser } from './tokenEconomics/tokenProfileStorage.js'
import { setQuotaUsageUser } from './tokenEconomics/quotaUsageStorage.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Write an auth event (login/logout) to the shared trail of EVERY project the
  // user belongs to, so members see each other's sign-ins. Falls back to a
  // personal/local-only log when the user is in no projects. Never throws.
  const logAuthEvent = async (authUser, action, severity) => {
    if (!authUser?.id) return
    const email = authUser.email || ''
    const base = {
      action,
      category: 'auth',
      severity,
      message:
        action === 'auth.logout'
          ? email
            ? `Signed out ${email}`
            : 'Signed out'
          : `Signed in as ${email}`,
      userName: email.split('@')[0] || '',
      userId: authUser.id,
      entityType: 'auth',
    }
    const projectIds = await fetchUserMemberProjectIds(authUser.id)
    const awaitRemote = action === 'auth.logout'
    const logOptions = awaitRemote ? { awaitRemote: true } : undefined
    if (projectIds.length === 0) {
      // Not a member of any project — keep it local/personal only.
      if (awaitRemote) {
        await addLogEntry({ ...base, projectId: null }, logOptions)
      } else {
        void addLogEntry({ ...base, projectId: null })
      }
      return
    }
    // One synced, project-scoped log per member project.
    if (awaitRemote) {
      await Promise.all(
        projectIds.map((pid) => addLogEntry({ ...base, projectId: pid }, logOptions)),
      )
    } else {
      for (const pid of projectIds) {
        void addLogEntry({ ...base, projectId: pid })
      }
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
      // Log the login of a resumed session once per browser-tab session so it
      // isn't re-logged on every refresh/HMR. The form-login path sets the same
      // flag, preventing a duplicate on the next getSession.
      if (session?.user) {
        try {
          const key = 'zc-auth-session-logged-' + session.user.id
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, '1')
            void logAuthEvent(session.user, 'auth.login', 'info')
          }
        } catch {
          // sessionStorage unavailable — skip resumed-session logging.
        }
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    setTokenProfileUser(user?.id ?? null)
    setQuotaUsageUser(user?.id ?? null)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('zc-quota-changed'))
    }
  }, [user])

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    // Mark this session as already-logged so the getSession on the next refresh
    // doesn't log a duplicate login.
    try {
      sessionStorage.setItem('zc-auth-session-logged-' + (data?.user?.id ?? ''), '1')
    } catch {
      // ignore
    }
    await logAuthEvent(data?.user, 'auth.login', 'info')
  }

  const signUp = async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
  }

  const signOut = async () => {
    const currentUser = user
    const currentUserId = user?.id ?? null
    // Log BEFORE signing out: the membership query and per-project inserts need
    // the user to still be authenticated (RLS). Never log after signOut.
    await logAuthEvent(currentUser, 'auth.logout', 'info')
    await supabase.auth.signOut()
    // Clear the session-logged flag so signing back in is logged again.
    try {
      sessionStorage.removeItem('zc-auth-session-logged-' + (currentUserId ?? ''))
    } catch {
      // ignore
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
