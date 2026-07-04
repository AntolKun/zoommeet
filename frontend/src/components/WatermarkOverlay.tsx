import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalParticipant, useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { useWatermark } from '@/hooks/useRoomFlags'

/**
 * Diagonal repeating watermark drawn on top of the room when host turns on
 * watermarking AND someone is screen-sharing. Each viewer's name + the
 * current minute is shown — if a screenshot of the share leaks, the
 * watermark identifies who took it.
 *
 * Pointer-events are off so the overlay doesn't block any interaction.
 * Opacity is intentionally low (8%) — visible enough to deter casual
 * screenshotting, faint enough to not ruin the share's readability.
 */
export function WatermarkOverlay() {
  const { t } = useTranslation()
  const { enabled } = useWatermark()
  const { localParticipant } = useLocalParticipant()
  // Subscribe to screen-share tracks so the overlay re-renders when someone
  // starts/stops sharing.
  const screenTracks = useTracks([Track.Source.ScreenShare])
  const someoneSharing = screenTracks.length > 0

  // Update timestamp every 30 seconds so the watermark moves slightly —
  // discourages cropping the watermark off and reuploading.
  const [stamp, setStamp] = useState(() => formatStamp(new Date()))
  useEffect(() => {
    if (!enabled || !someoneSharing) return
    const tick = () => setStamp(formatStamp(new Date()))
    tick()
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [enabled, someoneSharing])

  if (!enabled || !someoneSharing) return null

  const name = localParticipant?.name?.trim() || localParticipant?.identity || 'unknown'
  const text = t('watermark.stamp', { name, ts: stamp })

  // Repeat the text horizontally with a wide spacer. CSS handles wrapping.
  const repeated = Array.from({ length: 120 }, () => text).join('   •   ')

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-30 pointer-events-none overflow-hidden select-none"
    >
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          transform: 'rotate(-30deg) scale(1.5)',
          fontFamily: 'var(--font-mono)',
          fontSize: '14px',
          color: 'rgba(245, 239, 233, 0.08)',
          fontWeight: 600,
          letterSpacing: '0.08em',
          lineHeight: 2.4,
          textShadow: '0 0 1px rgba(0,0,0,0.3)',
          wordBreak: 'break-all',
        }}
      >
        <div style={{ width: '200%', textAlign: 'center' }}>{repeated}</div>
      </div>
    </div>
  )
}

function formatStamp(d: Date): string {
  // Pad helpers for consistent formatting.
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    ` ${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}
