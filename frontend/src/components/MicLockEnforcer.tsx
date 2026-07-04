import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalParticipant } from '@livekit/components-react'
import { ParticipantEvent, Track, type TrackPublication } from 'livekit-client'
import { useUnmuteRestricted } from '@/hooks/useRoomFlags'

/**
 * Cooperative enforcement of the host's "no one can unmute themselves" rule.
 *
 * When `restricted` is true and the local user is NOT a host, any unmute on
 * the mic track is reverted immediately. A small toast appears to explain
 * what happened so the user doesn't think their mic is broken.
 *
 * This is best-effort UX, not security: a tech-savvy participant can disable
 * the listener via DevTools. For hard enforcement, the backend would need to
 * issue tokens with `CanPublishSources` restricted to camera-only when the
 * room is in restricted mode.
 */
export function MicLockEnforcer({ isHost }: { isHost: boolean }) {
  const { t } = useTranslation()
  const { localParticipant } = useLocalParticipant()
  const { restricted } = useUnmuteRestricted()
  const [showToast, setShowToast] = useState(false)

  useEffect(() => {
    if (!localParticipant) return
    if (!restricted || isHost) return

    // If currently unmuted when restriction kicks in, mute right away.
    if (localParticipant.isMicrophoneEnabled) {
      localParticipant.setMicrophoneEnabled(false).catch(() => {})
      setShowToast(true)
    }

    const onUnmute = (pub: TrackPublication) => {
      if (pub.source !== Track.Source.Microphone) return
      localParticipant.setMicrophoneEnabled(false).catch(() => {})
      setShowToast(true)
    }
    localParticipant.on(ParticipantEvent.TrackUnmuted, onUnmute)
    return () => {
      localParticipant.off(ParticipantEvent.TrackUnmuted, onUnmute)
    }
  }, [localParticipant, restricted, isHost])

  // Auto-dismiss the toast after a couple seconds.
  useEffect(() => {
    if (!showToast) return
    const t = window.setTimeout(() => setShowToast(false), 3500)
    return () => window.clearTimeout(t)
  }, [showToast])

  if (!showToast) return null

  return (
    <div
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 rounded-md bg-[color-mix(in_oklab,var(--color-bad)_28%,var(--color-canvas))] border border-[color-mix(in_oklab,var(--color-bad)_60%,transparent)] px-3 py-2 shadow-xl backdrop-blur-sm">
        <span className="text-base">🔇</span>
        <p className="text-xs text-[var(--color-ink)] font-medium">
          {t('micLock.toast')}
        </p>
      </div>
    </div>
  )
}
