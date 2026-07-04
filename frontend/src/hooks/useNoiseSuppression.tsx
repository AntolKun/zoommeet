import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocalParticipant } from '@livekit/components-react'
import { LocalAudioTrack, Track } from 'livekit-client'
import {
  KrispNoiseFilter,
  isKrispNoiseFilterSupported,
  type KrispNoiseFilterProcessor,
} from '@livekit/krisp-noise-filter'

const STORAGE_KEY = 'videoconf.noiseSuppression'

type Ctx = {
  enabled: boolean
  supported: boolean
  busy: boolean
  toggle: () => void
  setEnabled: (on: boolean) => void
}

const NoiseSuppressionContext = createContext<Ctx | null>(null)

/**
 * LiveKit's Krisp noise-suppression wrapper applied to the local mic track.
 * Removes background hum, keyboard clicks, fan noise, etc. Persists to
 * localStorage so the preference survives a refresh.
 *
 * One singleton processor instance per provider mount — reapplied when the
 * mic track restarts (e.g. user switches device).
 *
 * Skips entirely on browsers where Krisp doesn't load (mostly Safari < 17.4).
 */
export function NoiseSuppressionProvider({ children }: { children: ReactNode }) {
  const { localParticipant } = useLocalParticipant()
  const [supported] = useState(() =>
    typeof window === 'undefined' ? false : isKrispNoiseFilterSupported(),
  )
  const [enabled, setEnabledState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(STORAGE_KEY) === '1'
  })
  const [busy, setBusy] = useState(false)
  const processorRef = useRef<KrispNoiseFilterProcessor | null>(null)

  useEffect(() => {
    if (!supported || !localParticipant) return
    const pub = localParticipant.getTrackPublication(Track.Source.Microphone)
    const track = pub?.track
    if (!track || !(track instanceof LocalAudioTrack)) return

    let cancelled = false
    setBusy(true)
    const run = async () => {
      try {
        if (!enabled) {
          if (processorRef.current) {
            await track.stopProcessor()
          }
          return
        }

        if (!processorRef.current) {
          processorRef.current = KrispNoiseFilter()
        }
        if (track.getProcessor() !== processorRef.current) {
          await track.setProcessor(processorRef.current)
        }
        await processorRef.current.setEnabled(true)
      } catch (err) {
        console.warn('[noise-suppression] failed:', err)
      } finally {
        if (!cancelled) setBusy(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [
    enabled,
    localParticipant,
    localParticipant?.getTrackPublication(Track.Source.Microphone)?.trackSid,
    supported,
  ])

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on)
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0')
  }, [])

  const toggle = useCallback(() => setEnabled(!enabled), [enabled, setEnabled])

  return (
    <NoiseSuppressionContext.Provider value={{ enabled, supported, busy, toggle, setEnabled }}>
      {children}
    </NoiseSuppressionContext.Provider>
  )
}

export function useNoiseSuppression(): Ctx {
  const ctx = useContext(NoiseSuppressionContext)
  if (!ctx) {
    return { enabled: false, supported: false, busy: false, toggle: () => {}, setEnabled: () => {} }
  }
  return ctx
}
