import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div className="mx-auto max-w-md px-5 py-24 text-center w-full">
      <p className="font-mono text-xs text-[var(--color-flame)] mb-3">// 404</p>
      <h2 className="text-3xl font-semibold tracking-tight mb-2">
        Ke mana ya halamannya
      </h2>
      <p className="text-[var(--color-ink-muted)] mb-6">
        URL-nya gak ada. Mungkin salah ketik.
      </p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 px-4 h-10 rounded-md border border-[var(--color-line)] hover:border-[var(--color-line-strong)] text-sm"
      >
        <span aria-hidden>←</span> Balik ke beranda
      </Link>
    </div>
  )
}
