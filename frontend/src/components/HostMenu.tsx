import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useLocalParticipant,
  useParticipants,
  useRoomContext,
} from '@livekit/components-react'
import { api } from '@/lib/api'
import { useRoomLock } from '@/hooks/useRoomLock'
import { useRoomInfo } from '@/hooks/useRoomInfo'
import { useHandsRaisedCount } from '@/components/RaiseHandButton'
import { useAnyVotes } from '@/components/VoteButtons'
import { useChatCopyLock } from '@/hooks/useChatCopyLock'
import { useAnnotationEnabled, useChatDisabled, useUnmuteRestricted, useWatermark } from '@/hooks/useRoomFlags'
import { encodeHostAction, HOST_TOPIC } from '@/lib/hostBroadcast'
import { Track } from 'livekit-client'

type Props = {
  slug: string
}

/**
 * Dropdown that bundles host-only one-shot actions: lock, mute everyone,
 * lower all hands. Reserves first-class buttons in the toolbar for things
 * you tap *while in a meeting* (camera, share, raise hand). These are
 * occasional moderation actions, so a menu fits better than another button.
 */
export function HostMenu({ slug }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { room } = useRoomInfo(slug)
  const isLocked = room?.is_locked ?? false
  const lockMut = useRoomLock(slug)

  const participants = useParticipants()
  const { localParticipant } = useLocalParticipant()
  const lkRoom = useRoomContext()
  const handsRaised = useHandsRaisedCount()
  const anyVotes = useAnyVotes()
  const { locked: chatCopyLocked, setLocked: setChatCopyLocked } = useChatCopyLock()
  const { disabled: chatDisabled, setDisabled: setChatDisabled } = useChatDisabled()
  const { restricted: unmuteRestricted, setRestricted: setUnmuteRestricted } = useUnmuteRestricted()
  const { enabled: watermarkOn, setEnabled: setWatermarkOn } = useWatermark()
  const { enabled: annotateOn, setEnabled: setAnnotateOn } = useAnnotationEnabled()

  // Count unmuted, non-self participants — drives the disabled state of Mute all.
  const unmutedOthers = participants.filter((p) => {
    if (p.identity === localParticipant?.identity) return false
    const mic = p.getTrackPublication(Track.Source.Microphone)
    return mic && !mic.isMuted
  }).length

  // Close on outside click + Esc.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
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

  function toggleLock() {
    lockMut.mutate(!isLocked)
    setOpen(false)
  }

  async function muteAll() {
    setOpen(false)
    const targets = participants.filter(
      (p) => p.identity !== localParticipant?.identity,
    )
    // Fire in parallel; ignore individual failures so one bad participant
    // doesn't stall the rest.
    await Promise.all(
      targets.map((p) =>
        api(`/rooms/${slug}/participants/${p.identity}/mute`, {
          method: 'POST',
          body: { source: 'audio', muted: true },
        }).catch(() => null),
      ),
    )
  }

  async function lowerAllHands() {
    setOpen(false)
    if (!lkRoom?.localParticipant) return
    await lkRoom.localParticipant
      .publishData(encodeHostAction({ action: 'lower_all_hands' }), {
        reliable: true,
        topic: HOST_TOPIC,
      })
      .catch(() => {})
  }

  async function resetVotes() {
    setOpen(false)
    if (!lkRoom?.localParticipant) return
    await lkRoom.localParticipant
      .publishData(encodeHostAction({ action: 'reset_votes' }), {
        reliable: true,
        topic: HOST_TOPIC,
      })
      .catch(() => {})
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-xs font-medium bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)] transition-colors"
      >
        <CrownIcon />
        {t('controls.hostMenu')}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1 z-50 min-w-[220px] rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface)] shadow-2xl py-1"
        >
          <MenuItem
            onClick={toggleLock}
            disabled={lockMut.isPending}
            icon={isLocked ? '🔓' : '🔒'}
            label={isLocked ? t('hostMenu.lockOn') : t('hostMenu.lockOff')}
            hint={isLocked ? t('hostMenu.lockOnHint') : t('hostMenu.lockOffHint')}
          />
          <MenuItem
            onClick={muteAll}
            disabled={unmutedOthers === 0}
            icon="🎙"
            label={t('hostMenu.muteAll')}
            hint={
              unmutedOthers > 0
                ? t('hostMenu.muteAllHint', { n: unmutedOthers })
                : t('hostMenu.muteAllNone')
            }
          />
          <MenuItem
            onClick={lowerAllHands}
            disabled={handsRaised === 0}
            icon="✋"
            label={t('hostMenu.lowerHands')}
            hint={
              handsRaised > 0
                ? t('hostMenu.lowerHandsHint', { n: handsRaised })
                : t('hostMenu.lowerHandsNone')
            }
          />
          <MenuItem
            onClick={resetVotes}
            disabled={!anyVotes}
            icon="🗳"
            label={t('hostMenu.resetVotes')}
            hint={anyVotes ? t('hostMenu.resetVotesHint') : t('hostMenu.resetVotesNone')}
          />
          <MenuItem
            onClick={() => {
              setChatCopyLocked(!chatCopyLocked)
              setOpen(false)
            }}
            icon={chatCopyLocked ? '🔓' : '🔒'}
            label={chatCopyLocked ? t('hostMenu.chatCopyOn') : t('hostMenu.chatCopyOff')}
            hint={chatCopyLocked ? t('hostMenu.chatCopyOnHint') : t('hostMenu.chatCopyOffHint')}
          />
          <MenuItem
            onClick={() => {
              setChatDisabled(!chatDisabled)
              setOpen(false)
            }}
            icon={chatDisabled ? '💬' : '🚫'}
            label={chatDisabled ? t('hostMenu.chatDisableOn') : t('hostMenu.chatDisableOff')}
            hint={chatDisabled ? t('hostMenu.chatDisableOnHint') : t('hostMenu.chatDisableOffHint')}
          />
          <MenuItem
            onClick={() => {
              setUnmuteRestricted(!unmuteRestricted)
              setOpen(false)
            }}
            icon={unmuteRestricted ? '🔊' : '🔇'}
            label={unmuteRestricted ? t('hostMenu.unmuteLockOn') : t('hostMenu.unmuteLockOff')}
            hint={unmuteRestricted ? t('hostMenu.unmuteLockOnHint') : t('hostMenu.unmuteLockOffHint')}
          />
          <MenuItem
            onClick={() => {
              setWatermarkOn(!watermarkOn)
              setOpen(false)
            }}
            icon={watermarkOn ? '🏷' : '🪪'}
            label={watermarkOn ? t('hostMenu.watermarkOn') : t('hostMenu.watermarkOff')}
            hint={watermarkOn ? t('hostMenu.watermarkOnHint') : t('hostMenu.watermarkOffHint')}
          />
          <MenuItem
            onClick={() => {
              setAnnotateOn(!annotateOn)
              setOpen(false)
            }}
            icon={annotateOn ? '🖍' : '✏️'}
            label={annotateOn ? t('hostMenu.annotateOn') : t('hostMenu.annotateOff')}
            hint={annotateOn ? t('hostMenu.annotateOnHint') : t('hostMenu.annotateOffHint')}
          />
        </div>
      )}
    </div>
  )
}

function MenuItem({
  onClick,
  disabled,
  icon,
  label,
  hint,
}: {
  onClick: () => void
  disabled?: boolean
  icon: string
  label: string
  hint?: string
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="w-full px-3 py-2 text-left hover:bg-[var(--color-surface-2)] disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-base leading-none">{icon}</span>
        <span className="text-sm text-[var(--color-ink)]">{label}</span>
      </div>
      {hint && (
        <p className="text-[10px] text-[var(--color-ink-faint)] mt-0.5 ml-7 font-mono uppercase tracking-wider">
          {hint}
        </p>
      )}
    </button>
  )
}

function CrownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 17l4-8 4 5 4-7 4 7 4-5 4 8H2z" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  )
}
