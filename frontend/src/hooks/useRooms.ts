import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type Room = {
  id: number
  slug: string
  name: string
  owner_id: number
  is_public: boolean
  is_locked: boolean
  created_at: string
  updated_at: string
}

type RoomsResponse = { rooms: Room[] }

export type CreateRoomInput = {
  name: string
  slug?: string
  is_public: boolean
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
