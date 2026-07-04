import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSpotlight } from '@/hooks/useSpotlight'

/**
 * Top-center ribbon that appears when host has spotlighted someone. Every
 * client sees the same banner so everyone knows where to focus.
 *
 * Also injects CSS that adds a flame-colored glow + scale bump to the
 * spotlighted tile in the LK grid so it stands out visually. We can't
 * resize the tile cleanly without replacing VideoConference, so a strong
 * border + scale is the next-best visual cue.
 */
export function SpotlightBanner() {
  const { t } = useTranslation()
  const { spotlight } = useSpotlight()
  if (!spotlight.identity) return null

  return (
    <>
      {/* Identity-targeted CSS via attribute selector on the local-participant
          attribute LK already publishes. For others, we tag by name via a
          MutationObserver-free shortcut: target lk-participant-name text. */}
      <style>{`
        .lk-participant-tile:has(.lk-participant-name[data-spotlight-match="true"]) {
          outline: 3px solid var(--color-flame);
          outline-offset: -3px;
          box-shadow: 0 0 0 8px color-mix(in oklab, var(--color-flame) 25%, transparent),
                      0 12px 36px color-mix(in oklab, var(--color-flame) 30%, transparent);
          z-index: 10;
        }
      `}</style>
      <SpotlightTagger name={spotlight.name ?? ''} />

      <div
        role="status"
        aria-live="polite"
        className="fixed top-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none"
      >
        <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-[color-mix(in_oklab,var(--color-flame)_25%,var(--color-canvas))] border border-[var(--color-flame)] px-3 py-1.5 shadow-2xl backdrop-blur-sm">
          <span aria-hidden className="text-base leading-none">📌</span>
          <span className="text-xs font-medium text-[var(--color-ink)]">
            {t('spotlight.label')}: <span className="font-semibold">{spotlight.name ?? spotlight.identity}</span>
          </span>
        </div>
      </div>
    </>
  )
}

/**
 * Walks the LK participant-name DOM nodes and tags the one matching the
 * spotlight name. The tag is picked up by the :has() selector above so the
 * tile lights up. Runs whenever the spotlight name changes or the LK DOM
 * updates (debounced via animation frame).
 */
function SpotlightTagger({ name }: { name: string }) {
  useEffect(() => {
    if (!name) return

    const tag = () => {
      const nodes = document.querySelectorAll<HTMLElement>('.lk-participant-name')
      nodes.forEach((el) => {
        // LK renders the name in a child text node; some templates wrap it.
        const text = (el.textContent ?? '').trim()
        if (text === name) {
          el.setAttribute('data-spotlight-match', 'true')
        } else {
          el.removeAttribute('data-spotlight-match')
        }
      })
    }

    tag()
    // Re-tag whenever the LK DOM rewires (participant join/leave, etc.).
    const observer = new MutationObserver(() => {
      requestAnimationFrame(tag)
    })
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      document
        .querySelectorAll<HTMLElement>('.lk-participant-name[data-spotlight-match="true"]')
        .forEach((el) => el.removeAttribute('data-spotlight-match'))
    }
  }, [name])

  return null
}
