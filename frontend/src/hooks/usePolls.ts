import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type PollOption = {
  id: number
  poll_id: number
  position: number
  label: string
}

export type Poll = {
  id: number
  room_id: number
  question: string
  created_by: number
  created_at: string
  closed_at?: string
  options: PollOption[]
  /** option_id → vote count map */
  counts: Record<string, number>
  /** Current user's chosen option_id, or undefined if not voted. */
  my_vote?: number
  is_open: boolean
}

const POLL_INTERVAL_MS = 3_000

/**
 * Lists polls for a room. Polls every 3 seconds so vote counts update live
 * across clients without needing a data-channel broadcast layer.
 */
export function usePolls(slug: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['polls', slug],
    enabled: !!slug && enabled,
    queryFn: () =>
      api<{ polls: Poll[] }>(`/rooms/${slug}/polls`).then((r) => r.polls),
    refetchInterval: enabled ? POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    staleTime: 0,
  })
}

/** Host action — create a new poll. */
export function useCreatePoll(slug: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { question: string; options: string[] }) =>
      api<Poll>(`/rooms/${slug}/polls`, { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['polls', slug] }),
  })
}

/** Submit/replace the current user's vote on a poll. */
export function useVotePoll(slug: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pollId, optionId }: { pollId: number; optionId: number }) =>
      api<void>(`/polls/${pollId}/vote`, {
        method: 'POST',
        body: { option_id: optionId },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['polls', slug] }),
  })
}

/** Host action — close a poll (lock results). */
export function useClosePoll(slug: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (pollId: number) =>
      api<void>(`/polls/${pollId}/close`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['polls', slug] }),
  })
}

/** Computes total votes across all options in a poll. */
export function pollTotalVotes(poll: Poll): number {
  let total = 0
  for (const v of Object.values(poll.counts)) total += v
  return total
}
