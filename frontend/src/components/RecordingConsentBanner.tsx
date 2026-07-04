import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useIsRecording } from '@livekit/components-react'

const VISIBLE_MS = 8000

/**
 * Prominent top-center banner that fires once when recording starts. Gives
 * everyone in the room a clear, legible "you're being recorded" notice that
 * fades after 8 seconds. The persistent small red badge (RecordingIndicator)
 * stays visible the whole time recording is on.
 */
export function RecordingConsentBanner() {
  const { t } = useTranslation()
  const isRecording = useIsRecording()
  const wasRecording = useRef(false)
  const [show, setShow] = useState(false)

  useEffect(() => {
    const prev = wasRecording.current
    wasRecording.current = isRecording
    if (!isRecording || prev) return
    setShow(true)
    const t = window.setTimeout(() => setShow(false), VISIBLE_MS)
    return () => window.clearTimeout(t)
  }, [isRecording])

  if (!show) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="recording-consent-banner fixed top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-lg bg-[color-mix(in_oklab,var(--color-bad)_28%,var(--color-canvas))] border border-[color-mix(in_oklab,var(--color-bad)_60%,transparent)] px-4 py-2.5 shadow-2xl backdrop-blur-sm">
        <span className="relative flex items-center justify-center w-3 h-3 shrink-0">
          <span className="absolute inset-0 rounded-full bg-[var(--color-bad)] animate-ping opacity-75" />
          <span className="relative w-3 h-3 rounded-full bg-[var(--color-bad)]" />
        </span>
        <div>
          <p className="text-sm font-semibold text-[var(--color-ink)] leading-tight">
            {t('room.recordingBannerTitle')}
          </p>
          <p className="text-[11px] text-[var(--color-ink-soft)] leading-tight mt-0.5">
            {t('room.recordingBannerBody')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShow(false)}
          className="ml-2 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] text-lg leading-none"
          aria-label={t('room.recordingBannerCloseAria')}
        >
          ×
        </button>
      </div>
    </div>
  )
}
