import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useLocalParticipant,
  useParticipants,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import type { Participant } from 'livekit-client'
import { ApiError, api } from '@/lib/api'
import { handRaisedAt, isHandRaised } from '@/components/RaiseHandButton'
import { useLocalPin } from '@/hooks/useLocalPin'
import { presenceColor, readPresence } from '@/hooks/usePresence'
import { formatSpeakingTime, useSpeakingTimes } from '@/hooks/useSpeakingTimes'
import { useAddCohost, useCohosts, useRemoveCohost } from '@/hooks/useCohosts'
import { TIMEZONE_ATTR } from '@/hooks/useBroadcastMyTimezone'
import { useSpotlight } from '@/hooks/useSpotlight'
import { AVATAR_ATTR_KEY } from '@/hooks/useBroadcastMyAvatar'
import { Avatar } from '@/components/Avatar'
import { dispatchOpenDm } from '@/components/ChatPanel'
import { dispatchUiAction } from '@/lib/uiActions'

type Props = {
  open: boolean
  onClose: () => void
  slug: string
  /** Owner or co-host — sees mute/kick buttons. */
  isHost: boolean
  /** Owner only — additionally sees promote/demote buttons. */
  isOwner: boolean
}

/**
 * Slide-in panel from the LEFT listing all participants in the room. Hosts
 * (owner + co-hosts) see mute/kick buttons. Owner additionally sees
 * "Jadiin co-host" / "Cabut" buttons on auth participants.
 */
