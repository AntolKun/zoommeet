import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalParticipant } from '@livekit/components-react'

/**
 * When push-to-talk is ON, the mic stays muted by default. Holding spacebar
 * unmutes it for as long as the key is held — like a walkie-talkie.
 *
 * Skips activation when focus is in a text field so chat input still types
 * normal spaces.
 */
export function PushToTalkButton() {
  const { t } = useTranslation()
  const { localParticipant } = useLocalParticipant()
  const [pttEnabled, setPttEnabled] = useState(false)
  const isTalkingRef = useRef(false)

  // When the user enables PTT, force-mute so they start in walkie-talkie mode.
  // When they disable it, restore an unmuted state — they probably want to
  // talk normally again.
  useEffect(() => {
    if (!localParticipant) return
    localParticipant.setMicrophoneEnabled(!pttEnabled).catch(() => {})
    isTalkingRef.current = false
  }, [pttEnabled, localParticipant])

  useEffect(() => {
    if (!pttEnabled || !localParticipant) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      if (isTypingTarget(e.target)) return
      e.preventDefault()
      if (isTalkingRef.current) return
      isTalkingRef.current = true
      localParticipant.setMicrophoneEnabled(true).catch(() => {})
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      if (!isTalkingRef.current) return
      isTalkingRef.current = false
      localParticipant.setMicrophoneEnabled(false).catch(() => {})
    }

    // Safety: release mic if user alt-tabs while holding space.
    const onBlur = () => {
      if (!isTalkingRef.current) return
      isTalkingRef.current = false
      localParticipant.setMicrophoneEnabled(false).catch(() => {})
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [pttEnabled, localParticipant])

  return (
    <button
      type="button"
      onClick={() => setPttEnabled((v) => !v)}
      aria-pressed={pttEnabled}
      title={pttEnabled ? t('controls.pttActiveTitle') : t('controls.pttTitle')}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-xs font-medium border transition-colors ${
        pttEnabled
          ? 'bg-[color-mix(in_oklab,var(--color-flame)_18%,transparent)] text-[var(--color-flame-soft)] border-[var(--color-flame)]'
          : 'bg-[var(--color-surface)] text-[var(--color-ink)] border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)]'
      }`}
    >
      <PttIcon />
      <span>{t('controls.ptt')}</span>
      {pttEnabled && (
        <span className="font-mono text-[10px] text-[var(--color-ink-faint)]">{t('controls.pttKey')}</span>
      )}
    </button>
  )
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

function PttIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
    </svg>
  )
}
