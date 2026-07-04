import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES } from '@/i18n'

/**
 * Compact language switcher — shows the active language code, opens a small
 * menu of supported languages. Choice persists via i18n's localStorage cache.
 */
export function LanguageSwitcher() {
  const { i18n } = useTranslation()
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

  const current =
    SUPPORTED_LANGUAGES.find((l) => l.code === i18n.resolvedLanguage) ??
    SUPPORTED_LANGUAGES[0]

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={current.label}
        className="h-8 px-2 rounded-md flex items-center gap-1 bg-[var(--color-surface)] border border-[var(--color-line-strong)] text-[11px] font-mono uppercase tracking-wider text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
      >
        🌐
        <span>{current.short}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface)] shadow-2xl py-1"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              role="menuitem"
              onClick={() => {
                void i18n.changeLanguage(lang.code)
                setOpen(false)
              }}
              className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-[var(--color-surface-2)] ${
                current.code === lang.code ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-soft)]'
              }`}
            >
              <span>{lang.label}</span>
              {current.code === lang.code && (
                <span className="text-[var(--color-flame)]">●</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
