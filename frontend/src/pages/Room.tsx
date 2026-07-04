import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LiveKitRoom, VideoConference } from '@livekit/components-react'
import { DisconnectReason } from 'livekit-client'
import '@livekit/components-styles'

import { ApiError } from '@/lib/api'
import { useRoomToken } from '@/hooks/useRoomToken'
import { useWaitingStatus } from '@/hooks/useWaiting'
import { useRoomInfo } from '@/hooks/useRoomInfo'
import { useAuth } from '@/hooks/useAuth'
import { loadDevicePrefs, usePrejoinMedia } from '@/hooks/usePrejoinMedia'
import { Button } from '@/components/ui/Button'
import { Field, Input, PasswordInput } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Alert'
import { ChatToastNotifier } from '@/components/ChatToastNotifier'
import { RoomControls } from '@/components/RoomControls'
import { RoomEventSounds } from '@/components/RoomEventSounds'
import { ViewControls } from '@/components/ViewControls'
import { RoomChatProvider } from '@/hooks/useRoomChat'
import { RecordingConsentBanner } from '@/components/RecordingConsentBanner'
import { BreakoutAssignmentListener } from '@/components/BreakoutAssignmentListener'
import { MicLockEnforcer } from '@/components/MicLockEnforcer'
import { ShortcutCheatSheet } from '@/components/ShortcutCheatSheet'
import { SpotlightBanner } from '@/components/SpotlightBanner'
import { WatermarkOverlay } from '@/components/WatermarkOverlay'
import { LaserPointerProvider } from '@/hooks/useLaserPointer'
import { LaserPointerOverlay } from '@/components/LaserPointerOverlay'
import { LocalPinHighlighter } from '@/components/LocalPinHighlighter'
import { LocalPinProvider } from '@/hooks/useLocalPin'
import { BackgroundEffectProvider } from '@/hooks/useBackgroundEffect'
import { NoiseSuppressionProvider } from '@/hooks/useNoiseSuppression'
import { SpeakingTimesProvider } from '@/hooks/useSpeakingTimes'
import { AnnotationProvider } from '@/hooks/useAnnotation'
import { AnnotationCanvas } from '@/components/AnnotationCanvas'
import { AnnotationToolbar } from '@/components/AnnotationToolbar'
import { SelfViewFloater } from '@/components/SelfViewFloater'
import { WhiteboardProvider } from '@/hooks/useWhiteboard'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useChatBrowserNotifications } from '@/hooks/useChatBrowserNotifications'
import { useLeaveConfirm } from '@/hooks/useLeaveConfirm'
import { useAttendanceLogging } from '@/hooks/useAttendanceLogging'
import { useBroadcastMyTimezone } from '@/hooks/useBroadcastMyTimezone'
import { useBroadcastMyAvatar } from '@/hooks/useBroadcastMyAvatar'
import { usePresence } from '@/hooks/usePresence'
import { onUiAction } from '@/lib/uiActions'

const GUEST_NAME_KEY = 'videoconf.guestName'
const JOIN_MIC_KEY = 'videoconf.joinMic'
const JOIN_CAM_KEY = 'videoconf.joinCam'

function readJoinPref(key: string, fallback: boolean): boolean {
  const v = localStorage.getItem(key)
  if (v === null) return fallback
  return v === '1'
}

function writeJoinPref(key: string, on: boolean) {
  localStorage.setItem(key, on ? '1' : '0')
}

const MAX_AUTO_RETRIES = 3
const AUTO_RETRY_BASE_MS = 1500

const TERMINAL_DISCONNECT_REASONS = new Set<DisconnectReason>([
  DisconnectReason.PARTICIPANT_REMOVED,
  DisconnectReason.ROOM_DELETED,
  DisconnectReason.ROOM_CLOSED,
  DisconnectReason.DUPLICATE_IDENTITY,
])

function isTerminalDisconnect(reason?: DisconnectReason): boolean {
  return reason !== undefined && TERMINAL_DISCONNECT_REASONS.has(reason)
}

