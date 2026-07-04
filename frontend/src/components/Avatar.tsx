import { useState } from 'react'

type Size = 'xs' | 'sm' | 'md' | 'lg'

const SIZE_CLASS: Record<Size, string> = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-16 h-16 text-base',
}

const DOT_CLASS: Record<Size, string> = {
  xs: 'w-2 h-2 border',
  sm: 'w-2.5 h-2.5 border',
  md: 'w-3 h-3 border-2',
  lg: 'w-4 h-4 border-2',
}

/**
 * Profile avatar with image-or-initial fallback. Falls back to the first
 * letter of `name` on the brand-warm zinc surface, plus a guest "T" cue when
 * the name starts with `guest_`.
 *
 * onError silently flips to initials so a stale/dead URL doesn't show a broken
 * image — useful while we don't have a background cleanup job for old avatars.
 *
 * `presenceColor` adds a bottom-right status dot. Pass a CSS color (or var())
 * from presenceColor() in usePresence. Omit for no indicator.
 */
export function Avatar({
  src,
  name,
  size = 'sm',
  className,
  presenceColor: dotColor,
  presenceLabel,
}: {
  src?: string | null
  name: string
  size?: Size
  className?: string
  presenceColor?: string
  presenceLabel?: string
}) {
  const [failed, setFailed] = useState(false)
  const initial = name.replace(/^guest_/, 'T').slice(0, 1).toUpperCase()

  const body =
    src && !failed ? (
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
        className="w-full h-full object-cover"
      />
    ) : (
      <span aria-hidden className="font-medium text-[var(--color-ink)]">
        {initial}
      </span>
    )

  return (
    <span
      className={`relative shrink-0 inline-flex items-center justify-center rounded-full bg-[var(--color-surface-2)] border border-[var(--color-line-strong)] overflow-visible ${SIZE_CLASS[size]} ${className ?? ''}`}
    >
      <span className={`flex items-center justify-center rounded-full overflow-hidden w-full h-full`}>
        {body}
      </span>
      {dotColor && (
        <span
          aria-label={presenceLabel}
          title={presenceLabel}
          className={`absolute -bottom-0.5 -right-0.5 rounded-full border-[var(--color-surface)] ${DOT_CLASS[size]}`}
          style={{ background: dotColor }}
        />
      )}
    </span>
  )
}
