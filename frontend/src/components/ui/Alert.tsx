import type { ReactNode } from 'react'

type Tone = 'error' | 'info'

type Props = {
  tone?: Tone
  children: ReactNode
}

const tones: Record<Tone, string> = {
  error:
    'border-[color-mix(in_oklab,var(--color-bad)_50%,transparent)] bg-[color-mix(in_oklab,var(--color-bad)_12%,transparent)] text-[color-mix(in_oklab,var(--color-bad)_85%,white)]',
  info:
    'border-[var(--color-line)] bg-[var(--color-surface-2)] text-[var(--color-ink-soft)]',
}

export function Alert({ tone = 'info', children }: Props) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-md border px-3 py-2 text-sm ${tones[tone]}`}
    >
      {children}
    </div>
  )
}
