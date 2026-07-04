import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocalParticipant } from '@livekit/components-react'
import { LocalVideoTrack, Track } from 'livekit-client'
import {
  BackgroundProcessor,
  supportsBackgroundProcessors,
  type BackgroundProcessorWrapper,
} from '@livekit/track-processors'

export type BackgroundEffect =
  | { kind: 'none' }
  | { kind: 'blur'; radius: number }
  | { kind: 'image'; url: string; label?: string }

const STORAGE_KEY = 'videoconf.bgEffect'
const DEFAULT_BLUR_RADIUS = 12

function readStored(): BackgroundEffect {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { kind: 'none' }
    const parsed = JSON.parse(raw) as BackgroundEffect
    if (parsed.kind === 'blur' || parsed.kind === 'image' || parsed.kind === 'none') {
      return parsed
    }
    return { kind: 'none' }
  } catch {
    return { kind: 'none' }
  }
}

type Ctx = {
  effect: BackgroundEffect
  /** Whether the browser supports background processors at all. */
  supported: boolean
  /** True while applying/switching — UI disables controls during this. */
  busy: boolean
  setEffect: (next: BackgroundEffect) => void
  /** Convenience setters. */
  setBlur: (on: boolean, radius?: number) => void
  setImage: (url: string, label?: string) => void
  clear: () => void
}

const BackgroundEffectContext = createContext<Ctx | null>(null)

/**
 * Manages the local participant's camera background processor (blur / virtual
 * image / none). The processor instance is a singleton per provider mount and
 * applied to whatever Track.Source.Camera publication exists, including newly
 * created ones after a track restart.
 *
 * Persists the preference to localStorage so a refresh re-applies it.
 *
 * Skips entirely when the browser can't run MediaPipe selfie segmentation —
 * `supported = false` then, and UI should disable the controls.
 */
export function BackgroundEffectProvider({ children }: { children: ReactNode }) {
  const { localParticipant } = useLocalParticipant()
  const [effect, setEffectState] = useState<BackgroundEffect>(() => readStored())
  const [busy, setBusy] = useState(false)
  const [supported] = useState(() =>
    typeof window === 'undefined' ? false : supportsBackgroundProcessors(),
  )
  const processorRef = useRef<BackgroundProcessorWrapper | null>(null)

  const persist = useCallback((next: BackgroundEffect) => {
    if (next.kind === 'none') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }, [])

  // Apply the current effect to the local camera track. Re-runs when the
  // effect, the participant, or its camera publication changes.
  useEffect(() => {
    if (!supported) return
    if (!localParticipant) return

    const pub = localParticipant.getTrackPublication(Track.Source.Camera)
    const track = pub?.track
    if (!track || !(track instanceof LocalVideoTrack)) return

    let cancelled = false
    setBusy(true)

    const run = async () => {
      try {
        if (effect.kind === 'none') {
          if (processorRef.current) {
            await track.stopProcessor()
          }
          return
        }

        // Lazily create or reuse the singleton processor instance.
        if (!processorRef.current) {
          processorRef.current = BackgroundProcessor(
            effect.kind === 'blur'
              ? { mode: 'background-blur', blurRadius: effect.radius }
              : { mode: 'virtual-background', imagePath: effect.url },
          )
        }

        if (track.getProcessor() !== processorRef.current) {
          await track.setProcessor(processorRef.current)
        }
        // Always call switchTo so the processor honors the desired mode even if
        // the wrapper was constructed earlier with a different one.
        await processorRef.current.switchTo(
          effect.kind === 'blur'
            ? { mode: 'background-blur', blurRadius: effect.radius }
            : { mode: 'virtual-background', imagePath: effect.url },
        )
      } catch (err) {
        console.warn('[bg-effect] failed to apply:', err)
      } finally {
        if (!cancelled) setBusy(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
    // Re-run when the camera publication identity changes too — pub.trackSid
    // suffices because LK reuses the publication object across track restarts
    // but its sid does change.
  }, [effect, localParticipant, localParticipant?.getTrackPublication(Track.Source.Camera)?.trackSid, supported])

  const setEffect = useCallback(
    (next: BackgroundEffect) => {
      setEffectState(next)
      persist(next)
    },
    [persist],
  )

  const setBlur = useCallback(
    (on: boolean, radius = DEFAULT_BLUR_RADIUS) => {
      setEffect(on ? { kind: 'blur', radius } : { kind: 'none' })
    },
    [setEffect],
  )

  const setImage = useCallback(
    (url: string, label?: string) => {
      setEffect({ kind: 'image', url, label })
    },
    [setEffect],
  )

  const clear = useCallback(() => setEffect({ kind: 'none' }), [setEffect])

  return (
    <BackgroundEffectContext.Provider
      value={{ effect, supported, busy, setEffect, setBlur, setImage, clear }}
    >
      {children}
    </BackgroundEffectContext.Provider>
  )
}

export function useBackgroundEffect(): Ctx {
  const ctx = useContext(BackgroundEffectContext)
  if (!ctx) {
    // No-op fallback for components outside the provider.
    return {
      effect: { kind: 'none' },
      supported: false,
      busy: false,
      setEffect: () => {},
      setBlur: () => {},
      setImage: () => {},
      clear: () => {},
    }
  }
  return ctx
}
