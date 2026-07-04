import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type Recording = {
  id: number
  room_id: number
  egress_id: string
  status: 'starting' | 'active' | 'ending' | 'complete' | 'failed'
  started_by: number
  file_path?: string
  /** Public/presigned URL — only filled after the Egress webhook reports
   * completion. Null while recording is in-flight or storage isn't wired up. */
  file_url?: string
  file_size?: number
  duration_seconds?: number
  started_at: string
  ended_at?: string
  error?: string
}

/**
 * Lists recordings for a room. Owner-or-cohost only on the backend;
 * non-host calls will 403 and the hook surfaces an error.
 */
export function useRecordings(slug: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['recordings', slug],
    enabled: !!slug && enabled,
    queryFn: () =>
      api<{ recordings: Recording[] }>(`/rooms/${slug}/recordings`).then((r) => r.recordings),
    staleTime: 10_000,
  })
}