type Phase = 'prejoin' | 'connecting' | 'waiting' | 'joined' | 'disconnected' | 'denied'

type LiveKitCreds = { token: string; url: string; room: string }

export function Room() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const { t } = useTranslation()
  const { room: roomInfo, isOwner, isHost } = useRoomInfo(slug)
  const waitingRoomEnabled = roomInfo?.waiting_room_enabled ?? false

  const [phase, setPhase] = useState<Phase>('prejoin')
  const [disconnectReason, setDisconnectReason] = useState<DisconnectReason | undefined>()
  const [autoRetries, setAutoRetries] = useState(0)
  const [guestName, setGuestName] = useState<string>(
    () => localStorage.getItem(GUEST_NAME_KEY) ?? '',
  )
  const [mic, setMic] = useState(() => readJoinPref(JOIN_MIC_KEY, true))
  const [cam, setCam] = useState(() => readJoinPref(JOIN_CAM_KEY, true))
  const [password, setPassword] = useState('')
  const [passwordPrompt, setPasswordPrompt] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  // Honor the owner's join defaults — but only ONCE per room-info load and
  // only while still in pre-join, so the user can still flip the toggles back
  // on (or off) before clicking Join.
  const appliedRoomDefaultsRef = useRef(false)
  useEffect(() => {
    if (appliedRoomDefaultsRef.current) return
    if (!roomInfo) return
    if (phase !== 'prejoin') return
    appliedRoomDefaultsRef.current = true
    if (roomInfo.default_mic_off) setMic(false)
    if (roomInfo.default_cam_off) setCam(false)
  }, [roomInfo, phase])

  // LiveKit creds — either from immediate token response or via waiting-room admit.
  const [liveKitCreds, setLiveKitCreds] = useState<LiveKitCreds | null>(null)
  const [requestToken, setRequestToken] = useState<string | null>(null)

  // Token only fires after user submits pre-join.
  const tokenQuery = useRoomToken(slug, {
    enabled: phase !== 'prejoin',
    guestName: isAuthenticated ? undefined : guestName,
    password,
  })

  // While parked in waiting room, poll backend until owner approves/denies.
  const waitingQuery = useWaitingStatus(phase === 'waiting' ? requestToken ?? undefined : undefined)

  // Send the user back to pre-join with a password prompt if the room is gated.
  useEffect(() => {
    if (phase !== 'connecting' || !tokenQuery.isError) return
    const err = tokenQuery.error
    if (!(err instanceof ApiError)) return
    if (err.code === 'password_required') {
      setPasswordPrompt(true)
      setPasswordError(null)
      setPhase('prejoin')
    } else if (err.code === 'password_invalid') {
      setPasswordPrompt(true)
      setPasswordError(t('room.passwordWrong'))
      setPassword('')
      setPhase('prejoin')
    }
  }, [phase, tokenQuery.isError, tokenQuery.error, t])

  // Token response → either immediate join, or park in waiting room.
  useEffect(() => {
    if (phase !== 'connecting' || !tokenQuery.data) return
    const data = tokenQuery.data
    if (data.status === 'immediate') {
      setLiveKitCreds({ token: data.token, url: data.url, room: data.room })
      setPhase('joined')
    } else {
      setRequestToken(data.request_token)
      setPhase('waiting')
    }
  }, [phase, tokenQuery.data])

  // Waiting → admitted or denied.
  useEffect(() => {
    if (phase !== 'waiting') return
    if (waitingQuery.isError) {
      // Token not found / expired — treat as denied so user gets feedback.
      setPhase('denied')
      return
    }
    const data = waitingQuery.data
    if (!data) return
    if (data.status === 'approved') {
      setLiveKitCreds({ token: data.token, url: data.url, room: data.room })
      setPhase('joined')
    } else if (data.status === 'denied') {
      setPhase('denied')
    }
  }, [phase, waitingQuery.data, waitingQuery.isError])

  // Reset auto-retry counter on a successful re-join.
  useEffect(() => {
    if (phase === 'joined' && autoRetries > 0) setAutoRetries(0)
  }, [phase, autoRetries])

  // Auto-rejoin on transient disconnect. Skip terminal reasons + cap retries.
  useEffect(() => {
    if (phase !== 'disconnected') return
    if (isTerminalDisconnect(disconnectReason)) return
    if (autoRetries >= MAX_AUTO_RETRIES) return

    const delay = AUTO_RETRY_BASE_MS * Math.pow(2, autoRetries) // 1.5s, 3s, 6s
    const t = window.setTimeout(() => {
      setAutoRetries((n) => n + 1)
      setDisconnectReason(undefined)
      setPhase('connecting')
    }, delay)
    return () => window.clearTimeout(t)
  }, [phase, disconnectReason, autoRetries])

  if (phase === 'prejoin') {
    return (
      <RoomShell>
        <PreJoin
          slug={slug ?? ''}
          isGuest={!isAuthenticated}
          guestName={guestName}
          onGuestNameChange={setGuestName}
          mic={mic}
          cam={cam}
          onToggleMic={() => setMic((v) => !v)}
          onToggleCam={() => setCam((v) => !v)}
          passwordPrompt={passwordPrompt}
          password={password}
          onPasswordChange={setPassword}
          passwordError={passwordError}
          onSubmit={() => {
            if (!isAuthenticated && guestName.trim()) {
              localStorage.setItem(GUEST_NAME_KEY, guestName.trim())
            }
            writeJoinPref(JOIN_MIC_KEY, mic)
            writeJoinPref(JOIN_CAM_KEY, cam)
            setPasswordError(null)
            setPhase('connecting')
          }}
        />
      </RoomShell>
    )
  }

  if (phase === 'denied') {
    return (
      <RoomShell>
        <DeniedState
          slug={slug}
          onBack={() => navigate(isAuthenticated ? '/dashboard' : '/')}
        />
      </RoomShell>
    )
  }

  if (phase === 'waiting') {
    return (
      <RoomShell>
        <WaitingState
          slug={slug}
          onCancel={() => {
            setRequestToken(null)
            navigate(isAuthenticated ? '/dashboard' : '/')
          }}
        />
      </RoomShell>
    )
  }

  if (tokenQuery.isError) {
    return (
      <RoomShell>
        <ErrorState
          error={tokenQuery.error}
          slug={slug}
          isGuest={!isAuthenticated}
          onRetry={() => setPhase('prejoin')}
        />
      </RoomShell>
    )
  }

  if (!liveKitCreds) {
    return (
      <RoomShell>
        <LoadingState slug={slug} />
      </RoomShell>
    )
  }

  // Use the camera/mic device preferences captured in pre-join — falls back to
  // browser default if the saved deviceId is gone.
  const videoProp = useMemo(() => mediaConstraint(cam, loadDevicePrefs().cameraId), [cam])
  const audioProp = useMemo(() => mediaConstraint(mic, loadDevicePrefs().micId), [mic])

  // Block accidental tab close / reload while we're actually in a meeting.
  useLeaveConfirm(phase === 'joined')

  // Q-key shortcut → ask before navigating out of the room.
  useEffect(() => {
    if (phase !== 'joined') return
    return onUiAction('leave-room', () => {
      if (window.confirm(t('leaveConfirm'))) {
        navigate(isAuthenticated ? '/dashboard' : '/')
      }
    })
  }, [phase, navigate, isAuthenticated, t])

  if (phase === 'disconnected') {
    const willAutoRetry =
      !isTerminalDisconnect(disconnectReason) && autoRetries < MAX_AUTO_RETRIES
    return (
      <RoomShell>
        <DisconnectedState
          reason={disconnectReason}
          attemptNumber={autoRetries + 1}
          maxAttempts={MAX_AUTO_RETRIES}
          willAutoRetry={willAutoRetry}
          onRejoin={() => {
            setDisconnectReason(undefined)
            setAutoRetries(0)
            setPhase('connecting')
          }}
          onLeave={() => navigate(isAuthenticated ? '/dashboard' : '/')}
        />
      </RoomShell>
    )
  }

  return (
    <LiveKitRoom
      serverUrl={liveKitCreds.url}
      token={liveKitCreds.token}
      connect
      video={videoProp}
      audio={audioProp}
      data-lk-theme="default"
      style={{ height: '100svh' }}
      onDisconnected={(reason) => {
        console.warn('[livekit] disconnected, reason:', reason)
        // Only navigate away if the user explicitly clicked Leave.
        // For anything else (network blip, signal close, server hiccup) keep
        // them on the page with a Rejoin button so they don't get yanked out.
        if (reason === DisconnectReason.CLIENT_INITIATED) {
          navigate(isAuthenticated ? '/dashboard' : '/')
        } else {
          setDisconnectReason(reason)
          setPhase('disconnected')
        }
      }}
    >
      <RoomChatProvider slug={slug}>
        <LaserPointerProvider>
          <AnnotationProvider>
          <WhiteboardProvider>
          <LocalPinProvider>
          <BackgroundEffectProvider>
          <NoiseSuppressionProvider>
          <SpeakingTimesProvider>
          <VideoConference />
        <ChatToastNotifier />
        <RoomControls
          slug={slug ?? ''}
          isHost={isHost}
          isOwner={isOwner}
          waitingRoomEnabled={waitingRoomEnabled}
        />
        <ViewControls />
        <RoomEventSounds />
        <RecordingConsentBanner />
        <ShortcutCheatSheet />
        <BreakoutAssignmentListener />
        <MicLockEnforcer isHost={isHost} />
        <SpotlightBanner />
        <LocalPinHighlighter />
        <WatermarkOverlay />
        <LaserPointerOverlay />
        <AnnotationCanvas />
        <AnnotationToolbar isHost={isHost} />
        <SelfViewFloater />
        <RoomKeyboardAndNotifs slug={slug} />
        </SpeakingTimesProvider>
        </NoiseSuppressionProvider>
        </BackgroundEffectProvider>
        </LocalPinProvider>
        </WhiteboardProvider>
        </AnnotationProvider>
        </LaserPointerProvider>
      </RoomChatProvider>
    </LiveKitRoom>
  )
}

