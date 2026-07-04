import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBackgroundEffect, type BackgroundEffect } from '@/hooks/useBackgroundEffect'

/**
 * Built-in virtual background presets. Hosted on Unsplash CDN (permissive CORS).
 * Compact 1280×720 keeps download fast and is enough for the segmenter.
 */
type Preset = { url: string; labelKey: string }
const PRESETS: Preset[] = [
  {
    url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1280&h=720&fit=crop&q=70',
    labelKey: 'bgEffect.presetOffice',
  },
  {
    url: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=1280&h=720&fit=crop&q=70',
    labelKey: 'bgEffect.presetLibrary',
  },
  {
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1280&h=720&fit=crop&q=70',
    labelKey: 'bgEffect.presetBeach',
  },
  {
    url: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1280&h=720&fit=crop&q=70',
    labelKey: 'bgEffect.presetCafe',
  },
]

/**
 * Toolbar dropdown: pick None / Blur / one of the preset virtual backgrounds.
 * Disabled with explanatory tooltip on browsers that can't run the segmenter.
 */
export function BackgroundEffectButton() {
  const { t } = useTranslation()
  const { effect, supported, busy, setEffect } = useBackgroundEffect()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const active = effect.kind !== 'none'
  const label = activeLabel(effect, t)

  if (!supported) {
    return (
      <button
        type="button"
        disabled
        title={t('bgEffect.unsupportedTitle')}
        className="inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-xs font-medium bg-[var(--color-surface)] text-[var(--color-ink-faint)] border border-[var(--color-line)] opacity-60 cursor-not-allowed"
      >
        <FxIcon />
        {t('bgEffect.unsupported')}
      </button>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-expanded={open}
        aria-haspopup="menu"
        title={t('bgEffect.title')}
        className={`inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-xs font-medium border transition-colors disabled:opacity-50 ${
          active
            ? 'bg-[color-mix(in_oklab,var(--color-flame)_18%,transparent)] text-[var(--color-flame-soft)] border-[var(--color-flame)]'
            : 'bg-[var(--color-surface)] text-[var(--color-ink)] border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)]'
        }`}
      >
        <FxIcon />
        {label}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1 z-50 min-w-[180px] rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface)] shadow-2xl py-1"
        >
          <Item
            onClick={() => {
              setEffect({ kind: 'none' })
              setOpen(false)
            }}
            active={effect.kind === 'none'}
            label={t('bgEffect.optionNone')}
            icon="🚫"
          />
          <Item
            onClick={() => {
              setEffect({ kind: 'blur', radius: 12 })
              setOpen(false)
            }}
            active={effect.kind === 'blur'}
            label={t('bgEffect.optionBlur')}
            icon="🌫"
          />
          <div className="border-t border-[var(--color-line)] my-1" />
          {PRESETS.map((p) => {
            const isActive = effect.kind === 'image' && effect.url === p.url
            return (
              <Item
                key={p.url}
                onClick={() => {
                  setEffect({ kind: 'image', url: p.url, label: t(p.labelKey) })
                  setOpen(false)
                }}
                active={isActive}
                label={t(p.labelKey)}
                icon="🖼"
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function Item({
  onClick,
  active,
  label,
  icon,
}: {
  onClick: () => void
  active: boolean
  label: string
  icon: string
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-[var(--color-surface-2)] ${
        active ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-soft)]'
      }`}
    >
      <span className="flex items-center gap-2">
        <span aria-hidden>{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      {active && <span className="text-[var(--color-flame)]">●</span>}
    </button>
  )
}

function activeLabel(effect: BackgroundEffect, t: (k: string) => string): string {
  if (effect.kind === 'none') return t('bgEffect.short')
  if (effect.kind === 'blur') return t('bgEffect.optionBlur')
  return effect.label ?? t('bgEffect.optionImage')
}

function FxIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="9" cy="10" r="2.5" />
      <path d="M3 17l5-5 4 4 3-3 6 6" />
    </svg>
  )
}
