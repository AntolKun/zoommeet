import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalParticipant, useRoomContext } from '@livekit/components-react'
import { RoomEvent } from 'livekit-client'
import { playSfx, sfxLabel, SFX_LIST, type SfxName } from '@/lib/sounds'

const TOPIC = 'vc.soundboard'
// Simple debounce so one user can't spam the whole room every 100ms.
const COOLDOWN_MS = 800

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/**
 * Discord-style soundboard: pick a preset, everyone in the room hears it.
 * Local-only preview (no broadcast) if the user clicks their own tile
 * quickly — actually simpler: always broadcast + always plays locally too.
 *
 * Cooldown prevents one user hijacking the room; the button visually
 * disables until it clears.
 */
export function SoundboardButton() {
  const { t } = useTranslation()
  const { localParticipant } = useLocalParticipant()
  const room = useRoomContext()
  const [open, setOpen] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  // Receive SFX broadcasts from other participants.
  useEffect(() => {
    if (!room) return
    const onData = (
      payload: Uint8Array,
      _p: unknown,
      _k: unknown,
      topic?: string,
    ) => {
      if (topic !== TOPIC) return
      try {
        const parsed = JSON.parse(decoder.decode(payload)) as { name?: string }
        if (parsed.name && (SFX_LIST as string[]).includes(parsed.name)) {
          playSfx(parsed.name as SfxName)
        }
      } catch {
        // ignore malformed
      }
    }
    room.on(RoomEvent.DataReceived, onData)
    return () => {
      room.off(RoomEvent.DataReceived, onData)
    }
  }, [room])

  // Outside-click / Esc handling.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onCooldown = Date.now() < cooldownUntil

  function play(name: SfxName) {
    if (Date.now() < cooldownUntil) return
    setCooldownUntil(Date.now() + COOLDOWN_MS)
    playSfx(name)
    if (localParticipant) {
      const bytes = encoder.encode(JSON.stringify({ name }))
      void localParticipant
        .publishData(bytes, { reliable: false, topic: TOPIC })
        .catch(() => {})
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={t('soundboard.title')}
        className="inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-xs font-medium bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)] transition-colors"
      >
        <span aria-hidden>🎛</span>
        {t('soundboard.short')}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1 z-50 w-64 rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface)] shadow-2xl p-2"
        >
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-ink-faint)] mb-2 px-1">
            {t('soundboard.hint')}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {SFX_LIST.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => play(name)}
                disabled={onCooldown}
                className="h-9 px-2 rounded-md border border-[var(--color-line)] text-xs text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] hover:border-[var(--color-line-strong)] disabled:opacity-50 disabled:cursor-not-allowed truncate text-left"
              >
                {sfxLabel(name)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
