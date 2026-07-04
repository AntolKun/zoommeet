import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'

/** Server response shape — discriminated union on `status`. */
export type RoomTokenResponse =
  | {
      status: 'immediate'
      token: string
      url: string
      room: string
    }
  | {
      status: 'pending'
      room: string
      request_token: string
    }

/** Legacy type kept around for callers that only care about the credentials shape. */
export type RoomToken = {
  token: string
  url: string
  room: string
}

type Options = {
  /** If set (and user not authenticated), fetches a guest token with this display name. */
  guestName?: string
  /** Don't fire the request until enabled. */
  enabled?: boolean
  /** Sent along to satisfy a room's password gate (if any). */
  password?: string
}

/**
 * Requests admission to a room and gets back either:
 *   - `status: 'immediate'` — LiveKit credentials, connect right away
 *   - `status: 'pending'`   — room has waiting room enabled, caller must poll
 *                             /api/waiting/:request_token/status until owner decides
 */
export function useRoomToken(slug: string | undefined, opts: Options = {}) {
  const { guestName, enabled = true, password } = opts
  const { isAuthenticated } = useAuth()

  const guestNameTrimmed = guestName?.trim()
  const canFetch = !!slug && enabled && (isAuthenticated || !!guestNameTrimmed)

  return useQuery({
    queryKey: [
      'room-token',
      slug,
      isAuthenticated ? 'auth' : 'guest',
      isAuthenticated ? null : guestNameTrimmed,
      password ?? '',
    ],
    enabled: canFetch,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: () => {
      if (isAuthenticated) {
        return api<RoomTokenResponse>('/token', {
          method: 'POST',
          body: { room: slug, ...(password ? { password } : {}) },
        })
      }
      return api<RoomTokenResponse>(`/rooms/${slug}/guest-token`, {
        method: 'POST',
        body: { name: guestNameTrimmed, ...(password ? { password } : {}) },
        noAuth: true,
      })
    },
  })
}
