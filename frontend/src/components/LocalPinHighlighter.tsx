import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalPin } from '@/hooks/useLocalPin'

/**
 * Local-only pin: highlights the pinned participant's tile and shows a small
 * floating banner top-center. Pure CSS + DOM tagging, no broadcast.
 *
 * Renders alongside SpotlightBanner — the two can coexist (someone can pin
 * locally while host has someone else spotlighted globally). Spotlight wins
 * visually (heavier glow) so the host's intent isn't masked.
 */
export function LocalPinHighlighter() {
  const { t } = useTranslation()
  const { pin, clear } = useLocalPin()

  if (!pin.identity) return null

  return (
    <>
      <style>{`
        .lk-participant-tile:has(.lk-participant-name[data-local-pin-match="true"]) {
          outline: 2px dashed var(--color-ink);
          outline-offset: -2px;
          box-shadow: 0 0 0 4px color-mix(in oklab, var(--color-ink) 15%, transparent);
          z-index: 5;
        }
      `}</style>
      <LocalPinTagger name={pin.name ?? ''} />

      <div
        role="status"
        aria-live="polite"
        className="fixed top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
      >
        <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-[var(--color-surface)]/95 border border-[var(--color-line-strong)] px-3 py-1.5 shadow-xl backdrop-blur-sm">
          <span aria-hidden className="text-sm leading-none">📌</span>
          <span className="text-xs font-medium text-[var(--color-ink)]">
            {t('localPin.label')}: <span className="font-semibold">{pin.name ?? pin.identity}</span>
          </span>
          <button
            type="button"
            onClick={clear}
            aria-label={t('localPin.unpin')}
            className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] text-sm leading-none -mr-1 px-1"
          >
            ×
          </button>
        </div>
      </div>
    </>
  )
}

/**
 * Tags the pinned participant's name node in the LK DOM so the :has() selector
 * above can target the corresponding tile. Re-runs on DOM mutations because LK
 * re-renders tiles on participant join/leave.
 */
function LocalPinTagger({ name }: { name: string }) {
  useEffect(() => {
    if (!name) return

    const tag = () => {
      const nodes = document.querySelectorAll<HTMLElement>('.lk-participant-name')
      nodes.forEach((el) => {
        const text = (el.textContent ?? '').trim()
        if (text === name) {
          el.setAttribute('data-local-pin-match', 'true')
        } else {
          el.removeAttribute('data-local-pin-match')
        }
      })
    }

    tag()
    const observer = new MutationObserver(() => {
      requestAnimationFrame(tag)
    })
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      document
        .querySelectorAll<HTMLElement>('.lk-participant-name[data-local-pin-match="true"]')
        .forEach((el) => el.removeAttribute('data-local-pin-match'))
    }
  }, [name])

  return null
}