export function ParticipantsPanel({ open, onClose, slug, isHost, isOwner }: Props) {
  const { t } = useTranslation()
  const rawParticipants = useParticipants()
  const { localParticipant } = useLocalParticipant()
  const localIdentity = localParticipant?.identity

  const cohostsQuery = useCohosts(slug)
  const cohostIDs = new Set(cohostsQuery.data?.map((c) => c.user_id) ?? [])

  // Sort: hands-raised first (FIFO by hand_at timestamp), then everyone else in
  // original order. Participants without a timestamp (legacy/raised pre-update)
  // are pushed to the end of the hand-raised group.
  const handsRaisedQueue: string[] = []
  const participants = [...rawParticipants].sort((a, b) => {
    const aRaised = isHandRaised(a.attributes)
    const bRaised = isHandRaised(b.attributes)
    if (aRaised && !bRaised) return -1
    if (bRaised && !aRaised) return 1
    if (aRaised && bRaised) {
      const at = handRaisedAt(a.attributes) || Number.MAX_SAFE_INTEGER
      const bt = handRaisedAt(b.attributes) || Number.MAX_SAFE_INTEGER
      return at - bt
    }
    return 0
  })
  for (const p of participants) {
    if (isHandRaised(p.attributes)) handsRaisedQueue.push(p.identity)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Backdrop catches clicks outside the panel */}
      <div
        className="absolute inset-0 bg-black/40 pointer-events-auto"
        onClick={onClose}
        aria-hidden
      />

      {/* Slide-in panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t('participants.title')}
        className="absolute left-0 top-0 h-full w-80 max-w-[90vw] bg-[var(--color-surface)] border-r border-[var(--color-line)] shadow-2xl pointer-events-auto flex flex-col"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-line)]">
          <h2 className="text-sm font-semibold">
            {t('participants.title')}{' '}
            <span className="font-mono text-xs text-[var(--color-ink-muted)]">
              ({participants.length})
            </span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] text-lg leading-none px-2"
            aria-label={t('common.close')}
          >
            ×
          </button>
        </header>

        <ul className="flex-1 overflow-y-auto divide-y divide-[var(--color-line)]">
          {participants.map((p) => {
            const queuePos = handsRaisedQueue.indexOf(p.identity)
            return (
              <ParticipantRow
                key={p.identity}
                participant={p}
                isSelf={p.identity === localIdentity}
                isHost={isHost}
                isOwner={isOwner}
                isCohost={cohostIDs.has(parseAuthIdentity(p.identity) ?? -1)}
                slug={slug}
                handQueuePosition={queuePos >= 0 ? queuePos + 1 : null}
              />
            )
          })}
        </ul>
      </aside>
    </div>
  )
}

/**
 * Authenticated participants have numeric identity (= user.id). Guests have
 * "guest_xxxx" identity. Returns null for guest identities so the cohost UI
 * stays hidden for them.
 */
function parseAuthIdentity(identity: string): number | null {
  if (!/^\d+$/.test(identity)) return null
  const n = parseInt(identity, 10)
  return Number.isFinite(n) ? n : null
}

function ParticipantRow({
  participant,
  isSelf,
  isHost,
  isOwner,
  isCohost,
  slug,
  handQueuePosition,
}: {
  participant: Participant
  isSelf: boolean
  isHost: boolean
  isOwner: boolean
  isCohost: boolean
  slug: string
  /** 1-based position in the raised-hands queue, or null if hand not raised. */
  handQueuePosition: number | null
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmKick, setConfirmKick] = useState(false)

  const micPub = participant.getTrackPublication(Track.Source.Microphone)
  const micMuted = micPub?.isMuted ?? true
  const camPub = participant.getTrackPublication(Track.Source.Camera)
  const camMuted = camPub?.isMuted ?? true
  const sharingScreen =
    !!participant.getTrackPublication(Track.Source.ScreenShare)

  const displayName = participant.name?.trim() || participant.identity
  const handRaised = isHandRaised(participant.attributes)
  const authUserID = parseAuthIdentity(participant.identity)
  const tz = participant.attributes?.[TIMEZONE_ATTR]
  const tzShort = tz ? shortTimezone(tz) : null

  const addCohost = useAddCohost(slug)
  const removeCohost = useRemoveCohost(slug)
  const { spotlight, setSpotlight } = useSpotlight()
  const isSpotlighted = spotlight.identity === participant.identity
  const { pin, setPin } = useLocalPin()
  const isPinned = pin.identity === participant.identity

  async function muteAudio() {
    setBusy(true)
    setError(null)
    try {
      await api(`/rooms/${slug}/participants/${participant.identity}/mute`, {
        method: 'POST',
        body: { source: 'audio', muted: true },
      })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('participants.errMute'))
    } finally {
      setBusy(false)
    }
  }

  async function kick() {
    setBusy(true)
    setError(null)
    try {
      await api(`/rooms/${slug}/participants/${participant.identity}`, {
        method: 'DELETE',
      })
      setConfirmKick(false)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('participants.errKick'))
    } finally {
      setBusy(false)
    }
  }

  async function stopShare() {
    setBusy(true)
    setError(null)
    try {
      await api(`/rooms/${slug}/participants/${participant.identity}/mute`, {
        method: 'POST',
        body: { source: 'screen_share', muted: true },
      })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('participants.errStopShare'))
    } finally {
      setBusy(false)
    }
  }

  async function offCam() {
    setBusy(true)
    setError(null)
    try {
      await api(`/rooms/${slug}/participants/${participant.identity}/mute`, {
        method: 'POST',
        body: { source: 'video', muted: true },
      })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('participants.errOffCam'))
    } finally {
      setBusy(false)
    }
  }

  function togglePromote() {
    if (authUserID === null) return
    setError(null)
    const action = isCohost ? removeCohost : addCohost
    action.mutate(authUserID, {
      onError: (e) => setError(e instanceof ApiError ? e.message : t('participants.errGeneric')),
    })
  }

  // Owner can promote/demote any authenticated, non-self participant.
  const canManageCohost = isOwner && !isSelf && authUserID !== null

  const presence = readPresence(participant.attributes)
  const { times } = useSpeakingTimes()
  const speakingSec = times[participant.identity] ?? 0

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <Avatar
          name={displayName}
          src={participant.attributes?.[AVATAR_ATTR_KEY] || null}
          size="md"
          presenceColor={presenceColor(presence)}
          presenceLabel={t(`presence.${presence}`)}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--color-ink)] truncate flex items-center gap-1.5">
            {handRaised && (
              <span
                className="inline-flex items-center gap-0.5 shrink-0"
                title={
                  handQueuePosition
                    ? t('participants.handQueueTitle', { n: handQueuePosition })
                    : t('participants.raiseHand')
                }
                aria-label={t('participants.raiseHandAria')}
              >
                <span className="text-base leading-none animate-pulse">✋</span>
                {handQueuePosition && (
                  <span className="font-mono text-[10px] text-[var(--color-flame-soft)] bg-[color-mix(in_oklab,var(--color-flame)_18%,transparent)] rounded px-1 leading-tight">
                    #{handQueuePosition}
                  </span>
                )}
              </span>
            )}
            <span className="truncate">{displayName}</span>
            {isCohost && (
              <span
                className="ml-1 inline-flex items-center rounded bg-[color-mix(in_oklab,var(--color-flame)_18%,transparent)] text-[var(--color-flame-soft)] px-1.5 py-px text-[10px] font-mono uppercase tracking-wider shrink-0"
                title={t('participants.coHost')}
              >
                {t('participants.coHost')}
              </span>
            )}
            {sharingScreen && (
              <span
                className="ml-1 inline-flex items-center rounded border border-[var(--color-flame)] text-[var(--color-flame-soft)] px-1.5 py-px text-[10px] font-mono uppercase tracking-wider shrink-0"
                title={t('participants.shareTitle')}
              >
                {t('participants.share')}
              </span>
            )}
            {isSelf && (
              <span className="ml-1 text-[10px] font-mono uppercase tracking-wider text-[var(--color-flame)] shrink-0">
                {t('participants.you')}
              </span>
            )}
          </p>
          <p className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--color-ink-muted)]">
            <TrackStatus icon="mic" muted={micMuted} />
            <TrackStatus icon="cam" muted={camMuted} />
            {speakingSec > 0 && (
              <span
                title={t('participants.speakingTimeTitle')}
                className="font-mono text-[var(--color-ink-faint)]"
              >
                🎙 {formatSpeakingTime(speakingSec)}
              </span>
            )}
            {tzShort && (
              <span
                title={tz ?? undefined}
                className="font-mono uppercase tracking-wider text-[var(--color-ink-faint)]"
              >
                {tzShort}
              </span>
            )}
          </p>
        </div>

        {/* Local pin button — available to everyone, affects only this client's view. */}
        {!isSelf && (
          <button
            type="button"
            onClick={() =>
              isPinned
                ? setPin(null, null)
                : setPin(participant.identity, displayName)
            }
            title={isPinned ? t('participants.unpinLocal') : t('participants.pinLocal')}
            className={`h-7 px-2 text-[11px] rounded border shrink-0 ${
              isPinned
                ? 'bg-[var(--color-surface-2)] border-[var(--color-ink)] text-[var(--color-ink)]'
                : 'border-[var(--color-line)] text-[var(--color-ink-soft)] hover:border-[var(--color-ink)] hover:text-[var(--color-ink)]'
            }`}
          >
            📌
          </button>
        )}

        {/* DM button — available to any auth user (not host-gated). */}
        {!isSelf && authUserID !== null && (
          <button
            type="button"
            onClick={() => {
              dispatchOpenDm(authUserID, displayName)
              dispatchUiAction('toggle-chat')
            }}
            title={t('participants.dmTitle', { name: displayName })}
            className="h-7 px-2 text-[11px] rounded border border-[var(--color-line)] text-[var(--color-ink-soft)] hover:border-[var(--color-flame)] hover:text-[var(--color-flame-soft)] shrink-0"
          >
            💬
          </button>
        )}

        {isHost && !isSelf && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() =>
                isSpotlighted
                  ? setSpotlight(null, null)
                  : setSpotlight(participant.identity, displayName)
              }
              title={isSpotlighted ? t('participants.unspotlight') : t('participants.spotlight')}
              className={`h-7 px-2 text-[11px] rounded border ${
                isSpotlighted
                  ? 'bg-[var(--color-flame)] text-[var(--color-canvas)] border-[var(--color-flame)]'
                  : 'border-[var(--color-line)] text-[var(--color-ink-soft)] hover:border-[var(--color-flame)] hover:text-[var(--color-flame-soft)]'
              }`}
            >
              📌
            </button>
            {!micMuted && (
              <button
                type="button"
                onClick={muteAudio}
                disabled={busy}
                className="h-7 px-2 text-[11px] rounded border border-[var(--color-line)] text-[var(--color-ink-soft)] hover:border-[var(--color-line-strong)] hover:text-[var(--color-ink)] disabled:opacity-50"
              >
                {t('participants.mute')}
              </button>
            )}
            {!camMuted && (
              <button
                type="button"
                onClick={offCam}
                disabled={busy}
                title={t('participants.offCamTitle')}
                className="h-7 px-2 text-[11px] rounded border border-[var(--color-line)] text-[var(--color-ink-soft)] hover:border-[var(--color-line-strong)] hover:text-[var(--color-ink)] disabled:opacity-50"
              >
                {t('participants.offCam')}
              </button>
            )}
            {sharingScreen && (
              <button
                type="button"
                onClick={stopShare}
                disabled={busy}
                className="h-7 px-2 text-[11px] rounded border border-[var(--color-line)] text-[var(--color-ink-soft)] hover:border-[var(--color-flame)] hover:text-[var(--color-flame-soft)] disabled:opacity-50"
                title={t('participants.stopShareTitle')}
              >
                {t('participants.stopShare')}
              </button>
            )}
            {confirmKick ? (
              <>
                <button
                  type="button"
                  onClick={kick}
                  disabled={busy}
                  className="h-7 px-2 text-[11px] rounded bg-[var(--color-bad)] text-white hover:opacity-90"
                >
                  {t('participants.sure')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmKick(false)}
                  className="h-7 px-2 text-[11px] rounded text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                >
                  {t('common.cancel').toLowerCase()}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmKick(true)}
                disabled={busy}
                className="h-7 px-2 text-[11px] rounded border border-[var(--color-line)] text-[var(--color-bad)] hover:bg-[color-mix(in_oklab,var(--color-bad)_10%,transparent)]"
              >
                {t('participants.expel')}
              </button>
            )}
          </div>
        )}
      </div>

      {canManageCohost && (
        <div className="mt-2 pl-12">
          <button
            type="button"
            onClick={togglePromote}
            disabled={addCohost.isPending || removeCohost.isPending}
            className="h-6 px-2 text-[11px] rounded border border-[var(--color-line)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:border-[var(--color-line-strong)] disabled:opacity-50 font-mono uppercase tracking-wider"
          >
            {isCohost ? t('participants.demote') : t('participants.promote')}
          </button>
        </div>
      )}

      {error && <p className="mt-1 text-[10px] text-[var(--color-bad)]">{error}</p>}
    </li>
  )
}

