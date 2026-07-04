import { useTranslation } from 'react-i18next'
import { Dialog } from '@/components/ui/Dialog'
import { useAuditLog, type AuditEntry } from '@/hooks/useAdmin'

type Props = {
  open: boolean
  onClose: () => void
  slug: string
  roomName: string
}

const ACTION_LABEL: Record<string, { icon: string; labelKey: string }> = {
  room_locked: { icon: '🔒', labelKey: 'audit.actionLock' },
  room_unlocked: { icon: '🔓', labelKey: 'audit.actionUnlock' },
  participant_muted: { icon: '🎙', labelKey: 'audit.actionMute' },
  participant_kicked: { icon: '👢', labelKey: 'audit.actionKick' },
  recording_started: { icon: '🔴', labelKey: 'audit.actionRecStart' },
  recording_stopped: { icon: '⏹', labelKey: 'audit.actionRecStop' },
  cohost_added: { icon: '👑', labelKey: 'audit.actionCohostAdd' },
  cohost_removed: { icon: '✖', labelKey: 'audit.actionCohostRemove' },
  waiting_admitted: { icon: '✅', labelKey: 'audit.actionWaitingAdmit' },
  waiting_denied: { icon: '❌', labelKey: 'audit.actionWaitingDeny' },
  waiting_room_toggled: { icon: '⏳', labelKey: 'audit.actionWaitingToggle' },
}

/**
 * Audit log — chronological record of every host/cohost action in a room.
 * Owner-only on the backend (cohosts can't see audit even of their own
 * actions; they get accountability via the actor_id field).
 */
export function AuditLogDialog({ open, onClose, slug, roomName }: Props) {
  const { t } = useTranslation()
  const { data, isLoading, error } = useAuditLog(slug, open)
  const entries = data ?? []

  return (
    <Dialog open={open} onClose={onClose} title={t('audit.dialogTitle', { name: roomName })}>
      <div className="space-y-2 max-h-[60vh] overflow-y-auto -mx-6 px-6">
        {isLoading && (
          <p className="text-xs text-[var(--color-ink-faint)] font-mono">{t('audit.loading')}</p>
        )}

        {error && (
          <p className="text-xs text-[var(--color-bad)] font-mono">
            {t('audit.loadError')}
          </p>
        )}

        {!isLoading && !error && entries.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-[var(--color-ink)]">{t('audit.emptyTitle')}</p>
            <p className="text-xs text-[var(--color-ink-muted)] mt-1">
              {t('audit.emptyHint')}
            </p>
          </div>
        )}

        <ul className="divide-y divide-[var(--color-line)]">
          {entries.map((e) => (
            <AuditRow key={e.id} entry={e} />
          ))}
        </ul>
      </div>
    </Dialog>
  )
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const { t, i18n } = useTranslation()
  const meta = ACTION_LABEL[entry.action]
  const label = meta ? t(meta.labelKey) : entry.action
  const icon = meta?.icon ?? '•'
  return (
    <li className="py-2.5 flex items-start gap-3">
      <span aria-hidden className="text-base leading-none mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--color-ink)]">
          <span className="font-medium">{entry.actor_name}</span>
          <span className="text-[var(--color-ink-muted)]"> ({entry.actor_role})</span>
          {' — '}
          <span>{label}</span>
          {entry.target && (
            <span className="font-mono text-xs text-[var(--color-ink-soft)] ml-1">
              [{entry.target}]
            </span>
          )}
          {entry.detail && (
            <span className="font-mono text-xs text-[var(--color-ink-faint)] ml-1">
              {entry.detail}
            </span>
          )}
        </p>
        <p className="text-[11px] text-[var(--color-ink-faint)] font-mono mt-0.5">
          {formatTime(entry.created_at, i18n.language)}
        </p>
      </div>
    </li>
  )
}

function formatTime(iso: string, lang: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString(lang === 'en' ? 'en-US' : 'id-ID', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso
  }
}
