import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalParticipant, useRoomContext } from '@livekit/components-react'
import { RoomEvent } from 'livekit-client'
import { useNavigate } from 'react-router-dom'
import { HOST_TOPIC, decodeHostAction } from '@/lib/hostBroadcast'

type Assignment = { slug: string; name: string }

/**
 * Listens for host-issued `breakout_assign` broadcasts addressed to the local
 * participant. When matched, pops a confirmation modal — accepting navigates
 * to the breakout's room URL. Renders nothing when no assignment is pending.
 *
 * Note: the navigation tears down the current LiveKitRoom and remounts a new
 * one for the breakout slug. Pre-join shows again — that's acceptable for
 * MVP; a "skip pre-join on warp" can be added later.
 */
export function BreakoutAssignmentListener() {
  const { t } = useTranslation()
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const navigate = useNavigate()
  const [pending, setPending] = useState<Assignment | null>(null)

  useEffect(() => {
    if (!room || !localParticipant) return
    const onData = (
      payload: Uint8Array,
      _participant: unknown,
      _kind: unknown,
      topic?: string,
    ) => {
      if (topic !== HOST_TOPIC) return
      const msg = decodeHostAction(payload)
      if (!msg || msg.action !== 'breakout_assign') return
      if (msg.target_identity !== localParticipant.identity) return
      setPending({ slug: msg.breakout_slug, name: msg.breakout_name })
    }
    room.on(RoomEvent.DataReceived, onData)
    return () => {
      room.off(RoomEvent.DataReceived, onData)
    }
  }, [room, localParticipant])

  if (!pending) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => setPending(null)}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-sm rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface)] shadow-2xl p-5 text-center"
      >
        <p className="font-mono text-xs text-[var(--color-flame)] mb-3">{t('breakout.tag')}</p>
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">
          {t('breakout.assignTitle')}
        </h2>
        <p className="text-sm text-[var(--color-ink-muted)] mt-2 mb-5">
          {t('breakout.assignBody')}{' '}
          <span className="text-[var(--color-ink)] font-medium">{pending.name}</span>.
        </p>
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPending(null)}
            className="h-9 px-4 rounded-md border border-[var(--color-line)] text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          >
            {t('breakout.assignLater')}
          </button>
          <button
            type="button"
            onClick={() => {
              const slug = pending.slug
              setPending(null)
              navigate(`/room/${slug}`)
            }}
            className="h-9 px-4 rounded-md bg-[var(--color-flame)] text-[var(--color-canvas)] text-sm font-medium hover:bg-[var(--color-flame-soft)]"
          >
            {t('breakout.assignNow')}
          </button>
        </div>
      </div>
    </div>
  )
}
