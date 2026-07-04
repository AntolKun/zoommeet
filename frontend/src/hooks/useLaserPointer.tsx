import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useLocalParticipant, useRoomContext } from '@livekit/components-react'
import { RoomEvent } from 'livekit-client'
import {
  POINTER_TOPIC,
  decodePointer,
  encodePointer,
  type PointerPayload,
} from '@/lib/pointerProtocol'

const STALE_MS = 600 // remove a pointer if no update arrives within this window
const BROADCAST_INTERVAL_MS = 33 // ~30 Hz cap on outbound traffic

export type RemotePointer = PointerPayload & { ts: number }

type Ctx = {
  /** Whether the local user has pointer mode ON. */
  enabled: boolean
  /** Toggle pointer mode for the local user. */
  toggle: () => void
  setEnabled: (on: boolean) => void
  /** Live map of remote pointers keyed by identity. Stale entries auto-pruned. */
  remotePointers: Record<string, RemotePointer>
}

const C = createContext<Ctx | null>(null)

export function useLaserPointer() {
  const v = useContext(C)
  if (!v) throw new Error('useLaserPointer must be used inside <LaserPointerProvider>')
  return v
}

/**
 * Provider that:
 *   - Subscribes to pointer broadcasts and exposes a fresh remote-pointer map
 *   - Drives the local outbound stream (when enabled) via a mousemove listener
 *     throttled to ~30 Hz, plus an explicit "off" broadcast when disabled
 *
 * Lives inside the LiveKitRoom so it has access to the data channel context.
 */
export function LaserPointerProvider({ children }: { children: React.ReactNode }) {
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const [enabled, setEnabled] = useState(false)
  const [remotePointers, setRemotePointers] = useState<Record<string, RemotePointer>>({})

  // Listen for remote pointers.
  useEffect(() => {
    if (!room) return
    const onData = (
      payload: Uint8Array,
      _participant: unknown,
      _kind: unknown,
      topic?: string,
    ) => {
      if (topic !== POINTER_TOPIC) return
      const p = decodePointer(payload)
      if (!p) return
      if (p.off) {
        setRemotePointers((prev) => {
          if (!prev[p.identity]) return prev
          const { [p.identity]: _, ...rest } = prev
          return rest
        })
        return
      }
      setRemotePointers((prev) => ({
        ...prev,
        [p.identity]: { ...p, ts: Date.now() },
      }))
    }
    room.on(RoomEvent.DataReceived, onData)
    return () => {
      room.off(RoomEvent.DataReceived, onData)
    }
  }, [room])

  // Prune stale pointers so a sender who disconnects doesn't leave a frozen dot.
  useEffect(() => {
    const id = window.setInterval(() => {
      const cutoff = Date.now() - STALE_MS
      setRemotePointers((prev) => {
        let changed = false
        const next: Record<string, RemotePointer> = {}
        for (const [k, v] of Object.entries(prev)) {
          if (v.ts >= cutoff) {
            next[k] = v
          } else {
            changed = true
          }
        }
        return changed ? next : prev
      })
    }, 200)
    return () => window.clearInterval(id)
  }, [])

  // Outbound: while enabled, broadcast pointer pos on mouse move.
  const lastSentRef = useRef(0)
  useEffect(() => {
    if (!enabled || !localParticipant) return
    const onMove = (e: MouseEvent) => {
      const now = Date.now()
      if (now - lastSentRef.current < BROADCAST_INTERVAL_MS) return
      lastSentRef.current = now
      const x = e.clientX / window.innerWidth
      const y = e.clientY / window.innerHeight
      const name = localParticipant.name?.trim() || localParticipant.identity
      localParticipant
        .publishData(
          encodePointer({ x, y, identity: localParticipant.identity, name }),
          { reliable: false, topic: POINTER_TOPIC },
        )
        .catch(() => {})
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [enabled, localParticipant])

  // When disabling, broadcast an explicit OFF so other clients drop our dot.
  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev
      if (!next && localParticipant) {
        const name = localParticipant.name?.trim() || localParticipant.identity
        localParticipant
          .publishData(
            encodePointer({ x: 0, y: 0, identity: localParticipant.identity, name, off: true }),
            { reliable: true, topic: POINTER_TOPIC },
          )
          .catch(() => {})
      }
      return next
    })
  }, [localParticipant])

  const setEnabledExplicit = useCallback(
    (on: boolean) => {
      if (on === enabled) return
      toggle()
    },
    [enabled, toggle],
  )

  const value = useMemo<Ctx>(
    () => ({ enabled, toggle, setEnabled: setEnabledExplicit, remotePointers }),
    [enabled, toggle, setEnabledExplicit, remotePointers],
  )

  return <C.Provider value={value}>{children}</C.Provider>
}