function DisconnectedState({
  reason,
  attemptNumber,
  maxAttempts,
  willAutoRetry,
  onRejoin,
  onLeave,
}: {
  reason?: DisconnectReason
  attemptNumber: number
  maxAttempts: number
  willAutoRetry: boolean
  onRejoin: () => void
  onLeave: () => void
}) {
  const { t } = useTranslation()
  const { title, detail } = explainDisconnect(reason, t)
  return (
    <div className="text-center max-w-sm">
      <p className="font-mono text-xs text-[var(--color-flame)] mb-3">{t('room.disconnectTag')}</p>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-[var(--color-ink-muted)] mt-2 mb-4">{detail}</p>

      {willAutoRetry && (
        <div className="flex items-center justify-center gap-2 mb-6">
          <span className="w-4 h-4 rounded-full border-2 border-[var(--color-line-strong)] border-t-[var(--color-flame)] animate-spin" />
          <span className="text-sm text-[var(--color-ink-soft)]">
            {t('room.disconnectReconnecting', { n: attemptNumber, total: maxAttempts })}
          </span>
        </div>
      )}

      <div className="flex items-center justify-center gap-2">
        <Button onClick={onRejoin}>
          {willAutoRetry ? t('room.disconnectTryNow') : t('room.disconnectRetry')}
        </Button>
        <button
          type="button"
          onClick={onLeave}
          className="inline-flex items-center px-4 h-10 rounded-md border border-[var(--color-line)] text-sm hover:border-[var(--color-line-strong)]"
        >
          {t('room.disconnectLeave')}
        </button>
      </div>
    </div>
  )
}

