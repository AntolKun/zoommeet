import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRoomContext } from '@livekit/components-react'
import {
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrackPublication,
} from 'livekit-client'

/**
 * Audio-only mode: unsubscribes from every remote video publication so the
 * client only pays bandwidth for audio. Useful on flaky networks or laptops
 * running hot. Local camera publication is left alone — toggling it off here
 * would surprise the user; they can still mute their cam separately.
 */
export function AudioOnlyButton() {
  const { t } = useTranslation()
  const room = useRoomContext()
  const [audioOnly, setAudioOnly] = useState(false)

  useEffect(() => {
    if (!room) return

    // Apply current preference to every existing remote video pub.
    const applyToExisting = (subscribed: boolean) => {
      room.remoteParticipants.forEach((p) => {
        p.trackPublications.forEach((pub) => {
          if (pub.kind === Track.Kind.Video) {
            pub.setSubscribed(subscribed)
          }
        })
      })
    }
    applyToExisting(!audioOnly)

    // Listeners only matter when audio-only is ON: new arrivals & late
    // publications need to be unsubscribed before they start eating bandwidth.
    if (!audioOnly) return

    const onParticipantConnected = (p: RemoteParticipant) => {
      p.trackPublications.forEach((pub) => {
        if (pub.kind === Track.Kind.Video) pub.setSubscribed(false)
      })
    }
    const onTrackPublished = (pub: RemoteTrackPublication) => {
      if (pub.kind === Track.Kind.Video) pub.setSubscribed(false)
    }

    room.on(RoomEvent.ParticipantConnected, onParticipantConnected)
    room.on(RoomEvent.TrackPublished, onTrackPublished)
    return () => {
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected)
      room.off(RoomEvent.TrackPublished, onTrackPublished)
    }
  }, [room, audioOnly])

  return (
    <button
      type="button"
      onClick={() => setAudioOnly((v) => !v)}
      aria-pressed={audioOnly}
      title={audioOnly ? t('controls.audioOnlyActiveTitle') : t('controls.audioOnlyTitle')}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-xs font-medium border transition-colors ${
        audioOnly
          ? 'bg-[color-mix(in_oklab,var(--color-flame)_18%,transparent)] text-[var(--color-flame-soft)] border-[var(--color-flame)]'
          : 'bg-[var(--color-surface)] text-[var(--color-ink)] border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)]'
      }`}
    >
      <HeadphonesIcon />
      <span>{audioOnly ? t('controls.audioOnly') : t('controls.audioOnlyOff')}</span>
    </button>
  )
}

function HeadphonesIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  )
}
