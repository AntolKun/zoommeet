import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useDeleteRoom, useRooms, type Room } from '@/hooks/useRooms'
import { CreateRoomDialog } from '@/components/CreateRoomDialog'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Alert } from '@/components/ui/Alert'
import { copyText } from '@/lib/clipboard'

export function Dashboard() {
  const { data: rooms, isLoading, isError, error } = useRooms()
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="mx-auto max-w-5xl px-5 py-12 w-full">
      <div className="flex items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Meeting saya</h2>
          <p className="text-sm text-[var(--color-ink-muted)] mt-1">
            Room yang kamu bikin. Share link-nya ke siapa aja.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>+ Bikin meeting</Button>
      </div>

      {isLoading && <SkeletonList />}

      {isError && (
        <Alert tone="error">
          Gagal memuat meeting: {error instanceof Error ? error.message : 'unknown'}
        </Alert>
      )}

      {rooms && rooms.length === 0 && <EmptyState onCreate={() => setDialogOpen(true)} />}

      {rooms && rooms.length > 0 && (
        <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)] rounded-lg overflow-hidden">
          {rooms.map((room) => (
            <RoomRow key={room.id} room={room} />
          ))}
        </ul>
      )}

      <CreateRoomDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => setDialogOpen(false)}
      />
    </div>
  )
}

function RoomRow({ room }: { room: Room }) {
  const navigate = useNavigate()
  const deleteRoom = useDeleteRoom()
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const joinUrl = `${window.location.origin}/room/${room.slug}`

  async function handleCopy() {
    const ok = await copyText(joinUrl)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    }
  }

  return (
    <li className="flex items-center gap-4 px-4 py-3.5 bg-[var(--color-surface)] hover:bg-[var(--color-surface-2)] transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{room.name}</span>
          {room.is_public ? (
            <Badge tone="public">publik</Badge>
          ) : (
            <Badge tone="private">privat</Badge>
          )}
          {room.is_locked && <Badge tone="locked">terkunci</Badge>}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-[var(--color-ink-muted)]">
          <span className="font-mono">/room/{room.slug}</span>
          <span aria-hidden>·</span>
          <span>dibuat {formatDate(room.created_at)}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <Button variant="ghost" size="sm" onClick={handleCopy}>
          {copied ? 'Tersalin!' : 'Salin link'}
        </Button>
        <Button variant="subtle" size="sm" onClick={() => navigate(`/room/${room.slug}`)}>
          Gabung
        </Button>
        {confirming ? (
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => deleteRoom.mutate(room.id)}
              className="h-8 px-2 text-xs rounded text-[var(--color-bad)] hover:bg-[color-mix(in_oklab,var(--color-bad)_15%,transparent)]"
            >
              Hapus?
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="h-8 px-2 text-xs rounded text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            >
              batal
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label="Hapus meeting"
            className="h-8 w-8 inline-flex items-center justify-center rounded text-[var(--color-ink-faint)] hover:text-[var(--color-bad)] hover:bg-[var(--color-surface)] transition-colors"
          >
            ×
          </button>
        )}
      </div>
    </li>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="border border-dashed border-[var(--color-line)] rounded-lg py-16 text-center">
      <p className="font-mono text-xs text-[var(--color-flame)] mb-3">// kosong dulu</p>
      <p className="text-[var(--color-ink)] font-medium">Belum ada meeting</p>
      <p className="text-sm text-[var(--color-ink-muted)] mt-1 mb-6">
        Bikin satu, terus kirim link-nya ke tim kamu.
      </p>
      <Button onClick={onCreate}>+ Bikin meeting pertama</Button>
    </div>
  )
}

function SkeletonList() {
  return (
    <div className="border border-[var(--color-line)] rounded-lg overflow-hidden divide-y divide-[var(--color-line)]">
      {[0, 1, 2].map((i) => (
        <div key={i} className="px-4 py-4 bg-[var(--color-surface)] flex items-center gap-4">
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-40 rounded bg-[var(--color-surface-2)] animate-pulse" />
            <div className="h-2.5 w-56 rounded bg-[var(--color-surface-2)] animate-pulse" />
          </div>
          <div className="h-8 w-20 rounded bg-[var(--color-surface-2)] animate-pulse" />
        </div>
      ))}
    </div>
  )
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}
