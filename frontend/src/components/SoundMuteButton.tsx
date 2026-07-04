import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { setSoundsEnabled, soundsEnabled } from '@/lib/sounds'

/**
 * Small icon toggle for the in-room sound effects (join/leave/chat/reaction).
 * Persists to localStorage via lib/sounds.ts so the preference survives the
 * meeting. Lives in the top-right ViewControls cluster.
 */
export function SoundMuteButton() {
  const { t } = useTranslation()
  const [on, setOn] = useState(() => soundsEnabled())

  useEffect(() => {
    setSoundsEnabled(on)
  }, [on])

  return (
    <button
      type="button"
      onClick={() => setOn((v) => !v)}
      aria-pressed={on}
      title={on ? t('viewControls.soundOff') : t('viewControls.soundOn')}
      className={`w-8 h-8 rounded-md flex items-center justify-center bg-[var(--color-surface)] border border-[var(--color-line-strong)] transition-colors ${
        on
          ? 'text-[var(--color-ink)] hover:bg-[var(--color-surface-2)]'
          : 'text-[var(--color-ink-faint)] hover:text-[var(--color-ink-muted)]'
      }`}
    >
      {on ? <Speaker /> : <SpeakerMuted />}
    </button>
  )
}

function Speaker() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  )
}

function SpeakerMuted() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  )
}
