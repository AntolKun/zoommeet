import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { useDeleteRoom, useRooms, type Room } from '@/hooks/useRooms'
import { useMyPMR } from '@/hooks/useMe'
import { CreateRoomDialog } from '@/components/CreateRoomDialog'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Alert } from '@/components/ui/Alert'
import { copyText } from '@/lib/clipboard'
import {
  formatScheduledAbsolute,
  nextOccurrence,
  recurrenceLabel,
  scheduleRelative,
} from '@/lib/schedule'
import { downloadIcs, openMailtoInvite, type InviteInfo } from '@/lib/invite'
import { RecordingsDialog } from '@/components/RecordingsDialog'
import { AttendanceDialog } from '@/components/AttendanceDialog'
import { AuditLogDialog } from '@/components/AuditLogDialog'
import { TourOverlay, tourSeen } from '@/components/TourOverlay'

export function Dashboard() {
  const { data: rooms, isLoading, isError, error } = useRooms()
  const { t } = useTranslation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)

  // First-time tour — show once per user (localStorage), 600ms delay so the
  // dashboard has time to paint behind it.
  useEffect(() => {
    if (tourSeen()) return
    const t = window.setTimeout(() => setTourOpen(true), 600)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <div className="mx-auto max-w-5xl px-5 py-12 w-full">
      <div className="flex items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{t('dashboard.title')}</h2>
          <p className="text-sm text-[var(--color-ink-muted)] mt-1">
            {t('dashboard.subtitle')}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>{t('dashboard.createButton')}</Button>
      </div>

      <PMRCard />

      {isLoading && <SkeletonList />}

      {isError && (
        <Alert tone="error">
          {t('dashboard.loadError')} {error instanceof Error ? error.message : 'unknown'}
        </Alert>
      )}

      {rooms && rooms.length === 0 && <EmptyState onCreate={() => setDialogOpen(true)} />}

      {rooms && rooms.length > 0 && <RoomList rooms={rooms} />}

      <CreateRoomDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => setDialogOpen(false)}
      />

      <TourOverlay open={tourOpen} onClose={() => setTourOpen(false)} />
    </div>
  )
}

function RoomList({ rooms }: { rooms: Room[] }) {
  // Re-render every 30s so relative times stay fresh ("2 jam lagi" → "1 jam 59 mnt lagi").
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])

  // Sort: upcoming/live first by start time (soonest first), then unscheduled/past by created_at desc.
  const sorted = useMemo(() => {
    const now = Date.now()
    return [...rooms].sort((a, b) => {
      const ap = relevanceScore(a, now)
      const bp = relevanceScore(b, now)
      if (ap.bucket !== bp.bucket) return ap.bucket - bp.bucket
      if (ap.bucket === 0) return ap.time - bp.time // upcoming asc
      return bp.time - ap.time // others desc
    })
  }, [rooms])

  return (
    <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)] rounded-lg overflow-hidden">
      {sorted.map((room) => (
        <RoomRow key={room.id} room={room} />
      ))}
    </ul>
  )
}

function relevanceScore(room: Room, now: number): { bucket: number; time: number } {
  if (room.scheduled_at && room.duration_minutes) {
    // For recurring rooms, sort by the NEXT occurrence so they stay "upcoming" forever.
    const start = room.recurrence
      ? nextOccurrence(room.scheduled_at, room.recurrence).getTime()
      : new Date(room.scheduled_at).getTime()
    const end = start + room.duration_minutes * 60_000
    if (now < end) return { bucket: 0, time: start } // upcoming/live
  }
  return { bucket: 1, time: new Date(room.created_at).getTime() }
}

