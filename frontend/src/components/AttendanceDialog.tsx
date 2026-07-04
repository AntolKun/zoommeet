import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog } from '@/components/ui/Dialog'
import { useAttendance, type AttendanceEntry } from '@/hooks/useAdmin'

type Props = {
  open: boolean
  onClose: () => void
  slug: string
  roomName: string
}

/**
 * Per-room attendance report. Each row = one (participant, session) pair.
 * Aggregated stats at top: unique participants, total person-time, current
 * in-room count (entries with no left_at).
 */
export function AttendanceDialog({ open, onClose, slug, roomName }: Props) {
  const { t } = useTranslation()
  const { data, isLoading, error } = useAttendance(slug, open)
  const entries = data ?? []

  const stats = useMemo(() => computeStats(entries), [entries])

  return (
    <Dialog open={open} onClose={onClose} title={t('attendance.dialogTitle', { name: roomName })}>
      <div className="space-y-4 max-h-[60vh] overflow-y-auto -mx-6 px-6">
        {isLoading && (
          <p className="text-xs text-[var(--color-ink-faint)] font-mono">{t('attendance.loading')}</p>
        )}

        {error && (
          <p className="text-xs text-[var(--color-bad)] font-mono">
            {t('attendance.loadError')}
          </p>
        )}

        {!isLoading && !error && entries.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-[var(--color-ink)]">{t('attendance.emptyTitle')}</p>
            <p className="text-xs text-[var(--color-ink-muted)] mt-1">
              {t('attendance.emptyHint')}
            </p>
          </div>
        )}

        {entries.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label={t('attendance.statUnique')} value={stats.uniqueCount.toString()} />
              <StatCard label={t('attendance.statSessions')} value={stats.totalSessions.toString()} />
              <StatCard label={t('attendance.statActive')} value={stats.activeCount.toString()} />
            </div>

            <ul className="divide-y divide-[var(--color-line)]">
              {entries.map((e) => (
                <AttendanceRow key={e.id} entry={e} />
              ))}
            </ul>
          </>
        )}
      </div>
    </Dialog>
  )
}

function AttendanceRow({ entry }: { entry: AttendanceEntry }) {
  const { t, i18n } = useTranslation()
  const active = !entry.left_at
  return (
    <li className="py-2 flex items-center gap-3">
      <span
        className={`shrink-0 w-2 h-2 rounded-full ${
          active ? 'bg-[var(--color-flame)] animate-pulse' : 'bg-[var(--color-ink-faint)]'
        }`}
        title={active ? t('attendance.activeLive') : t('attendance.activeAfter')}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--color-ink)] truncate">
          {entry.display_name}
          {!entry.user_id && (
            <span className="ml-2 text-[10px] font-mono uppercase tracking-wider text-[var(--color-ink-faint)]">
              {t('attendance.guestTag')}
            </span>
          )}
        </p>
        <p className="text-[11px] text-[var(--color-ink-muted)] font-mono">
          {formatTime(entry.joined_at, i18n.language)}
          {entry.left_at && ` → ${formatTime(entry.left_at, i18n.language)}`}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-mono text-[var(--color-ink-soft)]">
          {entry.duration_seconds !== undefined
            ? formatDuration(entry.duration_seconds)
            : active
            ? t('attendance.duration')
            : '—'}
        </p>
      </div>
    </li>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2">
      <p className="text-[10px] text-[var(--color-ink-faint)] font-mono uppercase tracking-wider">
        {label}
      </p>
      <p className="text-lg font-semibold text-[var(--color-ink)] mt-0.5">{value}</p>
    </div>
  )
}

function computeStats(entries: AttendanceEntry[]) {
  const unique = new Set<string>()
  let totalDuration = 0
  let active = 0
  for (const e of entries) {
    unique.add(e.user_id !== undefined ? `u:${e.user_id}` : `g:${e.display_name}`)
    if (e.duration_seconds !== undefined) totalDuration += e.duration_seconds
    if (!e.left_at) active++
  }
  return {
    uniqueCount: unique.size,
    totalSessions: entries.length,
    activeCount: active,
    totalDuration,
  }
}

function formatTime(iso: string, lang: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString(lang === 'en' ? 'en-US' : 'id-ID', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec} dtk`
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}j ${m % 60}m`
}
