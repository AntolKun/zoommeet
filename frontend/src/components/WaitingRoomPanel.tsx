import { useTranslation } from 'react-i18next'
import { useAdmitWaiting, useDenyWaiting, useWaitingList } from '@/hooks/useWaiting'
import type { WaitingRequest } from '@/hooks/useWaiting'

type Props = {
  open: boolean
  onClose: () => void
  slug: string
  /** When false the panel still renders empty (the hook stops polling). */
  enabled: boolean
}

/**
 * Owner-only slide-in panel listing guests parked in the waiting room.
 * The hook polls every 3 seconds while `enabled` is true.
 */
export function WaitingRoomPanel({ open, onClose, slug, enabled }: Props) {
  const { t } = useTranslation()
  const list = useWaitingList(slug, enabled)
  const admit = useAdmitWaiting(slug)
  const deny = useDenyWaiting(slug)

  const requests = list.data ?? []

  return (
    <>
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        aria-label={t('waiting.title')}
        className={`fixed top-0 left-0 z-50 h-svh w-[min(380px,90vw)] bg-[var(--color-surface)] border-r border-[var(--color-line-strong)] shadow-2xl transition-transform ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <header className="flex items-center justify-between px-5 h-14 border-b border-[var(--color-line)]">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">{t('waiting.title')}</h2>
            <span className="font-mono text-xs text-[var(--color-ink-muted)]">
              {requests.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] font-mono uppercase tracking-wider"
          >
            {t('waiting.closeUpper')}
          </button>
        </header>

        <div className="overflow-y-auto h-[calc(100svh-3.5rem)]">
          {!enabled && (
            <EmptyHint
              title={t('waiting.off')}
              detail={t('waiting.offHint')}
            />
          )}

          {enabled && list.isLoading && (
            <p className="px-5 py-6 text-xs text-[var(--color-ink-faint)] font-mono">{t('waiting.loading')}</p>
          )}

          {enabled && !list.isLoading && requests.length === 0 && (
            <EmptyHint
              title={t('waiting.emptyTitle')}
              detail={t('waiting.emptyHint')}
            />
          )}

          <ul className="divide-y divide-[var(--color-line)]">
            {requests.map((r) => (
              <RequestRow
                key={r.id}
                request={r}
                onAdmit={() => admit.mutate(r.id)}
                onDeny={() => deny.mutate(r.id)}
                busy={admit.isPending || deny.isPending}
              />
            ))}
          </ul>
        </div>
      </aside>
    </>
  )
}

function RequestRow({
  request,
  onAdmit,
  onDeny,
  busy,
}: {
  request: WaitingRequest
  onAdmit: () => void
  onDeny: () => void
  busy: boolean
}) {
  const { t } = useTranslation()
  return (
    <li className="px-5 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--color-ink)] truncate">{request.display_name}</p>
        <p className="text-[11px] text-[var(--color-ink-faint)] font-mono mt-0.5">
          {t('waiting.waitedSince', { age: relativeAge(request.created_at, t) })}
          {request.user_id ? ` ${t('waiting.asAccount')}` : ` ${t('waiting.asGuest')}`}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onDeny}
          disabled={busy}
          className="px-2 h-8 rounded-md border border-[var(--color-line)] text-xs text-[var(--color-ink-muted)] hover:border-[var(--color-bad)] hover:text-[var(--color-bad)] disabled:opacity-50"
        >
          {t('waiting.reject')}
        </button>
        <button
          type="button"
          onClick={onAdmit}
          disabled={busy}
          className="px-3 h-8 rounded-md bg-[var(--color-flame)] text-[var(--color-canvas)] text-xs font-medium hover:bg-[var(--color-flame-soft)] disabled:opacity-50"
        >
          {t('waiting.admit')}
        </button>
      </div>
    </li>
  )
}

function EmptyHint({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-sm text-[var(--color-ink)] mb-1">{title}</p>
      <p className="text-xs text-[var(--color-ink-muted)]">{detail}</p>
    </div>
  )
}

function relativeAge(iso: string, t: (k: string, opts?: Record<string, unknown>) => string): string {
  const ageSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (ageSec < 60) return t('waiting.secondsAgo', { n: ageSec })
  const min = Math.floor(ageSec / 60)
  if (min < 60) return t('waiting.minutesAgo', { n: min })
  const h = Math.floor(min / 60)
  return t('waiting.hoursAgo', { n: h })
}
