import type { ReactNode } from 'react'

type Tone = 'public' | 'private' | 'locked'

const tones: Record<Tone, string> = {
  public:
    'border-[color-mix(in_oklab,var(--color-ok)_45%,transparent)] text-[color-mix(in_oklab,var(--color-ok)_85%,white)]',
  private: 'border-[var(--color-line-strong)] text-[var(--color-ink-muted)]',
  locked:
    'border-[color-mix(in_oklab,var(--color-flame)_55%,transparent)] text-[var(--color-flame-soft)]',
}

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider ${tones[tone]}`}
    >
      {children}
    </span>
  )
}
