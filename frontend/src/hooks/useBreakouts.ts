import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type Breakout = {
  id: number
  parent_room_id: number
  slug: string
  name: string
  created_at: string
  closed_at?: string
}

/** Open breakouts for a parent room — owner / cohost gated on backend. */
export function useBreakouts(slug: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['breakouts', slug],
    enabled: !!slug && enabled,
    queryFn: () =>
      api<{ breakouts: Breakout[] }>(`/rooms/${slug}/breakouts`).then(
        (r) => r.breakouts,
      ),
    refetchInterval: enabled ? 5_000 : false,
    staleTime: 0,
  })
}

/** Host action — create N breakouts at once, named "Breakout 1..N". */
export function useCreateBreakouts(slug: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { count?: number; names?: string[] }) =>
      api<{ breakouts: Breakout[] }>(`/rooms/${slug}/breakouts`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['breakouts', slug] }),
  })
}

/** Host action — close every open breakout under the parent. */
export function useCloseBreakouts(slug: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api<{ closed: number }>(`/rooms/${slug}/breakouts/close`, {
        method: 'POST',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['breakouts', slug] }),
  })
}