function TrackStatus({ icon, muted }: { icon: 'mic' | 'cam'; muted: boolean }) {
  const { t } = useTranslation()
  const device = icon === 'mic' ? t('participants.mic') : t('participants.cam')
  const state = muted ? t('participants.off') : t('participants.on')
  return (
    <span
      className={`inline-flex items-center gap-1 ${
        muted ? 'text-[var(--color-ink-faint)]' : 'text-[var(--color-ok)]'
      }`}
    >
      {icon === 'mic' ? <MicIcon muted={muted} /> : <CamIcon muted={muted} />}
      <span className="font-mono uppercase tracking-wider">{device} {state}</span>
    </span>
  )
}


function MicIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
      {muted && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  )
}

/**
 * Maps an IANA timezone like "Asia/Jakarta" to a short readable label.
 * Falls back to the offset in hours (e.g. "UTC+7") for less-common zones.
 */
function shortTimezone(tz: string): string {
  switch (tz) {
    case 'Asia/Jakarta':
      return 'WIB'
    case 'Asia/Makassar':
      return 'WITA'
    case 'Asia/Jayapura':
      return 'WIT'
    case 'Asia/Singapore':
      return 'SGT'
    case 'Asia/Kuala_Lumpur':
      return 'MYT'
    case 'UTC':
      return 'UTC'
  }
  // Fallback: compute offset from "now" in the given zone.
  try {
    const now = new Date()
    const offsetMin =
      (new Date(now.toLocaleString('en-US', { timeZone: tz })).getTime() -
        new Date(now.toLocaleString('en-US', { timeZone: 'UTC' })).getTime()) /
      60_000
    const sign = offsetMin >= 0 ? '+' : '-'
    const hr = Math.floor(Math.abs(offsetMin) / 60)
    const mn = Math.abs(offsetMin) % 60
    return `UTC${sign}${hr}${mn ? `:${String(mn).padStart(2, '0')}` : ''}`
  } catch {
    return tz.split('/').pop() ?? tz
  }
}

function CamIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
      {muted && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  )
}