function WaitingState({ slug, onCancel }: { slug?: string; onCancel: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="text-center max-w-sm">
      <p className="font-mono text-xs text-[var(--color-flame)] mb-3">{t('room.waitingTag')}</p>
      <h1 className="text-2xl font-semibold tracking-tight">{t('room.waitingTitle')}</h1>
      <p className="text-sm text-[var(--color-ink-muted)] mt-2 mb-6">
        {t('room.waitingBody')} <span className="font-mono text-[var(--color-ink)]">{slug}</span> {t('room.waitingBody2')}
      </p>

      <div className="flex items-center justify-center gap-2 mb-6">
        <span className="w-4 h-4 rounded-full border-2 border-[var(--color-line-strong)] border-t-[var(--color-flame)] animate-spin" />
        <span className="text-sm text-[var(--color-ink-soft)]">{t('room.waitingPolling')}</span>
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="inline-flex items-center px-4 h-10 rounded-md border border-[var(--color-line)] text-sm hover:border-[var(--color-line-strong)]"
      >
        {t('room.waitingCancel')}
      </button>
    </div>
  )
}

function DeniedState({ slug, onBack }: { slug?: string; onBack: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="text-center max-w-sm">
      <p className="font-mono text-xs text-[var(--color-bad)] mb-3">{t('room.deniedTag')}</p>
      <h1 className="text-2xl font-semibold tracking-tight">{t('room.deniedTitle')}</h1>
      <p className="text-sm text-[var(--color-ink-muted)] mt-2 mb-6">
        {t('room.deniedBody')} <span className="font-mono text-[var(--color-ink)]">{slug}</span> {t('room.deniedBody2')}
      </p>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center px-4 h-10 rounded-md bg-[var(--color-flame)] text-[var(--color-canvas)] font-medium text-sm hover:bg-[var(--color-flame-soft)]"
      >
        {t('common.back')}
      </button>
    </div>
  )
}

