import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { LiveKitRoom, VideoConference } from '@livekit/components-react'
import '@livekit/components-styles'

import { ApiError } from '@/lib/api'
import { useRoomToken } from '@/hooks/useRoomToken'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { ChatToastNotifier } from '@/components/ChatToastNotifier'

const GUEST_NAME_KEY = 'videoconf.guestName'

type Phase = 'prejoin' | 'connecting' | 'joined'

export function Room() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()

  const [phase, setPhase] = useState<Phase>('prejoin')
  const [guestName, setGuestName] = useState<string>(
    () => localStorage.getItem(GUEST_NAME_KEY) ?? '',
  )
  const [mic, setMic] = useState(true)
  const [cam, setCam] = useState(true)

  // Token only fires after user submits pre-join.
  const tokenQuery = useRoomToken(slug, {
    enabled: phase !== 'prejoin',
    guestName: isAuthenticated ? undefined : guestName,
  })

  useEffect(() => {
    if (phase === 'connecting' && tokenQuery.data) setPhase('joined')
  }, [phase, tokenQuery.data])

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
          onSubmit={() => {
            if (!isAuthenticated && guestName.trim()) {
              localStorage.setItem(GUEST_NAME_KEY, guestName.trim())
            }
            setPhase('connecting')
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

  if (!tokenQuery.data) {
    return (
      <RoomShell>
        <LoadingState slug={slug} />
      </RoomShell>
    )
  }

  return (
    <LiveKitRoom
      serverUrl={tokenQuery.data.url}
      token={tokenQuery.data.token}
      connect
      video={cam}
      audio={mic}
      data-lk-theme="default"
      style={{ height: '100svh' }}
      onDisconnected={() => navigate(isAuthenticated ? '/dashboard' : '/')}
    >
      <VideoConference />
      <ChatToastNotifier />
    </LiveKitRoom>
  )
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
  onSubmit: () => void
}) {
  const canJoin = !isGuest || guestName.trim().length > 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (canJoin) onSubmit()
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm" noValidate>
      <p className="font-mono text-xs text-[var(--color-flame)] mb-3">// siap-siap</p>
      <h1 className="text-2xl font-semibold tracking-tight">
        {isGuest ? 'Gabung sebagai tamu' : 'Gabung ke meeting'}
      </h1>
      <p className="text-sm text-[var(--color-ink-muted)] mt-1 mb-8">
        Ruang <span className="font-mono text-[var(--color-ink)]">{slug}</span>
      </p>

      {isGuest && (
        <div className="mb-6">
          <Field label="Nama panggilan" hint="Yang muncul di video buat peserta lain">
            {(p) => (
              <Input
                autoFocus
                maxLength={50}
                placeholder="Misal: Andi"
                value={guestName}
                onChange={(e) => onGuestNameChange(e.target.value)}
                {...p}
              />
            )}
          </Field>
        </div>
      )}

      <div className="flex gap-3 mb-8">
        <Toggle on={mic} onClick={onToggleMic} label="Mikrofon" onText="Mic nyala" offText="Mic mati" />
        <Toggle on={cam} onClick={onToggleCam} label="Kamera" onText="Kamera nyala" offText="Kamera mati" />
      </div>

      <Button type="submit" className="w-full" disabled={!canJoin}>
        Gabung sekarang →
      </Button>
      <Link
        to="/"
        className="block text-center text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] mt-3"
      >
        Batal
      </Link>

      {isGuest && (
        <p className="mt-6 text-center text-[11px] text-[var(--color-ink-faint)]">
          Punya akun?{' '}
          <Link to="/login" className="text-[var(--color-flame)] hover:underline">
            Login dulu
          </Link>{' '}
          biar nama kamu kekunci
        </p>
      )}
    </form>
  )
}

function Toggle({
  on,
  onClick,
  label,
  onText,
  offText,
}: {
  on: boolean
  onClick: () => void
  label: string
  onText: string
  offText: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      className={`flex-1 rounded-lg border p-4 text-left transition-colors ${
        on
          ? 'border-[var(--color-flame)] bg-[color-mix(in_oklab,var(--color-flame)_10%,transparent)]'
          : 'border-[var(--color-line)] bg-[var(--color-surface)]'
      }`}
    >
      <span className={`block text-sm font-medium ${on ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)]'}`}>
        {on ? onText : offText}
      </span>
      <span className="block text-[11px] text-[var(--color-ink-faint)] mt-0.5 font-mono uppercase tracking-wider">
        klik buat {on ? 'matikan' : 'nyalakan'}
      </span>
    </button>
  )
}

function LoadingState({ slug }: { slug?: string }) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 w-8 h-8 rounded-full border-2 border-[var(--color-line-strong)] border-t-[var(--color-flame)] animate-spin" />
      <p className="text-sm text-[var(--color-ink-muted)]">
        Menyiapkan ruang <span className="font-mono text-[var(--color-ink)]">{slug}</span>...
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
  let title = 'Gagal masuk room'
  let detail = 'Terjadi kesalahan. Coba lagi.'
  let showLoginCTA = false

  if (error instanceof ApiError) {
    if (error.status === 404) {
      title = 'Room nggak ketemu'
      detail = `Nggak ada room dengan kode "${slug}". Cek lagi link-nya.`
    } else if (error.status === 403) {
      if (error.message.includes('locked')) {
        title = 'Room terkunci'
        detail = 'Room ini lagi dikunci sama host. Tunggu dibuka, ya.'
      } else if (error.message.includes('private')) {
        title = 'Room privat'
        detail = isGuest
          ? 'Room ini cuma buat anggota. Login dulu kalo kamu host-nya.'
          : 'Kamu nggak punya akses ke room ini.'
        showLoginCTA = isGuest
      } else {
        title = 'Akses ditolak'
        detail = 'Kamu nggak punya akses ke room ini.'
      }
    } else if (error.status === 401) {
      title = 'Sesi habis'
      detail = 'Login dulu untuk gabung.'
      showLoginCTA = true
    }
  }

  return (
    <div className="text-center max-w-sm">
      <p className="font-mono text-xs text-[var(--color-bad)] mb-3">// gagal</p>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-[var(--color-ink-muted)] mt-2 mb-6">{detail}</p>
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {showLoginCTA && (
          <Link
            to="/login"
            className="inline-flex items-center px-4 h-10 rounded-md bg-[var(--color-flame)] text-[var(--color-canvas)] font-medium text-sm hover:bg-[var(--color-flame-soft)]"
          >
            Login
          </Link>
        )}
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center px-4 h-10 rounded-md border border-[var(--color-line)] text-sm hover:border-[var(--color-line-strong)]"
        >
          Coba lagi
        </button>
        <Link
          to="/"
          className="inline-flex items-center px-4 h-10 rounded-md text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
        >
          Beranda
        </Link>
      </div>
    </div>
  )
}
