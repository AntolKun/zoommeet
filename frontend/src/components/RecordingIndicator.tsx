import { useTranslation } from 'react-i18next'
import { useIsRecording } from '@livekit/components-react'

/**
 * Tiny pulsing red badge that appears for ALL participants when the room is
 * being recorded. Server-side recording (LiveKit Egress) sets the room's
 * isRecording flag.
 */
export function RecordingIndicator() {
  const { t } = useTranslation()
  const isRecording = useIsRecording()
  if (!isRecording) return null

  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-[color-mix(in_oklab,var(--color-bad)_15%,var(--color-canvas))] border border-[color-mix(in_oklab,var(--color-bad)_50%,transparent)] px-2 py-1 text-[11px] font-mono uppercase tracking-wider text-[color-mix(in_oklab,var(--color-bad)_85%,white)]">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-bad)] animate-pulse" />
      {t('recording.indicator')}
    </span>
  )
}
