import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParticipants } from '@livekit/components-react'
import { ParticipantsPanel } from '@/components/ParticipantsPanel'
import { WaitingRoomPanel } from '@/components/WaitingRoomPanel'
import { ChatPanel } from '@/components/ChatPanel'
import { RecordingControl } from '@/components/RecordingControl'
import { RecordingIndicator } from '@/components/RecordingIndicator'
import { RaiseHandButton, useHandsRaisedCount } from '@/components/RaiseHandButton'
import { Reactions } from '@/components/Reactions'
import { PushToTalkButton } from '@/components/PushToTalkButton'
import { AudioOnlyButton } from '@/components/AudioOnlyButton'
import { MirrorButton } from '@/components/MirrorButton'
import { BackgroundEffectButton } from '@/components/BackgroundEffectButton'
import { NoiseSuppressionButton } from '@/components/NoiseSuppressionButton'
import { SoundboardButton } from '@/components/SoundboardButton'
import { ScreenShareButton } from '@/components/ScreenShareButton'
import { HostMenu } from '@/components/HostMenu'
import { VoteButtons } from '@/components/VoteButtons'
import { PollsPanel } from '@/components/PollsPanel'
import { QAPanel } from '@/components/QAPanel'
import { BreakoutPanel } from '@/components/BreakoutPanel'
import { LaserPointerButton } from '@/components/LaserPointerButton'
import { WhiteboardPanel } from '@/components/WhiteboardPanel'
import { useWaitingList } from '@/hooks/useWaiting'
import { useRoomChat } from '@/hooks/useRoomChat'
import { onUiAction } from '@/lib/uiActions'

/**
 * Floating overlay rendered on top of <VideoConference />:
 *   - top-left: recording badge (everyone) + participants button (everyone) + record button (owner)
 *   - sliding panel from the left when participants list is opened
 */
