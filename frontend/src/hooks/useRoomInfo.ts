import { useQuery } from '@tanstack/react-query'
import { api, getCurrentUserId } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import type { Room } from '@/hooks/useRooms'

type RoomDetail = Room & { is_cohost: boolean }

/**
 * Looks up the room from the backend (auth required) and reports whether the
 * current authenticated user is owner, co-host, or has any host privileges.
 * Guests get all flags false.
 */
export function useRoomInfo(slug: string | undefined) {
  const { isAuthenticated } = useAuth()

  const query = useQuery({
    queryKey: ['room-info', slug],
    queryFn: () => api<RoomDetail>(`/rooms/${slug}`),
    enabled: !!slug && isAuthenticated,
    staleTime: 30_000,
    retry: false,
  })

  const myId = getCurrentUserId()
  const isOwner =
    !!query.data && myId !== null && query.data.owner_id === myId
  const isCohost = !!query.data && query.data.is_cohost
  const isHost = isOwner || isCohost

  return {
    room: query.data,
    isOwner,
    isCohost,
    /** Convenience flag: owner OR co-host — i.e., user has host controls. */
    isHost,
    isLoading: query.isLoading,
    error: query.error,
  }
}
