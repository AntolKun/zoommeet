import { useEffect, useRef } from 'react'
import {
  useConnectionState,
  useLocalParticipant,
} from '@livekit/components-react'
import { ConnectionState } from 'livekit-client'
import { api } from '@/lib/api'

/**
 * Logs the local participant's attendance for the meeting: POSTs `/join` when
 * LiveKit reports Connected, then POSTs `/leave` on unmount or disconnect to
 * close out the row.
 *
 * Best-effort — a hard tab close skips the leave call and the row stays open
 * (`left_at` null). The dashboard treats those as "still in the room or
 * abrupt exit", which matches reality.
 */
export function useAttendanceLogging(slug: string | undefined) {
  const state = useConnectionState()
  const { localParticipant } = useLocalParticipant()
  const entryIdRef = useRef<number | null>(null)
  const loggingRef = useRef(false)

  // POST /join when we first reach Connected.
  useEffect(() => {
    if (!slug || !localParticipant) return
    if (state !== ConnectionState.Connected) return
    if (entryIdRef.current !== null || loggingRef.current) return

    loggingRef.current = true
    const displayName =
      localParticipant.name?.trim() || localParticipant.identity || 'Tamu'
    const identity = localParticipant.identity

    api<{ id: number }>(`/rooms/${slug}/attendance/join`, {
      method: 'POST',
      body: { display_name: displayName, identity },
    })
      .then((r) => {
        entryIdRef.current = r.id
      })
      .catch(() => {
        // Best-effort logging — never block the join flow on failure.
      })
      .finally(() => {
        loggingRef.current = false
      })
  }, [slug, localParticipant, state])

  // POST /leave on unmount (Room component unmounts when user navigates away).
  useEffect(() => {
    return () => {
      const id = entryIdRef.current
      if (id === null) return
      entryIdRef.current = null
      // Fire-and-forget; React Router may already have torn down providers.
      api(`/attendance/${id}/leave`, { method: 'POST', noAuth: true }).catch(() => {})
    }
  }, [])

  // Also close out on hard tab close / reload. Uses sendBeacon when available
  // so the request survives the navigation.
  useEffect(() => {
    const onUnload = () => {
      const id = entryIdRef.current
      if (id === null) return
      const url = `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api'}/attendance/${id}/leave`
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(url)
      }
    }
    window.addEventListener('pagehide', onUnload)
    return () => window.removeEventListener('pagehide', onUnload)
  }, [])
}