export function RoomControls({
  slug,
  isHost,
  isOwner,
  waitingRoomEnabled,
}: {
  slug: string
  /** Owner OR co-host — gets host-level controls (recording, mute, kick, waiting admit). */
  isHost: boolean
  /** Owner only — additionally gets cohost management UI in ParticipantsPanel. */
  isOwner: boolean
  waitingRoomEnabled: boolean
}) {
  const { t } = useTranslation()
  const [participantsOpen, setParticipantsOpen] = useState(false)
  const [waitingOpen, setWaitingOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [pollsOpen, setPollsOpen] = useState(false)
  const [qaOpen, setQaOpen] = useState(false)
  const [breakoutsOpen, setBreakoutsOpen] = useState(false)
  const [whiteboardOpen, setWhiteboardOpen] = useState(false)
  const participants = useParticipants()
  const handsRaised = useHandsRaisedCount()

  // Hosts (owner + cohost) with waiting room ON get a live badge count so they don't miss arrivals.
  const waitingPoll = useWaitingList(slug, isHost && waitingRoomEnabled)
  const waitingCount = waitingPoll.data?.length ?? 0

  // Unread chat badge: count new messages since user last opened the panel.
  const { messages: chatMessages } = useRoomChat()
  const lastSeenIdxRef = useRef(0)
  const [unreadChat, setUnreadChat] = useState(0)
  useEffect(() => {
    if (chatOpen) {
      lastSeenIdxRef.current = chatMessages.length
      setUnreadChat(0)
      return
    }
    setUnreadChat(Math.max(0, chatMessages.length - lastSeenIdxRef.current))
  }, [chatMessages.length, chatOpen])

  // Keyboard shortcuts dispatch UI actions; mirror them into our panel state.
  useEffect(() => {
    const offChat = onUiAction('toggle-chat', () => setChatOpen((v) => !v))
    const offPart = onUiAction('toggle-participants', () => setParticipantsOpen((v) => !v))
    return () => {
      offChat()
      offPart()
    }
  }, [])

  return (
    <>
      <div className="fixed top-4 left-4 z-40 flex flex-wrap items-center gap-2">
        <RecordingIndicator />

        <button
          type="button"
          onClick={() => setParticipantsOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-xs font-medium bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)] transition-colors"
        >
          <PeopleIcon />
          {t('controls.participants')}
          <span className="font-mono text-[var(--color-ink-muted)]">
            {participants.length}
          </span>
          {handsRaised > 0 && (
            <span
              className="inline-flex items-center gap-0.5 rounded bg-[color-mix(in_oklab,var(--color-flame)_25%,transparent)] text-[var(--color-flame-soft)] px-1 py-px text-[10px] font-mono"
              title={t('controls.handsRaisedTitle', { n: handsRaised })}
            >
              ✋{handsRaised}
            </span>
          )}
        </button>

        {isHost && waitingRoomEnabled && (
          <button
            type="button"
            onClick={() => setWaitingOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-xs font-medium bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)] transition-colors"
          >
            <WaitingIcon />
            {t('controls.waitingRoom')}
            {waitingCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] px-1 h-[18px] rounded-full bg-[var(--color-flame)] text-[var(--color-canvas)] text-[10px] font-mono">
                {waitingCount}
              </span>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={() => setChatOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-xs font-medium bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)] transition-colors"
        >
          <ChatIcon />
          {t('controls.chat')}
          {unreadChat > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] px-1 h-[18px] rounded-full bg-[var(--color-flame)] text-[var(--color-canvas)] text-[10px] font-mono">
              {unreadChat > 99 ? '99+' : unreadChat}
            </span>
          )}
        </button>

        <Reactions />
        <SoundboardButton />
        <RaiseHandButton />
        <VoteButtons />
        <button
          type="button"
          onClick={() => setPollsOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-xs font-medium bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)] transition-colors"
          title={t('controls.polls')}
        >
          <PollIcon />
          {t('controls.polls')}
        </button>
        <button
          type="button"
          onClick={() => setQaOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-xs font-medium bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)] transition-colors"
          title={t('controls.qa')}
        >
          <QAIcon />
          {t('controls.qa')}
        </button>
        <button
          type="button"
          onClick={() => setWhiteboardOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-xs font-medium bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)] transition-colors"
          title={t('controls.boardTitle')}
        >
          <BoardIcon />
          {t('controls.board')}
        </button>
        <ScreenShareButton />
        <LaserPointerButton />
        <PushToTalkButton />
        <AudioOnlyButton />
        <MirrorButton />
        <BackgroundEffectButton />
        <NoiseSuppressionButton />

        {isHost && (
          <button
            type="button"
            onClick={() => setBreakoutsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-xs font-medium bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)] transition-colors"
            title={t('controls.breakoutTitle')}
          >
            <BreakoutIcon />
            {t('controls.breakout')}
          </button>
        )}
        {isHost && <HostMenu slug={slug} />}
        {isHost && <RecordingControl slug={slug} />}
      </div>

      <ParticipantsPanel
        open={participantsOpen}
        onClose={() => setParticipantsOpen(false)}
        slug={slug}
        isHost={isHost}
        isOwner={isOwner}
      />

      {isHost && (
        <WaitingRoomPanel
          open={waitingOpen}
          onClose={() => setWaitingOpen(false)}
          slug={slug}
          enabled={waitingRoomEnabled}
        />
      )}

      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} isHost={isHost} />
      <PollsPanel
        open={pollsOpen}
        onClose={() => setPollsOpen(false)}
        slug={slug}
        isHost={isHost}
      />
      <QAPanel
        open={qaOpen}
        onClose={() => setQaOpen(false)}
        slug={slug}
        isHost={isHost}
      />
      {isHost && (
        <BreakoutPanel
          open={breakoutsOpen}
          onClose={() => setBreakoutsOpen(false)}
          slug={slug}
        />
      )}

      <WhiteboardPanel open={whiteboardOpen} onClose={() => setWhiteboardOpen(false)} />
    </>
  )
}

function PeopleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function WaitingIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function PollIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="6" y1="20" x2="6" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="18" y1="20" x2="18" y2="14" />
    </svg>
  )
}

function BoardIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="14" rx="2" />
      <line x1="3" y1="20" x2="21" y2="20" />
      <path d="M7 13l3-3 2 2 4-5" />
    </svg>
  )
}

function BreakoutIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function QAIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}