function RoomRow({ room }: { room: Room }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const deleteRoom = useDeleteRoom()
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [recordingsOpen, setRecordingsOpen] = useState(false)
  const [attendanceOpen, setAttendanceOpen] = useState(false)
  const [auditOpen, setAuditOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)

  const joinUrl = `${window.location.origin}/room/${room.slug}`
  // For recurring rooms, base the absolute time + relative time on the next
  // occurrence so "1 hari lalu" doesn't permanently linger after the original
  // scheduled_at passes.
  const effectiveStartIso =
    room.scheduled_at && room.recurrence
      ? nextOccurrence(room.scheduled_at, room.recurrence).toISOString()
      : room.scheduled_at
  const schedule =
    effectiveStartIso && room.duration_minutes
      ? scheduleRelative(effectiveStartIso, room.duration_minutes)
      : null

  const inviteInfo: InviteInfo = {
    name: room.name,
    joinUrl,
    scheduledAt: effectiveStartIso,
    durationMinutes: room.duration_minutes,
  }

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
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{room.name}</span>
          {room.is_public ? (
            <Badge tone="public">{t('dashboard.badgePublic')}</Badge>
          ) : (
            <Badge tone="private">{t('dashboard.badgePrivate')}</Badge>
          )}
          {room.is_locked && <Badge tone="locked">{t('dashboard.badgeLocked')}</Badge>}
          {room.has_password && (
            <span
              className="inline-flex items-center gap-1 rounded border border-[var(--color-line-strong)] text-[var(--color-ink-soft)] px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider"
            >
              {t('dashboard.badgePassword')}
            </span>
          )}
          {room.waiting_room_enabled && (
            <span
              className="inline-flex items-center gap-1 rounded border border-[var(--color-line-strong)] text-[var(--color-ink-soft)] px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider"
            >
              {t('dashboard.badgeWaitingRoom')}
            </span>
          )}
          {schedule && <ScheduleBadge status={schedule.status} />}
        </div>

        {schedule && effectiveStartIso && (
          <div className="flex items-center gap-2 mt-1 text-xs">
            <span className="font-mono text-[var(--color-flame)]">
              {room.recurrence ? '🔁' : '📅'}
            </span>
            <span className="text-[var(--color-ink-soft)]">
              {room.recurrence && room.scheduled_at
                ? recurrenceLabel(room.scheduled_at, room.recurrence)
                : formatScheduledAbsolute(effectiveStartIso)}
            </span>
            <span aria-hidden className="text-[var(--color-ink-faint)]">·</span>
            <span
              className={
                schedule.status === 'live'
                  ? 'text-[var(--color-flame-soft)] font-medium'
                  : schedule.status === 'past'
                  ? 'text-[var(--color-ink-faint)]'
                  : 'text-[var(--color-ink-soft)]'
              }
            >
              {schedule.label}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 mt-0.5 text-xs text-[var(--color-ink-muted)]">
          <span className="font-mono">/room/{room.slug}</span>
          <span aria-hidden>·</span>
          <span>{t('dashboard.createdAt')} {formatDate(room.created_at)}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <div className="relative">
          <Button variant="ghost" size="sm" onClick={() => setShareOpen((v) => !v)}>
            {copied ? t('dashboard.shareCopied') : t('dashboard.shareLabel')}
          </Button>
          {shareOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShareOpen(false)}
                aria-hidden
              />
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 z-20 min-w-[200px] rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface)] shadow-2xl py-1"
              >
                <ShareMenuItem
                  onClick={() => {
                    setShareOpen(false)
                    void handleCopy()
                  }}
                  icon="🔗"
                  label={t('dashboard.shareCopy')}
                />
                <ShareMenuItem
                  onClick={() => {
                    setShareOpen(false)
                    downloadIcs(inviteInfo)
                  }}
                  icon="📅"
                  label={t('dashboard.shareCalendar')}
                />
                <ShareMenuItem
                  onClick={() => {
                    setShareOpen(false)
                    openMailtoInvite(inviteInfo)
                  }}
                  icon="✉️"
                  label={t('dashboard.shareEmail')}
                />
              </div>
            </>
          )}
        </div>
        <div className="relative">
          <Button variant="ghost" size="sm" onClick={() => setAdminOpen((v) => !v)}>
            {t('dashboard.adminLabel')}
          </Button>
          {adminOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setAdminOpen(false)}
                aria-hidden
              />
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 z-20 min-w-[200px] rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface)] shadow-2xl py-1"
              >
                <ShareMenuItem
                  icon="📼"
                  label={t('dashboard.adminRecording')}
                  onClick={() => {
                    setAdminOpen(false)
                    setRecordingsOpen(true)
                  }}
                />
                <ShareMenuItem
                  icon="👥"
                  label={t('dashboard.adminAttendance')}
                  onClick={() => {
                    setAdminOpen(false)
                    setAttendanceOpen(true)
                  }}
                />
                <ShareMenuItem
                  icon="📋"
                  label={t('dashboard.adminAudit')}
                  onClick={() => {
                    setAdminOpen(false)
                    setAuditOpen(true)
                  }}
                />
              </div>
            </>
          )}
        </div>
        <Button variant="subtle" size="sm" onClick={() => navigate(`/room/${room.slug}`)}>
          {t('dashboard.joinAction')}
        </Button>
        {confirming ? (
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => deleteRoom.mutate(room.id)}
              className="h-8 px-2 text-xs rounded text-[var(--color-bad)] hover:bg-[color-mix(in_oklab,var(--color-bad)_15%,transparent)]"
            >
              {t('dashboard.deletePrompt')}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="h-8 px-2 text-xs rounded text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            >
              {t('dashboard.deleteCancel')}
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={t('dashboard.deleteAria')}
            className="h-8 w-8 inline-flex items-center justify-center rounded text-[var(--color-ink-faint)] hover:text-[var(--color-bad)] hover:bg-[var(--color-surface)] transition-colors"
          >
            ×
          </button>
        )}
      </div>

      <RecordingsDialog
        open={recordingsOpen}
        onClose={() => setRecordingsOpen(false)}
        slug={room.slug}
        roomName={room.name}
      />
      <AttendanceDialog
        open={attendanceOpen}
        onClose={() => setAttendanceOpen(false)}
        slug={room.slug}
        roomName={room.name}
      />
      <AuditLogDialog
        open={auditOpen}
        onClose={() => setAuditOpen(false)}
        slug={room.slug}
        roomName={room.name}
      />
    </li>
  )
}