function explainDisconnect(
  reason: DisconnectReason | undefined,
  t: (k: string) => string,
): { title: string; detail: string } {
  switch (reason) {
    case DisconnectReason.SERVER_SHUTDOWN:
      return { title: t('room.discReasonServerTitle'), detail: t('room.discReasonServerDetail') }
    case DisconnectReason.PARTICIPANT_REMOVED:
      return { title: t('room.discReasonKickedTitle'), detail: t('room.discReasonKickedDetail') }
    case DisconnectReason.ROOM_DELETED:
    case DisconnectReason.ROOM_CLOSED:
      return { title: t('room.discReasonClosedTitle'), detail: t('room.discReasonClosedDetail') }
    case DisconnectReason.DUPLICATE_IDENTITY:
      return { title: t('room.discReasonDupeTitle'), detail: t('room.discReasonDupeDetail') }
    case DisconnectReason.STATE_MISMATCH:
    case DisconnectReason.SIGNAL_CLOSE:
    case DisconnectReason.JOIN_FAILURE:
      return { title: t('room.discReasonSignalTitle'), detail: t('room.discReasonSignalDetail') }
    case DisconnectReason.MIGRATION:
      return { title: t('room.discReasonMigrationTitle'), detail: t('room.discReasonMigrationDetail') }
    default:
      return { title: t('room.discReasonGenericTitle'), detail: t('room.discReasonGenericDetail') }
  }
}

/**
 * Side-effect-only sibling that hangs all in-room hooks that need to read
 * LiveKit + RoomChat contexts (keyboard shortcuts, chat browser notifs,
 * attendance logging). Renders nothing.
 */
function RoomKeyboardAndNotifs({ slug }: { slug: string | undefined }) {
  useKeyboardShortcuts()
  useChatBrowserNotifications()
  useAttendanceLogging(slug)
  useBroadcastMyTimezone()
  useBroadcastMyAvatar()
  // Pull presence into the LK attribute so other participants see the dot.
  usePresence()
  return null
}

