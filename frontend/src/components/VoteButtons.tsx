import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useLocalParticipant,
  useParticipants,
  useRoomContext,
} from '@livekit/components-react'
import { RoomEvent } from 'livekit-client'
import { HOST_TOPIC, decodeHostAction } from '@/lib/hostBroadcast'

const VOTE_ATTR = 'vote'
type Vote = 'yes' | 'no' | ''

/**
 * Two-button quick vote (Setuju / Tolak) — stored on each participant's
 * LiveKit attributes so everyone sees the live count without backend round
 * trips. Pattern parallels RaiseHandButton.
 *
 * Host can reset via HostMenu → broadcasts `reset_votes` and every client
 * clears their own attribute (host can't touch other participants' attrs).
 */
export function VoteButtons() {
  const { t } = useTranslation()
  const { localParticipant } = useLocalParticipant()
  const participants = useParticipants()
  const room = useRoomContext()

  const myVote = (localParticipant?.attributes?.[VOTE_ATTR] as Vote) ?? ''
  const yesCount = participants.filter((p) => p.attributes?.[VOTE_ATTR] === 'yes').length
  const noCount = participants.filter((p) => p.attributes?.[VOTE_ATTR] === 'no').length

  // Listen for host-issued "reset_votes" broadcast.
  useEffect(() => {
    if (!room || !localParticipant) return
    const onData = (
      payload: Uint8Array,
      _participant: unknown,
      _kind: unknown,
      topic?: string,
    ) => {
      if (topic !== HOST_TOPIC) return
      const msg = decodeHostAction(payload)
      if (!msg) return
      if (msg.action === 'reset_votes' && localParticipant.attributes?.[VOTE_ATTR]) {
        localParticipant.setAttributes({ [VOTE_ATTR]: '' }).catch(() => {})
      }
    }
    room.on(RoomEvent.DataReceived, onData)
    return () => {
      room.off(RoomEvent.DataReceived, onData)
    }
  }, [room, localParticipant])

  async function vote(v: 'yes' | 'no') {
    if (!localParticipant) return
    const next: Vote = myVote === v ? '' : v
    await localParticipant.setAttributes({ [VOTE_ATTR]: next }).catch(() => {})
  }

  return (
    <div className="inline-flex items-center rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface)] overflow-hidden">
      <button
        type="button"
        onClick={() => vote('yes')}
        aria-pressed={myVote === 'yes'}
        title={myVote === 'yes' ? t('votes.agreeCancel') : t('votes.agreeTitle')}
        className={`inline-flex items-center gap-1.5 px-3 h-8 text-xs font-medium border-r border-[var(--color-line)] transition-colors ${
          myVote === 'yes'
            ? 'bg-[color-mix(in_oklab,var(--color-ok)_25%,transparent)] text-[var(--color-ok)]'
            : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)]'
        }`}
      >
        <CheckIcon />
        {yesCount > 0 && <span className="font-mono">{yesCount}</span>}
      </button>
      <button
        type="button"
        onClick={() => vote('no')}
        aria-pressed={myVote === 'no'}
        title={myVote === 'no' ? t('votes.rejectCancel') : t('votes.rejectTitle')}
        className={`inline-flex items-center gap-1.5 px-3 h-8 text-xs font-medium transition-colors ${
          myVote === 'no'
            ? 'bg-[color-mix(in_oklab,var(--color-bad)_25%,transparent)] text-[var(--color-bad)]'
            : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)]'
        }`}
      >
        <CrossIcon />
        {noCount > 0 && <span className="font-mono">{noCount}</span>}
      </button>
    </div>
  )
}

/** Returns whether anyone in the room has voted (used to enable reset in HostMenu). */
export function useAnyVotes(): boolean {
  const participants = useParticipants()
  return participants.some((p) => p.attributes?.[VOTE_ATTR] === 'yes' || p.attributes?.[VOTE_ATTR] === 'no')
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function CrossIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
