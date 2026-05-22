import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { addLogEntry } from './logService.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    void addLogEntry({
      action: 'auth.login',
      category: 'auth',
      severity: 'info',
      message: `Signed in as ${email}`,
      userName: email?.split('@')[0] || '',
      entityType: 'auth',
    })
  }

  const signUp = async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
  }

  const signOut = async () => {
    const currentEmail = user?.email || ''
    await supabase.auth.signOut()
    void addLogEntry({
      action: 'auth.logout',
      category: 'auth',
      severity: 'info',
      message: currentEmail ? `Signed out ${currentEmail}` : 'Signed out',
      userName: currentEmail?.split('@')[0] || '',
      entityType: 'auth',
    })
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
