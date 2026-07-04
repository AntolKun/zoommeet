import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog } from '@/components/ui/Dialog'
import { useTheme } from '@/hooks/useTheme'
import { SUPPORTED_LANGUAGES } from '@/i18n'
import {
  setSoundEnabled,
  setSoundsEnabled,
  soundEnabled,
  soundsEnabled,
  type SoundName,
} from '@/lib/sounds'
import { loadDevicePrefs } from '@/hooks/usePrejoinMedia'
import { useMe, useUploadAvatar } from '@/hooks/useMe'
import { Avatar } from '@/components/Avatar'
import { useAuth } from '@/hooks/useAuth'
import { resetTour, TourOverlay } from '@/components/TourOverlay'

const JOIN_MIC_KEY = 'videoconf.joinMic'
const JOIN_CAM_KEY = 'videoconf.joinCam'
const LEAVE_CONFIRM_KEY = 'videoconf.leaveConfirm'
const SELF_MIRROR_KEY = 'videoconf.selfMirror'

function readBoolPref(key: string, fallback: boolean): boolean {
  const v = localStorage.getItem(key)
  if (v === null) return fallback
  return v === '1' || v === 'true'
}

function writeBoolPref(key: string, on: boolean) {
  localStorage.setItem(key, on ? '1' : '0')
}

type Props = {
  open: boolean
  onClose: () => void
}

/**
 * Single pane of glass for everything tunable in the app. Most of these
 * controls already exist as scattered buttons in the toolbar — this dialog
 * consolidates them for users who want to find prefs without hunting.
 */
export function SettingsDialog({ open, onClose }: Props) {
  const { t } = useTranslation()
  const [tourOpen, setTourOpen] = useState(false)

  return (
    <>
      <Dialog open={open} onClose={onClose} title={t('settings.title')}>
        <div className="space-y-5 max-h-[70vh] overflow-y-auto -mx-6 px-6">
          <AccountSection />
          <DisplaySection />
          <AudioSection />
          <NotificationsSection />
          <DefaultsSection />
          <HelpSection
            onReplayTour={() => {
              resetTour()
              setTourOpen(true)
            }}
          />
        </div>
      </Dialog>
      <TourOverlay open={tourOpen} onClose={() => setTourOpen(false)} />
    </>
  )
}

function HelpSection({ onReplayTour }: { onReplayTour: () => void }) {
  const { t } = useTranslation()
  return (
    <Section title={t('settings.sectionHelp')}>
      <div className="flex items-center justify-between py-2">
        <div>
          <p className="text-sm text-[var(--color-ink)]">{t('settings.tourLabel')}</p>
          <p className="text-[11px] text-[var(--color-ink-muted)] mt-0.5">
            {t('settings.tourHint')}
          </p>
        </div>
        <button
          type="button"
          onClick={onReplayTour}
          className="h-7 px-2 text-[11px] rounded border border-[var(--color-line)] hover:border-[var(--color-flame)] text-[var(--color-ink-soft)] hover:text-[var(--color-flame-soft)]"
        >
          {t('settings.tourReplay')}
        </button>
      </div>
    </Section>
  )
}

function AccountSection() {
  const { isAuthenticated } = useAuth()
  const { data: me } = useMe()
  const upload = useUploadAvatar()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const { t } = useTranslation()

  if (!isAuthenticated) {
    return (
      <Section title={t('settings.sectionAccount')}>
        <p className="text-xs text-[var(--color-ink-muted)]">
          {t('settings.guestNotice')}
        </p>
      </Section>
    )
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError(null)
    try {
      await upload.mutateAsync(f)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.uploadFailed'))
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <Section title={t('settings.sectionAccount')}>
      <div className="flex items-center gap-3">
        <Avatar src={me?.avatar_url ?? null} name={me?.display_name ?? '?'} size="lg" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--color-ink)] truncate">{me?.display_name}</p>
          <p className="text-[11px] text-[var(--color-ink-muted)] font-mono truncate">
            {me?.email}
          </p>
        </div>
      </div>
      <div className="mt-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onPick}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
          className="h-8 px-3 rounded-md border border-[var(--color-line)] text-xs text-[var(--color-ink-soft)] hover:border-[var(--color-flame)] hover:text-[var(--color-flame-soft)] disabled:opacity-50"
        >
          {upload.isPending ? t('common.uploading') : t('settings.changeAvatar')}
        </button>
        <p className="text-[10px] text-[var(--color-ink-faint)] font-mono mt-1">
          {t('settings.avatarHint')}
        </p>
        {error && <p className="text-[10px] text-[var(--color-bad)] mt-1">{error}</p>}
      </div>
    </Section>
  )
}