/**
 * Translates a (enabled, deviceId) pair into the shape LiveKit's video/audio
 * props expect: `false` when disabled, `{ deviceId }` when a specific device
 * is saved, or `true` to use whatever the browser picks.
 */
function mediaConstraint(enabled: boolean, deviceId?: string): boolean | { deviceId: { ideal: string } } {
  if (!enabled) return false
  if (deviceId) return { deviceId: { ideal: deviceId } }
  return true
}

function RoomShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh flex flex-col items-center justify-center px-5">{children}</div>
  )
}

function PreJoin({
  slug,
  isGuest,
  guestName,
  onGuestNameChange,
  mic,
  cam,
  onToggleMic,
  onToggleCam,
  passwordPrompt,
  password,
  onPasswordChange,
  passwordError,
  onSubmit,
}: {
  slug: string
  isGuest: boolean
  guestName: string
  onGuestNameChange: (v: string) => void
  mic: boolean
  cam: boolean
  onToggleMic: () => void
  onToggleCam: () => void
  passwordPrompt: boolean
  password: string
  onPasswordChange: (v: string) => void
  passwordError: string | null
  onSubmit: () => void
}) {
  const { t } = useTranslation()
  const nameOk = !isGuest || guestName.trim().length > 0
  const passwordOk = !passwordPrompt || password.length > 0
  const canJoin = nameOk && passwordOk

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (canJoin) onSubmit()
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm" noValidate>
      <p className="font-mono text-xs text-[var(--color-flame)] mb-3">{t('room.prepareTag')}</p>
      <h1 className="text-2xl font-semibold tracking-tight">
        {isGuest ? t('room.guestTitle') : t('room.userTitle')}
      </h1>
      <p className="text-sm text-[var(--color-ink-muted)] mt-1 mb-8">
        {t('room.prejoinRoomLabel')} <span className="font-mono text-[var(--color-ink)]">{slug}</span>
      </p>

      {isGuest && (
        <div className="mb-6">
          <Field label={t('room.guestNameLabel')} hint={t('room.guestNameHint')}>
            {(p) => (
              <Input
                autoFocus
                maxLength={50}
                placeholder={t('room.guestNamePlaceholder')}
                value={guestName}
                onChange={(e) => onGuestNameChange(e.target.value)}
                {...p}
              />
            )}
          </Field>
        </div>
      )}

      {passwordPrompt && (
        <div className="mb-6 space-y-2">
          {passwordError && <Alert tone="error">{passwordError}</Alert>}
          <Field
            label={t('room.passwordLabel')}
            hint={t('room.passwordHint')}
          >
            {(p) => (
              <PasswordInput
                autoFocus={!isGuest || guestName.length > 0}
                placeholder={t('room.passwordPlaceholder')}
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                {...p}
              />
            )}
          </Field>
        </div>
      )}

      <div className="mb-6">
        <MediaSetup
          mic={mic}
          cam={cam}
          onToggleMic={onToggleMic}
          onToggleCam={onToggleCam}
        />
      </div>

      <Button type="submit" className="w-full" disabled={!canJoin}>
        {t('room.joinNow')}
      </Button>
      <Link
        to="/"
        className="block text-center text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] mt-3"
      >
        {t('room.cancelLink')}
      </Link>

      {isGuest && (
        <p className="mt-6 text-center text-[11px] text-[var(--color-ink-faint)]">
          {t('room.guestHaveAccount')}{' '}
          <Link to="/login" className="text-[var(--color-flame)] hover:underline">
            {t('room.loginAction')}
          </Link>{' '}
          {t('room.guestLoginThen')}
        </p>
      )}
    </form>
  )
}

