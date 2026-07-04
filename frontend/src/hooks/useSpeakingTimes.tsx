import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useParticipants } from '@livekit/components-react'

const TICK_MS = 1000

type Ctx = {
  /** identity → cumulative speaking seconds since the meeting started. */
  times: Record<string, number>
}

const SpeakingTimesContext = createContext<Ctx | null>(null)

/**
 * Accumulates per-participant speaking time by sampling LiveKit's `isSpeaking`
 * flag once per second. Wraps the whole in-room subtree so ParticipantsPanel
 * (and anywhere else) can read the totals.
 *
 * Resets when the provider remounts — which happens when LiveKitRoom reconnects.
 * That's the desired semantics: a fresh meeting starts a fresh tally.
 */
export function SpeakingTimesProvider({ children }: { children: ReactNode }) {
  const participants = useParticipants()
  const [times, setTimes] = useState<Record<string, number>>({})
  // Latest-snapshot ref keeps the interval closure off the participants prop
  // identity, which would tear down/re-create the timer on every render.
  const snapRef = useRef<typeof participants>(participants)
  snapRef.current = participants

  useEffect(() => {
    const id = window.setInterval(() => {
      setTimes((prev) => {
        let changed = false
        const next = { ...prev }
        for (const p of snapRef.current) {
          if (p.isSpeaking) {
            next[p.identity] = (next[p.identity] ?? 0) + 1
            changed = true
          }
        }
        return changed ? next : prev
      })
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [])

  return (
    <SpeakingTimesContext.Provider value={{ times }}>{children}</SpeakingTimesContext.Provider>
  )
}

export function useSpeakingTimes(): Ctx {
  const ctx = useContext(SpeakingTimesContext)
  if (!ctx) return { times: {} }
  return ctx
}

/** Format seconds as "Xm Ys" or "Ys" when under a minute. */
export function formatSpeakingTime(sec: number): string {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s === 0 ? `${m}m` : `${m}m ${s}s`
}