function DisplaySection() {
  const { theme, toggle } = useTheme()
  const { t, i18n } = useTranslation()
  const [mirror, setMirror] = useState(() => readBoolPref(SELF_MIRROR_KEY, true))

  useEffect(() => {
    writeBoolPref(SELF_MIRROR_KEY, mirror)
  }, [mirror])

  return (
    <Section title={t('settings.sectionDisplay')}>
      <Toggle
        label={t('settings.themeLabel')}
        hint={t('settings.themeHint')}
        on={theme === 'light'}
        onToggle={toggle}
      />
      <Toggle
        label={t('settings.mirrorLabel')}
        hint={t('settings.mirrorHint')}
        on={mirror}
        onToggle={() => setMirror((v) => !v)}
      />
      <div className="flex items-center justify-between py-2">
        <div>
          <p className="text-sm text-[var(--color-ink)]">{t('settings.langLabel')}</p>
          <p className="text-[11px] text-[var(--color-ink-muted)] mt-0.5">
            {t('settings.langHint')}
          </p>
        </div>
        <select
          value={i18n.resolvedLanguage}
          onChange={(e) => void i18n.changeLanguage(e.target.value)}
          className="h-8 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] px-2 text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-flame)]"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>
    </Section>
  )
}

function AudioSection() {
  const { t } = useTranslation()
  const [master, setMaster] = useState(() => soundsEnabled())
  const [perSound, setPerSound] = useState<Record<SoundName, boolean>>(() => ({
    join: soundEnabled('join'),
    leave: soundEnabled('leave'),
    chat: soundEnabled('chat'),
    reaction: soundEnabled('reaction'),
  }))

  function updateMaster(on: boolean) {
    setMaster(on)
    setSoundsEnabled(on)
  }
  function updateSound(name: SoundName, on: boolean) {
    setPerSound((p) => ({ ...p, [name]: on }))
    setSoundEnabled(name, on)
  }

  const labels: Record<SoundName, string> = {
    join: t('settings.soundJoin'),
    leave: t('settings.soundLeave'),
    chat: t('settings.soundChat'),
    reaction: t('settings.soundReaction'),
  }

  return (
    <Section title={t('settings.sectionAudio')}>
      <Toggle
        label={t('settings.masterSound')}
        hint={t('settings.masterSoundHint')}
        on={master}
        onToggle={() => updateMaster(!master)}
      />
      <div className="pl-3 border-l border-[var(--color-line)] space-y-1.5 mt-2">
        {(['join', 'leave', 'chat', 'reaction'] as SoundName[]).map((name) => (
          <Toggle
            key={name}
            compact
            label={labels[name]}
            on={perSound[name] && master}
            disabled={!master}
            onToggle={() => updateSound(name, !perSound[name])}
          />
        ))}
      </div>
    </Section>
  )
}

