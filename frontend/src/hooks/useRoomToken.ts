import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'

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
}

/**
 * Fetches a LiveKit access token for a room.
 *
 * - If user is authenticated → POST /api/token (server uses auth user identity).
 * - If user is NOT authenticated AND `guestName` is provided → POST /api/rooms/:slug/guest-token
 *   (server generates random guest identity; only public unlocked rooms allowed).
 */
export function useRoomToken(slug: string | undefined, opts: Options = {}) {
  const { guestName, enabled = true } = opts
  const { isAuthenticated } = useAuth()

  const guestNameTrimmed = guestName?.trim()
  const canFetch = !!slug && enabled && (isAuthenticated || !!guestNameTrimmed)

  return useQuery({
    queryKey: [
      'room-token',
      slug,
      isAuthenticated ? 'auth' : 'guest',
      isAuthenticated ? null : guestNameTrimmed,
    ],
    enabled: canFetch,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: () => {
      if (isAuthenticated) {
        return api<RoomToken>('/token', {
          method: 'POST',
          body: { room: slug },
        })
      }
      return api<RoomToken>(`/rooms/${slug}/guest-token`, {
        method: 'POST',
        body: { name: guestNameTrimmed },
        noAuth: true,
      })
    },
  })
}
