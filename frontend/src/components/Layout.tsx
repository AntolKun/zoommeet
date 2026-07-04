import { Link, NavLink, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { useMe } from '@/hooks/useMe'
import { ThemeToggleButton } from '@/components/ThemeToggleButton'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { Avatar } from '@/components/Avatar'

export function Layout() {
  const { isAuthenticated, logout } = useAuth()
  const { data: me } = useMe()
  const { t } = useTranslation()

  return (
    <div className="min-h-svh flex flex-col">
      <header className="border-b border-[var(--color-line)]">
        <div className="mx-auto max-w-5xl px-5 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <BrandMark />
            <span className="text-[15px] font-semibold tracking-tight">videoconf</span>
            <span className="text-[10px] font-mono text-[var(--color-ink-faint)] border border-[var(--color-line)] rounded px-1 py-px">
              {t('nav.version')}
            </span>
          </Link>

          <nav className="flex items-center gap-5 text-[13px]">
            <Clock />
            <LanguageSwitcher />
            <ThemeToggleButton />
            <span className="h-4 w-px bg-[var(--color-line)]" aria-hidden />
            {isAuthenticated ? (
              <>
                <NavLink to="/dashboard" className={navLinkClass}>
                  {t('nav.myMeetings')}
                </NavLink>
                <NavLink to="/lobby" className={navLinkClass}>
                  {t('nav.joinMeeting')}
                </NavLink>
                {me && (
                  <Avatar
                    src={me.avatar_url ?? null}
                    name={me.display_name}
                    size="xs"
                  />
                )}
                <button
                  type="button"
                  onClick={logout}
                  className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
                >
                  {t('nav.logout')}
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" className={navLinkClass}>
                  {t('nav.login')}
                </NavLink>
                <NavLink
                  to="/register"
                  className="px-3 py-1.5 rounded-md bg-[var(--color-flame)] text-[var(--color-canvas)] font-medium hover:bg-[var(--color-flame-soft)] transition-colors"
                >
                  {t('nav.register')}
                </NavLink>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>

      <footer className="border-t border-[var(--color-line)] py-4">
        <div className="mx-auto max-w-5xl px-5 flex items-center justify-between text-[11px] text-[var(--color-ink-faint)] font-mono">
          <span>self-hosted on livekit</span>
          <span>made with too much coffee</span>
        </div>
      </footer>
    </div>
  )
}

function navLinkClass({ isActive }: { isActive: boolean }) {
  return isActive
    ? 'text-[var(--color-ink)]'
    : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors'
}

function BrandMark() {
  return (
    <span className="relative w-6 h-6 flex items-center justify-center">
      <span className="absolute inset-0 rounded bg-[var(--color-flame)] rotate-3" aria-hidden />
      <span className="absolute inset-0 rounded bg-[var(--color-canvas)] -rotate-3 border border-[var(--color-flame)]" aria-hidden />
      <span className="relative font-mono text-[10px] font-bold text-[var(--color-flame)]">vc</span>
    </span>
  )
}

function Clock() {
  const [now, setNow] = useState<string>(formatTime(new Date()))
  useEffect(() => {
    const t = setInterval(() => setNow(formatTime(new Date())), 30_000)
    return () => clearInterval(t)
  }, [])
  return (
    <span className="font-mono text-[11px] text-[var(--color-ink-faint)] tabular-nums hidden sm:inline">
      {now}
    </span>
  )
}

function formatTime(d: Date) {
  const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `WIB ${time}`
}