function MediaSetup({
  mic,
  cam,
  onToggleMic,
  onToggleCam,
}: {
  mic: boolean
  cam: boolean
  onToggleMic: () => void
  onToggleCam: () => void
}) {
  const { t } = useTranslation()
  const { devices, stream, micLevel, error, prefs, setCameraId, setMicId, setSpeakerId } =
    usePrejoinMedia({ camEnabled: cam, micEnabled: mic })

  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!videoRef.current) return
    videoRef.current.srcObject = stream
  }, [stream])

  const showSpeakerPicker = devices.speakers.length > 1

  return (
    <div className="space-y-3">
      {/* Preview area */}
      <div className="relative rounded-lg overflow-hidden aspect-video bg-[var(--color-surface-2)] border border-[var(--color-line)]">
        {cam && stream && !error ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover [transform:scaleX(-1)]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <CamOffPlaceholder hasError={!!error} />
          </div>
        )}

        {/* Floating mic+cam toggle bar */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2">
          <IconToggle
            on={mic}
            onClick={onToggleMic}
            label={t('room.micLabel')}
            iconOn={<MicGlyph />}
            iconOff={<MicOffGlyph />}
          />
          <IconToggle
            on={cam}
            onClick={onToggleCam}
            label={t('room.cameraLabel')}
            iconOn={<CamGlyph />}
            iconOff={<CamOffGlyph />}
          />
        </div>
      </div>

      {/* Mic level meter */}
      {mic && (
        <MicLevelBar level={micLevel} ok={!!stream && !error} />
      )}

      {error && (
        <p className="text-[11px] text-[var(--color-bad)] font-mono">{error}</p>
      )}

      {/* Device pickers — show whatever we have labels for */}
      <div className="space-y-2">
        {cam && devices.cameras.length > 1 && (
          <DeviceSelect
            label={t('room.cameraLabel')}
            value={prefs.cameraId ?? ''}
            options={devices.cameras}
            onChange={setCameraId}
            fallbackLabel={t('room.cameraLabel')}
          />
        )}
        {mic && devices.mics.length > 1 && (
          <DeviceSelect
            label={t('room.micLabel')}
            value={prefs.micId ?? ''}
            options={devices.mics}
            onChange={setMicId}
            fallbackLabel={t('room.micLabel')}
          />
        )}
        {showSpeakerPicker && (
          <DeviceSelect
            label={t('room.speakerLabel')}
            value={prefs.speakerId ?? ''}
            options={devices.speakers}
            onChange={setSpeakerId}
            fallbackLabel={t('room.speakerLabel')}
          />
        )}
      </div>
    </div>
  )
}

function CamOffPlaceholder({ hasError }: { hasError: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-[var(--color-surface)] border border-[var(--color-line-strong)] flex items-center justify-center text-[var(--color-ink-faint)] mb-2">
        <CamOffGlyph />
      </div>
      <p className="text-[11px] font-mono text-[var(--color-ink-faint)] uppercase tracking-wider">
        {hasError ? t('room.previewDead') : t('room.cameraOff')}
      </p>
    </div>
  )
}

function MicLevelBar({ level, ok }: { level: number; ok: boolean }) {
  const { t } = useTranslation()
  // 12 segmented "bars" that light up based on level
  const segments = 14
  const filled = Math.round(level * segments)
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-ink-faint)] w-12">
        {t('viewControls.mic')}
      </span>
      <div className="flex-1 flex items-center gap-0.5 h-2">
        {Array.from({ length: segments }, (_, i) => {
          const active = ok && i < filled
          // Last few segments get warmer color (clipping indicator)
          const hot = i >= segments - 2
          return (
            <span
              key={i}
              className={`flex-1 h-full rounded-sm transition-colors ${
                active
                  ? hot
                    ? 'bg-[var(--color-flame)]'
                    : 'bg-[var(--color-ok)]'
                  : 'bg-[var(--color-line)]'
              }`}
            />
          )
        })}
      </div>
    </div>
  )
}

