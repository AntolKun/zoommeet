import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'ghost' | 'subtle'
type Size = 'md' | 'sm'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  loading?: boolean
  children: ReactNode
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-[background,transform,opacity] disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-px'

const variants: Record<Variant, string> = {
  primary:
    'bg-[var(--color-flame)] text-[var(--color-canvas)] hover:bg-[var(--color-flame-soft)] shadow-[0_1px_0_0_rgba(255,255,255,0.18)_inset,0_1px_2px_rgba(0,0,0,0.4)]',
  ghost:
    'bg-transparent text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)]',
  subtle:
    'bg-[var(--color-surface-2)] text-[var(--color-ink)] border border-[var(--color-line)] hover:border-[var(--color-line-strong)]',
}

const sizes: Record<Size, string> = {
  md: 'h-10 px-4 text-sm',
  sm: 'h-8 px-3 text-xs',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  children,
  className = '',
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`.trim()}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}

function Spinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className="animate-spin"
      aria-hidden
    >
      <path d="M21 12a9 9 0 1 1-6.2-8.55" />
    </svg>
  )
}
