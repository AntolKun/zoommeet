import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

/**
 * Toggle the room lock state. Locked = backend rejects new /token requests
 * from non-hosts; existing participants stay in. Owner OR cohost can flip it
 * (backend gates via requireOwnerOrCohost).
 */
export function useRoomLock(slug: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (locked: boolean) =>
      api<{ is_locked: boolean }>(
        `/rooms/${slug}/${locked ? 'lock' : 'unlock'}`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room-info', slug] })
      qc.invalidateQueries({ queryKey: ['rooms', 'my'] })
    },
  })
}
