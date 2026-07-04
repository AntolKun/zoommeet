import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import type { Room } from '@/hooks/useRooms'

export type Me = {
  id: number
  email: string
  display_name: string
  avatar_url?: string
  pmr_room_id?: number
  created_at: string
  updated_at: string
}

/**
 * Fetches the current authenticated user. Used by Settings to render the
 * "Akun" section with the up-to-date avatar URL after upload.
 */
export function useMe() {
  const { isAuthenticated } = useAuth()
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/users/me'),
    enabled: isAuthenticated,
    staleTime: 60_000,
  })
}

/**
 * Lazy-fetch the requesting user's Personal Meeting Room. Backend creates
 * the room on first call and returns it. Cached forever per session — the
 * slug is stable.
 */
export function useMyPMR() {
  const { isAuthenticated } = useAuth()
  return useQuery({
    queryKey: ['me', 'pmr'],
    queryFn: () => api<Room>('/users/me/pmr'),
    enabled: isAuthenticated,
    staleTime: Infinity,
  })
}

/** Upload a new avatar image; on success, refresh the cached `me` query. */
export function useUploadAvatar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('avatar', file)
      // Can't use the JSON api() helper because we need multipart — call
      // fetch directly while still passing the auth token.
      const token = localStorage.getItem('videoconf.token')
      const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api'
      const res = await fetch(`${base}/users/me/avatar`, {
        method: 'POST',
        body: form,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const text = await res.text()
      const data = text ? (JSON.parse(text) as { avatar_url?: string; error?: string }) : {}
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      return data.avatar_url ?? ''
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  })
}
