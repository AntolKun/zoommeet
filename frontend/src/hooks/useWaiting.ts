import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

const POLL_INTERVAL_MS = 3_000

/** Polling response from `/api/waiting/:token/status`. */
export type WaitingStatusResponse =
  | { status: 'pending' }
  | { status: 'approved'; token: string; url: string; room: string }
  | { status: 'denied' }

/**
 * Guest hook — polls admission status every 3s using the opaque request_token
 * issued by /api/token or /api/rooms/:slug/guest-token. Stops polling once
 * the request is decided (approved/denied) so the UI can transition.
 */
export function useWaitingStatus(requestToken: string | undefined) {
  return useQuery({
    queryKey: ['waiting-status', requestToken],
    enabled: !!requestToken,
    queryFn: () => api<WaitingStatusResponse>(`/waiting/${requestToken}/status`, { noAuth: true }),
    refetchInterval: (q) => {
      const data = q.state.data
      if (data?.status === 'approved' || data?.status === 'denied') return false
      return POLL_INTERVAL_MS
    },
    refetchIntervalInBackground: true,
    retry: false,
  })
}

/** A single waiting request row from the owner list endpoint. */
export type WaitingRequest = {
  id: number
  room_id: number
  user_id?: number
  display_name: string
  status: 'pending' | 'approved' | 'denied'
  created_at: string
  decided_at?: string
}

/**
 * Owner hook — polls list of pending waiting requests for a room every 3s.
 * Returns empty list when waiting room is off or queue is empty.
 */
export function useWaitingList(slug: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['waiting-list', slug],
    enabled: !!slug && enabled,
    queryFn: () =>
      api<{ requests: WaitingRequest[] }>(`/rooms/${slug}/waiting`).then((r) => r.requests),
    refetchInterval: enabled ? POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: true,
    retry: false,
  })
}

/** Owner action — admit a pending request. */
export function useAdmitWaiting(slug: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      api<{ ok: boolean }>(`/rooms/${slug}/waiting/${id}/admit`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['waiting-list', slug] }),
  })
}

/** Owner action — deny a pending request. */
export function useDenyWaiting(slug: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      api<{ ok: boolean }>(`/rooms/${slug}/waiting/${id}/deny`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['waiting-list', slug] }),
  })
}

/** Owner action — toggle waiting room on/off for a room. */
export function useToggleWaitingRoom(slug: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) =>
      api<{ waiting_room_enabled: boolean }>(`/rooms/${slug}/waiting-room`, {
        method: 'POST',
        body: { enabled },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room-info', slug] })
      qc.invalidateQueries({ queryKey: ['rooms', 'my'] })
    },
  })
}
