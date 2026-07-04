import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalParticipant } from '@livekit/components-react'
import { Track } from 'livekit-client'

/**
 * Custom screen-share button that captures TAB AUDIO when the user picks a
 * Chrome/Edge tab in the picker. LiveKit's default share button does
 * video-only — so this button is the path for "share with audio" (e.g.,
 * playing a YouTube clip during a meeting). Without it users would lose
 * the audio of whatever they share.
 *
 * Window/full-screen shares don't have audio on most browsers — the
 * `audio: true` flag gets silently ignored in that case, no harm done.
 */
export function ScreenShareButton() {
  const { t } = useTranslation()
  const { localParticipant } = useLocalParticipant()
  const [busy, setBusy] = useState(false)

  const sharing = !!localParticipant?.getTrackPublication(Track.Source.ScreenShare)

  async function toggle() {
    if (!localParticipant || busy) return
    setBusy(true)
    try {
      if (sharing) {
        await localParticipant.setScreenShareEnabled(false)
      } else {
        await localParticipant.setScreenShareEnabled(true, { audio: true })
      }
    } catch (e) {
      // User cancelled the picker, or browser denied permission — not fatal.
      console.warn('[screen share]', e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={sharing}
      disabled={busy}
      title={sharing ? t('controls.stopShareTitle') : t('controls.shareTitle')}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-xs font-medium border transition-colors ${
        sharing
          ? 'bg-[var(--color-flame)] text-[var(--color-canvas)] border-[var(--color-flame)]'
          : 'bg-[var(--color-surface)] text-[var(--color-ink)] border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)]'
      } disabled:opacity-50`}
    >
      <ShareIcon />
      <span>{sharing ? t('controls.stopShare') : t('controls.screenShare')}</span>
    </button>
  )
}

function ShareIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <path d="M9 11l3-3 3 3M12 14V8" />
    </svg>
  )
}
