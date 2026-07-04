import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConnectionIndicator } from '@/components/ConnectionIndicator'
import { MyProfileButton } from '@/components/MyProfileButton'
import { SoundMuteButton } from '@/components/SoundMuteButton'
import { ThemeToggleButton } from '@/components/ThemeToggleButton'
import { SettingsDialog } from '@/components/SettingsDialog'
import { useFloatingSelfView } from '@/hooks/useFloatingSelfView'

/**
 * Floating top-right toolbar with:
 *   - Meeting duration timer (since mount, i.e. since LiveKitRoom connected)
 *   - Hide self view toggle (injects a style tag hiding local tile)
 *   - Picture-in-Picture toggle for the focused video
 *   - Full-screen toggle on the whole document
 */
export function ViewControls() {
  const { t } = useTranslation()
  const [hideSelf, setHideSelf] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isPip, setIsPip] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { enabled: floatSelf, setEnabled: setFloatSelf } = useFloatingSelfView()

  // Sync fullscreen state when triggered by Esc / browser controls.
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // Sync PiP state when user closes it from the PiP window controls.
  useEffect(() => {
    const onEnter = () => setIsPip(true)
    const onLeave = () => setIsPip(false)
    document.addEventListener('enterpictureinpicture', onEnter)
    document.addEventListener('leavepictureinpicture', onLeave)
    return () => {
      document.removeEventListener('enterpictureinpicture', onEnter)
      document.removeEventListener('leavepictureinpicture', onLeave)
    }
  }, [])

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {})
    } else {
      await document.documentElement.requestFullscreen().catch(() => {})
    }
  }

  async function togglePip() {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture().catch(() => {})
      return
    }
    // Prefer a video that isn't the local one to avoid PiP'ing yourself.
    const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('video'))
    const target =
      videos.find((v) => v.closest('[data-lk-local-participant="true"]') === null) ??
      videos[0]
    if (!target) return
    await target.requestPictureInPicture().catch(() => {})
  }

  const pipSupported =
    typeof document !== 'undefined' && 'pictureInPictureEnabled' in document &&
    (document as Document).pictureInPictureEnabled

  return (
    <>
      {hideSelf && (
        <style>{`
          .lk-participant-tile[data-lk-local-participant="true"] { display: none !important; }
        `}</style>
      )}

      <div className="fixed top-4 right-4 z-40 flex flex-wrap items-center gap-2 justify-end max-w-[calc(100vw-2rem)]">
        <MyProfileButton />
        <ConnectionIndicator />
        <MeetingTimer />
        <SoundMuteButton />
        <ThemeToggleButton />

        <div className="flex items-center gap-1 rounded-md bg-[var(--color-surface)] border border-[var(--color-line-strong)] p-1">
          <IconButton
            label={hideSelf ? t('viewControls.hideSelfOn') : t('viewControls.hideSelfOff')}
            active={hideSelf}
            onClick={() => setHideSelf((v) => !v)}
          >
            {hideSelf ? <EyeOffIcon /> : <EyeIcon />}
          </IconButton>

          <IconButton
            label={floatSelf ? t('viewControls.floatOn') : t('viewControls.floatOff')}
            active={floatSelf}
            onClick={() => setFloatSelf(!floatSelf)}
          >
            <FloatIcon />
          </IconButton>

          {pipSupported && (
            <IconButton
              label={isPip ? t('viewControls.pipOn') : t('viewControls.pipOff')}
              active={isPip}
              onClick={togglePip}
            >
              <PipIcon />
            </IconButton>
          )}

          <IconButton
            label={isFullscreen ? t('viewControls.fullOn') : t('viewControls.fullOff')}
            active={isFullscreen}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <ShrinkIcon /> : <ExpandIcon />}
          </IconButton>

          <IconButton
            label={t('viewControls.settings')}
            active={settingsOpen}
            onClick={() => setSettingsOpen(true)}
          >
            <GearIcon />
          </IconButton>
        </div>
      </div>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}

function MeetingTimer() {
  const { t } = useTranslation()
  // Anchor on mount, not on every render — ViewControls only mounts when
  // LiveKitRoom connects (so the timer starts at the meeting's join moment).
  const [startedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div
      className="flex items-center gap-1.5 px-3 h-8 rounded-md bg-[var(--color-surface)] border border-[var(--color-line-strong)] text-xs font-mono text-[var(--color-ink)]"
      title={t('viewControls.duration')}
      aria-label={t('viewControls.duration')}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-flame)] animate-pulse" />
      {formatDuration(now - startedAt)}
    </div>
  )
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function IconButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${
        active
          ? 'bg-[color-mix(in_oklab,var(--color-flame)_18%,transparent)] text-[var(--color-flame-soft)]'
          : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]'
      }`}
    >
      {children}
    </button>
  )
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function PipIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <rect x="13" y="11" width="7" height="6" rx="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  )
}

function ShrinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  )
}

function FloatIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="13" height="9" rx="1.5" />
      <rect x="11" y="11" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" opacity="0.7" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
