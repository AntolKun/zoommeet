import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'

export function Home() {
  const { isAuthenticated } = useAuth()
  const { t } = useTranslation()

  return (
    <div className="mx-auto max-w-5xl px-5 w-full">
      <section className="pt-16 pb-12 grid lg:grid-cols-[1.4fr_1fr] gap-12 items-start">
        <div>
          <p className="font-mono text-xs text-[var(--color-flame)] mb-4 tracking-wide">
            {t('home.tagline')}
          </p>
          <h1 className="text-5xl sm:text-6xl font-semibold tracking-tight leading-[1.05]">
            {t('home.heroLine1')}
            <br />
            {t('home.heroLine2')}
            <br />
            <span className="text-[var(--color-ink-muted)]">{t('home.heroLine3')}</span>
          </h1>
          <p className="mt-6 text-[var(--color-ink-soft)] text-[17px] max-w-md leading-relaxed">
            {t('home.heroDesc')}
          </p>

          <div className="mt-8 flex items-center gap-3">
            {isAuthenticated ? (
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 px-5 h-11 rounded-md bg-[var(--color-flame)] text-[var(--color-canvas)] font-medium hover:bg-[var(--color-flame-soft)] transition-colors"
              >
                {t('home.ctaDashboard')}
                <span aria-hidden>→</span>
              </Link>
            ) : (
              <>
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 px-5 h-11 rounded-md bg-[var(--color-flame)] text-[var(--color-canvas)] font-medium hover:bg-[var(--color-flame-soft)] transition-colors"
                >
                  {t('home.ctaStart')}
                  <span aria-hidden>→</span>
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center px-5 h-11 rounded-md border border-[var(--color-line)] text-[var(--color-ink)] hover:border-[var(--color-line-strong)] transition-colors"
                >
                  {t('home.ctaLogin')}
                </Link>
              </>
            )}
          </div>
        </div>

        <Aside />
      </section>

      <section className="border-t border-[var(--color-line)] py-10 grid sm:grid-cols-3 gap-x-8 gap-y-6 text-sm">
        <Note number="01" title={t('home.note1Title')}>
          {t('home.note1Body')}
        </Note>
        <Note number="02" title={t('home.note2Title')}>
          {t('home.note2Body')}
        </Note>
        <Note number="03" title={t('home.note3Title')}>
          {t('home.note3Body')}
        </Note>
      </section>
    </div>
  )
}

function Note({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <div>
      <span className="font-mono text-[11px] text-[var(--color-flame)]">{number}</span>
      <h3 className="mt-1 text-[var(--color-ink)] font-medium">{title}</h3>
      <p className="mt-1 text-[var(--color-ink-muted)] leading-relaxed">{children}</p>
    </div>
  )
}

function Aside() {
  const { t } = useTranslation()
  return (
    <div className="relative">
      <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-line)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--color-bad)] animate-pulse" />
            <span className="text-xs text-[var(--color-ink-muted)] font-mono">{t('home.mockRec')}</span>
          </div>
          <span className="text-[11px] text-[var(--color-ink-faint)] font-mono">
            {t('home.mockSlug')}
          </span>
        </div>

        <div className="p-4 grid grid-cols-2 gap-2">
          {[
            { name: 'Alice', tone: 'flame' as const, talking: true },
            { name: 'Budi', tone: 'olive' as const, talking: false },
            { name: 'Citra', tone: 'sky' as const, talking: false },
            { name: 'Dimas', tone: 'rose' as const, talking: false },
          ].map((p) => (
            <ParticipantTile key={p.name} {...p} />
          ))}
        </div>

        <div className="px-4 py-2 border-t border-[var(--color-line)] flex items-center gap-2 text-[var(--color-ink-muted)]">
          <PillIcon label="mic" active />
          <PillIcon label="cam" active />
          <PillIcon label="share" />
          <span className="ml-auto text-[11px] font-mono">{t('home.mockFollowers')}</span>
        </div>
      </div>

      <p className="mt-3 text-[11px] font-mono text-[var(--color-ink-faint)] text-right">
        {t('home.mockComment')}
      </p>
    </div>
  )
}

function ParticipantTile({
  name,
  tone,
  talking,
}: {
  name: string
  tone: 'flame' | 'olive' | 'sky' | 'rose'
  talking: boolean
}) {
  const palette = {
    flame: 'from-orange-700/40 to-orange-900/40',
    olive: 'from-lime-800/40 to-lime-950/40',
    sky: 'from-sky-800/40 to-sky-950/40',
    rose: 'from-rose-800/40 to-rose-950/40',
  }[tone]
  return (
    <div
      className={`relative aspect-video rounded-md bg-gradient-to-br ${palette} flex items-end p-2 ${talking ? 'ring-2 ring-[var(--color-flame)]' : ''}`}
    >
      <span className="text-xs text-[var(--color-ink)] font-medium drop-shadow">
        {name}
      </span>
    </div>
  )
}

function PillIcon({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      className={`px-2 h-6 inline-flex items-center rounded text-[10px] font-mono uppercase tracking-wider ${
        active
          ? 'bg-[var(--color-surface-2)] text-[var(--color-ink)] border border-[var(--color-line)]'
          : 'text-[var(--color-ink-faint)]'
      }`}
    >
      {label}
    </span>
  )
}
