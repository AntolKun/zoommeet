import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const STORAGE_KEY = 'videoconf.selfMirror'

/**
 * Mirrors the LOCAL participant tile's video horizontally (CSS scaleX(-1)).
 * Only affects what *you* see — remote participants always see the unmirrored
 * feed. Default ON because that's what people expect from a webcam preview
 * (matches looking at a mirror).
 */
export function MirrorButton() {
  const { t } = useTranslation()
  const [mirrored, setMirrored] = useState(
    () => localStorage.getItem(STORAGE_KEY) !== 'false',
  )

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(mirrored))
  }, [mirrored])

  return (
    <>
      {mirrored && (
        <style>{`
          .lk-participant-tile[data-lk-local-participant="true"] video {
            transform: scaleX(-1);
          }
        `}</style>
      )}

      <button
        type="button"
        onClick={() => setMirrored((v) => !v)}
        aria-pressed={mirrored}
        title={mirrored ? t('controls.mirrorOnTitle') : t('controls.mirrorOffTitle')}
        className={`inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-xs font-medium border transition-colors ${
          mirrored
            ? 'bg-[color-mix(in_oklab,var(--color-flame)_18%,transparent)] text-[var(--color-flame-soft)] border-[var(--color-flame)]'
            : 'bg-[var(--color-surface)] text-[var(--color-ink)] border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)]'
        }`}
      >
        <MirrorIcon />
        <span>{t('controls.mirror')}</span>
      </button>
    </>
  )
}

function MirrorIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v18" />
      <path d="M8 7l-4 5 4 5" />
      <path d="M16 7l4 5-4 5" />
    </svg>
  )
}
