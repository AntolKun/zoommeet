import { Link, Outlet } from 'react-router-dom'

export function AuthLayout() {
  return (
    <div className="min-h-svh grid lg:grid-cols-[1fr_1.1fr]">
      {/* Left: form column */}
      <div className="flex flex-col p-6 sm:p-10">
        <Link to="/" className="inline-flex items-center gap-2 self-start text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
          <span aria-hidden>←</span> kembali
        </Link>

        <div className="flex-1 flex flex-col justify-center max-w-sm w-full mx-auto py-10">
          <Outlet />
        </div>

        <p className="text-[11px] font-mono text-[var(--color-ink-faint)] self-start">
          videoconf · v0.1
        </p>
      </div>

      {/* Right: visual side — quietly opinionated */}
      <aside className="hidden lg:flex relative overflow-hidden border-l border-[var(--color-line)]">
        <Backdrop />
        <div className="relative flex flex-col justify-end p-10 w-full">
          <blockquote className="max-w-md">
            <p className="text-2xl leading-snug font-medium text-[var(--color-ink)]">
              "Aku capek install Zoom, install Teams, install lagi yang lain.
              <br />
              Ini cuma butuh link."
            </p>
            <footer className="mt-4 text-[13px] text-[var(--color-ink-muted)]">
              — pengguna pertama, sebelum jadi pengguna kedua
            </footer>
          </blockquote>
        </div>
      </aside>
    </div>
  )
}

function Backdrop() {
  // Hand-placed dotted grid + flame glow — felt right rather than gradient cliché.
  return (
    <div className="absolute inset-0">
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            'radial-gradient(circle, var(--color-line-strong) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />
      <div
        className="absolute -top-40 -right-32 w-[480px] h-[480px] rounded-full opacity-25 blur-[80px]"
        style={{ background: 'var(--color-flame-deep)' }}
      />
    </div>
  )
}
