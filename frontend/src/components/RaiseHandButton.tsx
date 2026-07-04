import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalParticipant, useParticipants, useRoomContext } from '@livekit/components-react'
import { ParticipantEvent, RoomEvent } from 'livekit-client'
import { HOST_TOPIC, decodeHostAction } from '@/lib/hostBroadcast'
import { onUiAction } from '@/lib/uiActions'

const HAND_ATTR = 'hand'
const HAND_AT_ATTR = 'hand_at' // unix ms when the hand was raised — used to order the queue

export function isHandRaised(attrs?: Record<string, string>): boolean {
  return attrs?.[HAND_ATTR] === '1'
}

/** Returns when the hand was raised (unix ms), or 0 if not raised / no timestamp. */
export function handRaisedAt(attrs?: Record<string, string>): number {
  const raw = attrs?.[HAND_AT_ATTR]
  if (!raw) return 0
  const n = parseInt(raw, 10)
  return Number.isFinite(n) ? n : 0
}

/**
 * Toolbar toggle for raising/lowering the local participant's hand. The state
 * lives on the participant's LiveKit `attributes`, so other participants see
 * it via their own participant list.
 */
export function RaiseHandButton() {
  const { t } = useTranslation()
  const { localParticipant } = useLocalParticipant()
  const room = useRoomContext()
  const [raised, setRaised] = useState(false)
  const [busy, setBusy] = useState(false)

  // Mirror remote attribute changes (e.g., after reconnect) into local state.
  useEffect(() => {
    if (!localParticipant) return
    const sync = () => setRaised(isHandRaised(localParticipant.attributes))
    sync()
    localParticipant.on(ParticipantEvent.AttributesChanged, sync)
    return () => {
      localParticipant.off(ParticipantEvent.AttributesChanged, sync)
    }
  }, [localParticipant])

  // Host-issued "lower all hands" broadcast: each client lowers its own hand.
  // Host can't touch other participants' attributes directly, so we rely on
  // cooperative clients receiving this message.
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
      if (!msg) return
      if (msg.action === 'lower_all_hands' && isHandRaised(localParticipant.attributes)) {
        localParticipant.setAttributes({ [HAND_ATTR]: '', [HAND_AT_ATTR]: '' }).catch(() => {})
      }
    }
    room.on(RoomEvent.DataReceived, onData)
    return () => {
      room.off(RoomEvent.DataReceived, onData)
    }
  }, [room, localParticipant])

  async function toggle() {
    if (!localParticipant || busy) return
    setBusy(true)
    const next = !raised
    try {
      // Stamp hand_at so ParticipantsPanel can order the queue FIFO.
      // Clearing both keeps lower_all_hands and host re-raise behavior sane.
      const attrs = next
        ? { [HAND_ATTR]: '1', [HAND_AT_ATTR]: String(Date.now()) }
        : { [HAND_ATTR]: '', [HAND_AT_ATTR]: '' }
      await localParticipant.setAttributes(attrs)
      setRaised(next)
    } catch {
      // ignore
    } finally {
      setBusy(false)
    }
  }

  // Keyboard shortcut (L) dispatches `toggle-hand`.
  useEffect(() => {
    return onUiAction('toggle-hand', () => {
      void toggle()
    })
    // toggle has stable inputs as long as localParticipant exists; safe to omit
    // its identity from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localParticipant, raised, busy])

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={raised}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-xs font-medium border transition-colors disabled:opacity-50 ${
        raised
          ? 'bg-[color-mix(in_oklab,var(--color-flame)_15%,var(--color-canvas))] text-[var(--color-flame-soft)] border-[color-mix(in_oklab,var(--color-flame)_55%,transparent)]'
          : 'bg-[var(--color-surface)] text-[var(--color-ink)] border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)]'
      }`}
    >
      <span className={raised ? 'animate-pulse text-base leading-none' : 'text-base leading-none'}>
        ✋
      </span>
      {raised ? t('controls.lowerHand') : t('controls.raiseHand')}
    </button>
  )
}

/** Returns count of participants currently raising their hand. */
export function useHandsRaisedCount(): number {
  const participants = useParticipants()
  return participants.filter((p) => isHandRaised(p.attributes)).length
}
