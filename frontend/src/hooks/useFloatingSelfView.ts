import { useCallback, useEffect, useState } from 'react'

const ENABLED_KEY = 'videoconf.floatSelfView'
const POS_KEY = 'videoconf.floatSelfViewPos'

export type FloatPos = { right: number; bottom: number }

const DEFAULT_POS: FloatPos = { right: 16, bottom: 80 }

function readPos(): FloatPos {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (!raw) return DEFAULT_POS
    const parsed = JSON.parse(raw) as Partial<FloatPos>
    if (typeof parsed.right === 'number' && typeof parsed.bottom === 'number') {
      return { right: parsed.right, bottom: parsed.bottom }
    }
  } catch {
    // fall through
  }
  return DEFAULT_POS
}

/**
 * Manages the "floating self-view" preference + position. When enabled,
 * `SelfViewFloater` lifts the local participant's LK tile out of the grid
 * and pins it to a draggable, persisted corner.
 */
export function useFloatingSelfView() {
  const [enabled, setEnabledState] = useState<boolean>(
    () => localStorage.getItem(ENABLED_KEY) === '1',
  )
  const [pos, setPosState] = useState<FloatPos>(() => readPos())

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on)
    localStorage.setItem(ENABLED_KEY, on ? '1' : '0')
  }, [])

  const setPos = useCallback((p: FloatPos) => {
    setPosState(p)
    localStorage.setItem(POS_KEY, JSON.stringify(p))
  }, [])

  // Echo changes back to <html data-float-self> so CSS rules can apply
  // without re-rendering every tile.
  useEffect(() => {
    document.documentElement.setAttribute('data-float-self', enabled ? '1' : '0')
  }, [enabled])

  return { enabled, setEnabled, pos, setPos }
}
