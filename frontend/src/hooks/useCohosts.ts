import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type Cohost = {
  user_id: number
  display_name: string
  email: string
  granted_at: string
}

/**
 * List co-hosts for a room. Anyone with room access (auth required) can read.
 * Polled rarely — co-host set changes infrequently during a meeting.
 */
export function useCohosts(slug: string | undefined) {
  return useQuery({
    queryKey: ['cohosts', slug],
    enabled: !!slug,
    queryFn: () =>
      api<{ cohosts: Cohost[] }>(`/rooms/${slug}/cohosts`).then((r) => r.cohosts),
    staleTime: 30_000,
  })
}

/** Owner action — promote a user to co-host. */
export function useAddCohost(slug: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userID: number) =>
      api<{ ok: boolean; added: boolean }>(`/rooms/${slug}/cohosts`, {
        method: 'POST',
        body: { user_id: userID },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cohosts', slug] }),
  })
}

/** Owner action — revoke co-host. */
export function useRemoveCohost(slug: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userID: number) =>
      api<void>(`/rooms/${slug}/cohosts/${userID}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cohosts', slug] }),
  })
}
