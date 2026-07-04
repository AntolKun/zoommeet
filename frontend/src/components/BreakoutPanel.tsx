import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useLocalParticipant,
  useParticipants,
  useRoomContext,
} from '@livekit/components-react'
import {
  useBreakouts,
  useCloseBreakouts,
  useCreateBreakouts,
  type Breakout,
} from '@/hooks/useBreakouts'
import { encodeHostAction, HOST_TOPIC } from '@/lib/hostBroadcast'
import type { Participant } from 'livekit-client'

type Props = {
  open: boolean
  onClose: () => void
  slug: string
}

/**
 * Host-only panel for managing breakout rooms. Host can:
 *   - Create N breakouts at once
 *   - See the list of open breakouts (each with a Join link)
 *   - Assign a participant to a breakout — fires a broadcast that the
 *     target client receives and uses to prompt themselves to move
 *   - Close all breakouts (signal recall)
 */
export function BreakoutPanel({ open, onClose, slug }: Props) {
  const { t } = useTranslation()
  const { data: breakouts, isLoading } = useBreakouts(slug, open)
  const create = useCreateBreakouts(slug)
  const closeAll = useCloseBreakouts(slug)
  const [count, setCount] = useState(2)

  const participants = useParticipants()
  const { localParticipant } = useLocalParticipant()
  const room = useRoomContext()

  const list = breakouts ?? []
  const others = participants.filter(
    (p) => p.identity !== localParticipant?.identity,
  )

  async function assignParticipant(p: Participant, b: Breakout) {
    if (!room?.localParticipant) return
    await room.localParticipant
      .publishData(
        encodeHostAction({
          action: 'breakout_assign',
          target_identity: p.identity,
          breakout_slug: b.slug,
          breakout_name: b.name,
        }),
        { reliable: true, topic: HOST_TOPIC },
      )
      .catch(() => {})
  }

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
        aria-label={t('breakout.title')}
        className={`fixed top-0 right-0 z-50 h-svh w-[min(420px,92vw)] bg-[var(--color-surface)] border-l border-[var(--color-line-strong)] shadow-2xl transition-transform flex flex-col ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex items-center justify-between px-5 h-14 border-b border-[var(--color-line)] shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">
              {t('breakout.title')}
            </h2>
            <span className="font-mono text-xs text-[var(--color-ink-muted)]">
              {list.length}
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

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Quick create form */}
          <div className="rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface-2)] p-3 space-y-2">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-flame)]">
              {t('breakout.createTag')}
            </p>
            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--color-ink-muted)]">{t('breakout.countLabel')}</label>
              <input
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(20, +e.target.value || 1)))}
                className="w-16 h-8 rounded-md bg-[var(--color-surface)] border border-[var(--color-line)] px-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-flame)]"
              />
              <button
                type="button"
                onClick={() => create.mutate({ count })}
                disabled={create.isPending}
                className="h-8 px-3 rounded-md bg-[var(--color-flame)] text-[var(--color-canvas)] text-xs font-medium hover:bg-[var(--color-flame-soft)] disabled:opacity-50"
              >
                {create.isPending ? t('breakout.creating') : t('breakout.create')}
              </button>
            </div>
            {create.error && (
              <p className="text-[10px] text-[var(--color-bad)] font-mono">
                {t('breakout.errCreate')}
              </p>
            )}
          </div>

          {isLoading && !breakouts && (
            <p className="text-xs text-[var(--color-ink-faint)] font-mono">{t('breakout.loading')}</p>
          )}

          {!isLoading && list.length === 0 && (
            <p className="text-xs text-[var(--color-ink-faint)] text-center mt-4">
              {t('breakout.empty')}
            </p>
          )}

          {list.map((b) => (
            <BreakoutCard
              key={b.id}
              breakout={b}
              others={others}
              onAssign={(p) => assignParticipant(p, b)}
            />
          ))}

          {list.length > 0 && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => closeAll.mutate()}
                disabled={closeAll.isPending}
                className="w-full h-8 rounded-md border border-[var(--color-line)] text-xs text-[var(--color-bad)] hover:border-[var(--color-bad)] hover:bg-[color-mix(in_oklab,var(--color-bad)_10%,transparent)] disabled:opacity-50"
              >
                {closeAll.isPending ? t('breakout.closingAll') : t('breakout.closeAll')}
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

function BreakoutCard({
  breakout,
  others,
  onAssign,
}: {
  breakout: Breakout
  others: Participant[]
  onAssign: (p: Participant) => void
}) {
  const { t } = useTranslation()
  const [assignOpen, setAssignOpen] = useState(false)
  const joinUrl = `${window.location.origin}/room/${breakout.slug}`

  function copyLink() {
    void navigator.clipboard.writeText(joinUrl).catch(() => {})
  }

  return (
    <article className="rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface-2)] p-3">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-[var(--color-ink)]">{breakout.name}</h3>
        <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-ink-faint)]">
          {breakout.slug}
        </span>
      </header>

      <div className="flex items-center gap-1.5 mt-2">
        <a
          href={`/room/${breakout.slug}`}
          target="_blank"
          rel="noreferrer"
          className="h-7 px-2 rounded border border-[var(--color-line)] text-[11px] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-line-strong)] inline-flex items-center gap-1"
        >
          {t('breakout.openLink')}
        </a>
        <button
          type="button"
          onClick={copyLink}
          className="h-7 px-2 rounded border border-[var(--color-line)] text-[11px] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-line-strong)]"
        >
          {t('breakout.copyLink')}
        </button>
        <button
          type="button"
          onClick={() => setAssignOpen((v) => !v)}
          disabled={others.length === 0}
          className="h-7 px-2 rounded border border-[var(--color-line)] text-[11px] text-[var(--color-flame-soft)] hover:border-[var(--color-flame)] disabled:opacity-50"
        >
          {t('breakout.assign')}
        </button>
      </div>

      {assignOpen && (
        <ul className="mt-2 border-t border-[var(--color-line)] pt-2 space-y-1 max-h-40 overflow-y-auto">
          {others.length === 0 && (
            <li className="text-[11px] text-[var(--color-ink-faint)] font-mono">
              {t('breakout.noOthers')}
            </li>
          )}
          {others.map((p) => (
            <li key={p.identity} className="flex items-center justify-between gap-2">
              <span className="text-xs text-[var(--color-ink)] truncate">
                {p.name?.trim() || p.identity}
              </span>
              <button
                type="button"
                onClick={() => {
                  onAssign(p)
                  setAssignOpen(false)
                }}
                className="h-6 px-2 text-[10px] rounded bg-[var(--color-flame)] text-[var(--color-canvas)] hover:bg-[var(--color-flame-soft)]"
              >
                {t('breakout.sendAssign')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
