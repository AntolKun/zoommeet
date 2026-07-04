import { useCallback, useContext, useEffect, useState, createContext, type ReactNode } from 'react'

const STORAGE_KEY = 'videoconf.localPin' // session-scoped — cleared when tab closes

export type LocalPinState = {
  identity: string | null
  name: string | null
}

const EMPTY: LocalPinState = { identity: null, name: null }

type Ctx = {
  pin: LocalPinState
  setPin: (identity: string | null, name: string | null) => void
  clear: () => void
}

const LocalPinContext = createContext<Ctx | null>(null)

/**
 * Local-only "pin participant" — focuses a single tile in this client's view
 * without broadcasting to anyone. Different from Spotlight which the host
 * broadcasts to everyone. Persists to sessionStorage so a refresh doesn't drop
 * the pin while staying in the same room.
 *
 * Pin is mutually exclusive: pinning a new identity replaces the old one.
 * Toggling the same identity clears the pin.
 */
export function LocalPinProvider({ children }: { children: ReactNode }) {
  const [pin, setPinState] = useState<LocalPinState>(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (!raw) return EMPTY
      const parsed = JSON.parse(raw) as LocalPinState
      return parsed.identity ? parsed : EMPTY
    } catch {
      return EMPTY
    }
  })

  useEffect(() => {
    if (pin.identity) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pin))
    } else {
      sessionStorage.removeItem(STORAGE_KEY)
    }
  }, [pin])

  const setPin = useCallback((identity: string | null, name: string | null) => {
    setPinState((prev) => {
      // Toggle off when clicking the same one.
      if (identity && prev.identity === identity) return EMPTY
      return { identity, name }
    })
  }, [])

  const clear = useCallback(() => setPinState(EMPTY), [])

  return (
    <LocalPinContext.Provider value={{ pin, setPin, clear }}>
      {children}
    </LocalPinContext.Provider>
  )
}

export function useLocalPin(): Ctx {
  const ctx = useContext(LocalPinContext)
  if (!ctx) {
    // Gracefully degrade for components mounted outside the provider — pin is
    // a no-op rather than a hard crash.
    return { pin: EMPTY, setPin: () => {}, clear: () => {} }
  }
  return ctx
}
