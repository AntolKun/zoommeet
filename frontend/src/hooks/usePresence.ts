import { useCallback, useEffect, useState } from 'react'
import { useLocalParticipant } from '@livekit/components-react'

export type Presence = 'online' | 'away' | 'busy' | 'dnd'

export const PRESENCE_VALUES: Presence[] = ['online', 'away', 'busy', 'dnd']
export const PRESENCE_ATTR = 'presence'

const STORAGE_KEY = 'videoconf.presence'

function readStored(): Presence {
  const v = localStorage.getItem(STORAGE_KEY)
  if (v && (PRESENCE_VALUES as string[]).includes(v)) return v as Presence
  return 'online'
}

/**
 * Local presence preference, broadcast to other participants via LiveKit
 * attribute `presence`. Persists in localStorage so a refresh restores it.
 *
 * Pure UX signal — nothing enforces "DND means won't be paged"; treat it as
 * a polite hint for other participants.
 */
export function usePresence() {
  const { localParticipant } = useLocalParticipant()
  const [presence, setPresenceState] = useState<Presence>(() => readStored())

  // Push current presence to the LK attribute whenever it (or the participant) changes.
  useEffect(() => {
    if (!localParticipant) return
    if (localParticipant.attributes?.[PRESENCE_ATTR] === presence) return
    localParticipant.setAttributes({ [PRESENCE_ATTR]: presence }).catch(() => {})
  }, [localParticipant, presence])

  const setPresence = useCallback((next: Presence) => {
    setPresenceState(next)
    localStorage.setItem(STORAGE_KEY, next)
  }, [])

  return { presence, setPresence }
}

/** Reads a participant's broadcasted presence — defaults to 'online' when absent. */
export function readPresence(attrs?: Record<string, string>): Presence {
  const v = attrs?.[PRESENCE_ATTR]
  if (v && (PRESENCE_VALUES as string[]).includes(v)) return v as Presence
  return 'online'
}

/** CSS variable color for a given presence — keeps the palette centralized. */
export function presenceColor(p: Presence): string {
  switch (p) {
    case 'online':
      return 'var(--color-ok)'
    case 'away':
      return 'var(--color-flame)'
    case 'busy':
      return 'var(--color-flame-deep)'
    case 'dnd':
      return 'var(--color-bad)'
  }
}