function ShareMenuItem({
  icon,
  label,
  onClick,
}: {
  icon: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full px-3 py-2 text-left text-sm text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] flex items-center gap-2"
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function ScheduleBadge({ status }: { status: 'upcoming' | 'live' | 'past' }) {
  const { t } = useTranslation()
  if (status === 'live') {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-[color-mix(in_oklab,var(--color-flame)_55%,transparent)] text-[var(--color-flame-soft)] px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-flame)] animate-pulse" />
        {t('dashboard.scheduleLive')}
      </span>
    )
  }
  if (status === 'past') {
    return (
      <span className="inline-flex items-center rounded border border-[var(--color-line)] text-[var(--color-ink-faint)] px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider">
        {t('dashboard.schedulePast')}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded border border-[var(--color-line-strong)] text-[var(--color-ink-soft)] px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider">
      {t('dashboard.scheduleUpcoming')}
    </span>
  )
}

function PMRCard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: pmr, isLoading } = useMyPMR()
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    if (!pmr) return
    const url = `${window.location.origin}/room/${pmr.slug}`
    await copyText(url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="mb-6 rounded-lg border border-[var(--color-line-strong)] bg-[color-mix(in_oklab,var(--color-flame)_8%,var(--color-surface))] px-5 py-4 flex items-center gap-4 flex-wrap">
      <div className="text-2xl" aria-hidden>📍</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--color-ink)]">{t('dashboard.pmrTitle')}</p>
        <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">
          {isLoading ? t('common.loading') : t('dashboard.pmrSubtitle')}
        </p>
        {pmr && (
          <p className="text-[11px] font-mono text-[var(--color-ink-faint)] mt-1 truncate">
            /room/{pmr.slug}
          </p>
        )}
      </div>
      {pmr && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="h-9 px-3 rounded-md border border-[var(--color-line)] text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-line-strong)]"
          >
            {copied ? t('dashboard.shareCopied') : t('dashboard.pmrCopy')}
          </button>
          <Button onClick={() => navigate(`/room/${pmr.slug}`)}>
            {t('dashboard.pmrOpen')}
          </Button>
        </div>
      )}
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="border border-dashed border-[var(--color-line)] rounded-lg py-16 text-center">
      <p className="font-mono text-xs text-[var(--color-flame)] mb-3">// {t('dashboard.empty')}</p>
      <p className="text-[var(--color-ink)] font-medium">{t('dashboard.empty')}</p>
      <p className="text-sm text-[var(--color-ink-muted)] mt-1 mb-6">
        {t('dashboard.emptyCta')}
      </p>
      <Button onClick={onCreate}>{t('dashboard.createButton')}</Button>
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
