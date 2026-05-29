import { useCallback, useEffect, useState } from 'react'
import { getToken, setToken as persistToken } from '@/lib/api'

/**
 * useAuth tracks whether a JWT is in localStorage.
 *
 * For Hari 1 we only care about presence/absence — full user profile fetching
 * comes Hari 2 when /auth/login wires up.
 */
export function useAuth() {
  const [token, setTokenState] = useState<string | null>(getToken())

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'videoconf.token') setTokenState(e.newValue)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const login = useCallback((t: string) => {
    persistToken(t)
    setTokenState(t)
  }, [])

  const logout = useCallback(() => {
    persistToken(null)
    setTokenState(null)
  }, [])

  return { token, isAuthenticated: !!token, login, logout }
}