function NotificationsSection() {
  const { t } = useTranslation()
  const [leaveConfirm, setLeaveConfirm] = useState(() => readBoolPref(LEAVE_CONFIRM_KEY, true))
  useEffect(() => {
    writeBoolPref(LEAVE_CONFIRM_KEY, leaveConfirm)
  }, [leaveConfirm])

  const [perm, setPerm] = useState<NotificationPermission>(
    typeof Notification === 'undefined' ? 'denied' : Notification.permission,
  )

  async function requestNotif() {
    if (typeof Notification === 'undefined') return
    const next = await Notification.requestPermission()
    setPerm(next)
  }

  return (
    <Section title={t('settings.sectionNotif')}>
      <Toggle
        label={t('settings.leaveConfirmLabel')}
        hint={t('settings.leaveConfirmHint')}
        on={leaveConfirm}
        onToggle={() => setLeaveConfirm((v) => !v)}
      />
      <div className="flex items-center justify-between py-2">
        <div>
          <p className="text-sm text-[var(--color-ink)]">{t('settings.browserNotifTitle')}</p>
          <p className="text-[11px] text-[var(--color-ink-muted)] mt-0.5">
            {t('settings.browserNotifHint')}
          </p>
        </div>
        {perm === 'granted' ? (
          <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-ok)]">
            {t('settings.permGranted')}
          </span>
        ) : perm === 'denied' ? (
          <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-bad)]">
            {t('settings.permDenied')}
          </span>
        ) : (
          <button
            type="button"
            onClick={requestNotif}
            className="h-7 px-2 text-[11px] rounded border border-[var(--color-line)] hover:border-[var(--color-flame)] text-[var(--color-ink-soft)] hover:text-[var(--color-flame-soft)]"
          >
            {t('settings.requestPerm')}
          </button>
        )}
      </div>
    </Section>
  )
}

function DefaultsSection() {
  const { t } = useTranslation()
  const [joinMic, setJoinMic] = useState(() => readBoolPref(JOIN_MIC_KEY, true))
  const [joinCam, setJoinCam] = useState(() => readBoolPref(JOIN_CAM_KEY, true))
  useEffect(() => writeBoolPref(JOIN_MIC_KEY, joinMic), [joinMic])
  useEffect(() => writeBoolPref(JOIN_CAM_KEY, joinCam), [joinCam])

  const devicePrefs = loadDevicePrefs()

  return (
    <Section title={t('settings.sectionDefaults')}>
      <Toggle
        label={t('settings.defaultMicOn')}
        hint={t('settings.defaultMicHint')}
        on={joinMic}
        onToggle={() => setJoinMic((v) => !v)}
      />
      <Toggle
        label={t('settings.defaultCamOn')}
        hint={t('settings.defaultCamHint')}
        on={joinCam}
        onToggle={() => setJoinCam((v) => !v)}
      />
      <div className="pt-2 space-y-1 text-[11px] text-[var(--color-ink-muted)] font-mono">
        <p>
          {t('settings.defaultCameraId')}:{' '}
          <span className="text-[var(--color-ink-soft)]">
            {devicePrefs.cameraId ? devicePrefs.cameraId.slice(0, 12) + '…' : t('settings.browserPick')}
          </span>
        </p>
        <p>
          {t('settings.defaultMicId')}:{' '}
          <span className="text-[var(--color-ink-soft)]">
            {devicePrefs.micId ? devicePrefs.micId.slice(0, 12) + '…' : t('settings.browserPick')}
          </span>
        </p>
        <p className="text-[var(--color-ink-faint)]">
          {t('settings.deviceHint')}
        </p>
      </div>
    </Section>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] font-mono uppercase tracking-wider text-[var(--color-flame)] mb-2">
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  )
}

function Toggle({
  label,
  hint,
  on,
  onToggle,
  disabled,
  compact,
}: {
  label: string
  hint?: string
  on: boolean
  onToggle: () => void
  disabled?: boolean
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={on}
      className={`flex items-start gap-3 w-full text-left ${
        compact ? 'py-1' : 'py-1.5'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`relative w-9 h-5 rounded-full transition-colors shrink-0 mt-0.5 ${
          on ? 'bg-[var(--color-flame)]' : 'bg-[var(--color-line-strong)]'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-[var(--color-canvas)] transition-transform ${
            on ? 'translate-x-4' : ''
          }`}
        />
      </span>
      <span className="flex-1 min-w-0">
        <span
          className={`block ${compact ? 'text-xs' : 'text-sm'} text-[var(--color-ink)]`}
        >
          {label}
        </span>
        {hint && (
          <span className="block text-[11px] text-[var(--color-ink-muted)] mt-0.5">
            {hint}
          </span>
        )}
      </span>
    </button>
  )
}
