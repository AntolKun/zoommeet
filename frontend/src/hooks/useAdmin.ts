import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type AttendanceEntry = {
  id: number
  user_id?: number
  display_name: string
  identity: string
  joined_at: string
  left_at?: string
  duration_seconds?: number
}

export type AuditEntry = {
  id: number
  actor_id: number
  actor_name: string
  actor_role: 'owner' | 'cohost'
  action: string
  target?: string
  detail?: string
  created_at: string
}

/** Attendance list for a room — owner / cohost only on the backend. */
export function useAttendance(slug: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['attendance', slug],
    enabled: !!slug && enabled,
    queryFn: () =>
      api<{ entries: AttendanceEntry[] }>(`/rooms/${slug}/attendance`).then(
        (r) => r.entries,
      ),
    staleTime: 5_000,
  })
}

/** Audit log for a room — owner only on the backend. */
export function useAuditLog(slug: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['audit', slug],
    enabled: !!slug && enabled,
    queryFn: () =>
      api<{ entries: AuditEntry[] }>(`/rooms/${slug}/audit`).then((r) => r.entries),
    staleTime: 5_000,
  })
}
