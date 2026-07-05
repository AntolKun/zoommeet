import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type Room = {
  id: number
  slug: string
  name: string
  owner_id: number
  is_public: boolean
  is_locked: boolean
  has_password: boolean
  /** RFC3339 UTC timestamp. Absent for instant (no-schedule) rooms. */
  scheduled_at?: string
  duration_minutes?: number
  /** "daily" | "weekly"; absent for one-time meetings. */
  recurrence?: Recurrence
  /** If true, non-owners are parked in a waiting room until owner approves. */
  waiting_room_enabled: boolean
  /** Initial mic state for new joiners: true = pre-join starts muted. */
  default_mic_off: boolean
  /** Initial cam state for new joiners: true = pre-join starts with cam off. */
  default_cam_off: boolean
  /** Webinar mode: only host + cohosts publish; audience is watch-only. */
  is_webinar: boolean
  created_at: string
  updated_at: string
}

export type Recurrence = 'daily' | 'weekly'

type RoomsResponse = { rooms: Room[] }

export type CreateRoomInput = {
  name: string
  slug?: string
  is_public: boolean
  /** RFC3339 UTC string. Omit for instant rooms. */
  scheduled_at?: string
  duration_minutes?: number
  /** 4–128 chars; empty/omitted = no password. */
  password?: string
  recurrence?: Recurrence
  waiting_room_enabled?: boolean
  default_mic_off?: boolean
  default_cam_off?: boolean
  is_webinar?: boolean
}

const roomsKey = ['rooms', 'my'] as const

export function useRooms() {
  return useQuery({
    queryKey: roomsKey,
    queryFn: () => api<RoomsResponse>('/rooms/my').then((r) => r.rooms),
  })
}

export function useCreateRoom() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateRoomInput) =>
      api<Room>('/rooms', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: roomsKey })
    },
  })
}

export function useDeleteRoom() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (idOrSlug: string | number) =>
      api<void>(`/rooms/${idOrSlug}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: roomsKey })
    },
  })
}