function DeviceSelect({
  label,
  value,
  options,
  onChange,
  fallbackLabel,
}: {
  label: string
  value: string
  options: MediaDeviceInfo[]
  onChange: (id: string) => void
  fallbackLabel: string
}) {
  const { t } = useTranslation()
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="font-mono uppercase tracking-wider text-[var(--color-ink-faint)] w-12 shrink-0">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 h-8 rounded-md bg-[var(--color-surface)] border border-[var(--color-line)] px-2 text-xs text-[var(--color-ink)] outline-none hover:border-[var(--color-line-strong)] focus:border-[var(--color-flame)] truncate"
      >
        <option value="">{t('room.selectDefault')}</option>
        {options.map((d, i) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `${fallbackLabel} ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  )
}

function IconToggle({
  on,
  onClick,
  label,
  iconOn,
  iconOff,
}: {
  on: boolean
  onClick: () => void
  label: string
  iconOn: React.ReactNode
  iconOff: React.ReactNode
}) {
  const { t } = useTranslation()
  const title = on
    ? t('room.iconToggleOnTitle', { label })
    : t('room.iconToggleOffTitle', { label })
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      title={title}
      className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors backdrop-blur ${
        on
          ? 'bg-[var(--color-surface)]/85 text-[var(--color-ink)] border border-[var(--color-line-strong)]'
          : 'bg-[var(--color-bad)] text-white border border-[var(--color-bad)]'
      }`}
    >
      {on ? iconOn : iconOff}
    </button>
  )
}

function MicGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
    </svg>
  )
}

function MicOffGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  )
}

function CamGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  )
}

function CamOffGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  )
}

function LoadingState({ slug }: { slug?: string }) {
  const { t } = useTranslation()
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 w-8 h-8 rounded-full border-2 border-[var(--color-line-strong)] border-t-[var(--color-flame)] animate-spin" />
      <p className="text-sm text-[var(--color-ink-muted)]">
        {t('room.loadingPrefix')} <span className="font-mono text-[var(--color-ink)]">{slug}</span>...
      </p>
    </div>
  )
}

function ErrorState({
  error,
  slug,
  isGuest,
  onRetry,
}: {
  error: unknown
  slug?: string
  isGuest: boolean
  onRetry: () => void
}) {
  const { t } = useTranslation()
  let title = t('room.errGenericTitle')
  let detail = t('room.errGenericDetail')
  let showLoginCTA = false

  if (error instanceof ApiError) {
    if (error.status === 404) {
      title = t('room.errNotFoundTitle')
      detail = t('room.errNotFoundDetail', { slug })
    } else if (error.status === 403) {
      if (error.message.includes('locked')) {
        title = t('room.errLockedTitle')
        detail = t('room.errLockedDetail')
      } else if (error.message.includes('private')) {
        title = t('room.errPrivateTitle')
        detail = isGuest
          ? t('room.errPrivateGuestDetail')
          : t('room.errPrivateUserDetail')
        showLoginCTA = isGuest
      } else {
        title = t('room.errDeniedTitle')
        detail = t('room.errDeniedDetail')
      }
    } else if (error.status === 401) {
      title = t('room.errSessionTitle')
      detail = t('room.errSessionDetail')
      showLoginCTA = true
    }
  }

  return (
    <div className="text-center max-w-sm">
      <p className="font-mono text-xs text-[var(--color-bad)] mb-3">{t('room.errFailedTag')}</p>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-[var(--color-ink-muted)] mt-2 mb-6">{detail}</p>
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {showLoginCTA && (
          <Link
            to="/login"
            className="inline-flex items-center px-4 h-10 rounded-md bg-[var(--color-flame)] text-[var(--color-canvas)] font-medium text-sm hover:bg-[var(--color-flame-soft)]"
          >
            {t('room.loginAction')}
          </Link>
        )}
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center px-4 h-10 rounded-md border border-[var(--color-line)] text-sm hover:border-[var(--color-line-strong)]"
        >
          {t('common.tryAgain')}
        </button>
        <Link
          to="/"
          className="inline-flex items-center px-4 h-10 rounded-md text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
        >
          {t('room.homeButton')}
        </Link>
      </div>
    </div>
  )
}
