import { useTranslation } from 'react-i18next'
import { Dialog } from '@/components/ui/Dialog'
import { useRecordings, type Recording } from '@/hooks/useRecordings'

type Props = {
  open: boolean
  onClose: () => void
  slug: string
  roomName: string
}

/**
 * Modal showing all recordings for a room — completed ones get a download
 * link, in-flight ones show their live status. Surfaced from the dashboard
 * so owners can grab past recordings without re-entering the room.
 */
export function RecordingsDialog({ open, onClose, slug, roomName }: Props) {
  const { t } = useTranslation()
  const { data, isLoading, error } = useRecordings(slug, open)
  const list = data ?? []

  return (
    <Dialog open={open} onClose={onClose} title={t('recordings.dialogTitle', { name: roomName })}>
      <div className="space-y-3 max-h-[60vh] overflow-y-auto -mx-6 px-6">
        {isLoading && (
          <p className="text-xs text-[var(--color-ink-faint)] font-mono">{t('recordings.loading')}</p>
        )}

        {error && (
          <p className="text-xs text-[var(--color-bad)] font-mono">
            {t('recordings.loadError')}
          </p>
        )}

        {!isLoading && !error && list.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-[var(--color-ink)]">{t('recordings.emptyTitle')}</p>
            <p className="text-xs text-[var(--color-ink-muted)] mt-1">
              {t('recordings.emptyHint')}
            </p>
          </div>
        )}

        <ul className="divide-y divide-[var(--color-line)]">
          {list.map((r) => (
            <RecordingRow key={r.id} rec={r} />
          ))}
        </ul>
      </div>
    </Dialog>
  )
}

function RecordingRow({ rec }: { rec: Recording }) {
  const { t, i18n } = useTranslation()
  const ended = rec.status === 'complete' || rec.status === 'failed'
  return (
    <li className="py-3 flex items-start gap-3">
      <StatusDot status={rec.status} />

      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--color-ink)]">
          {formatStarted(rec.started_at, i18n.language)}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-ink-muted)] font-mono">
          <span>{statusLabel(rec.status, t)}</span>
          {rec.duration_seconds !== undefined && (
            <>
              <span aria-hidden>·</span>
              <span>{formatDuration(rec.duration_seconds)}</span>
            </>
          )}
          {rec.file_size !== undefined && (
            <>
              <span aria-hidden>·</span>
              <span>{formatBytes(rec.file_size)}</span>
            </>
          )}
        </p>
        {rec.error && (
          <p className="mt-1 text-[11px] text-[var(--color-bad)]">{rec.error}</p>
        )}
      </div>

      <div className="shrink-0">
        {rec.file_url ? (
          <a
            href={rec.file_url}
            target="_blank"
            rel="noreferrer"
            download
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-[var(--color-flame)] text-[var(--color-canvas)] text-xs font-medium hover:bg-[var(--color-flame-soft)]"
          >
            <DownloadIcon />
            {t('recordings.download')}
          </a>
        ) : ended ? (
          <span className="text-[10px] text-[var(--color-ink-faint)] font-mono uppercase tracking-wider">
            {t('recordings.waitingFile')}
          </span>
        ) : (
          <span className="text-[10px] text-[var(--color-ink-muted)] font-mono uppercase tracking-wider">
            {t('recordings.recordingNow')}
          </span>
        )}
      </div>
    </li>
  )
}

function StatusDot({ status }: { status: Recording['status'] }) {
  const color =
    status === 'complete'
      ? 'var(--color-ok)'
      : status === 'failed'
      ? 'var(--color-bad)'
      : 'var(--color-flame)'
  const pulse = status === 'active' || status === 'starting' || status === 'ending'
  return (
    <span className="mt-1 shrink-0 w-2 h-2 rounded-full" style={{ background: color }}>
      {pulse && (
        <span className="block w-2 h-2 rounded-full animate-ping" style={{ background: color }} />
      )}
    </span>
  )
}

function statusLabel(s: Recording['status'], t: (k: string) => string): string {
  switch (s) {
    case 'starting':
      return t('recordings.statusStarting')
    case 'active':
      return t('recordings.statusActive')
    case 'ending':
      return t('recordings.statusEnding')
    case 'complete':
      return t('recordings.statusComplete')
    case 'failed':
      return t('recordings.statusFailed')
  }
}

function formatStarted(iso: string, lang: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString(lang === 'en' ? 'en-US' : 'id-ID', {
      weekday: 'short',
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
  if (m < 60) return `${m}m ${sec % 60}d`
  const h = Math.floor(m / 60)
  return `${h}j ${m % 60}m`
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b}B`
  if (b < 1024 * 1024) return `${Math.round(b / 1024)}KB`
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)}MB`
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)}GB`
}

function DownloadIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}
