import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const TOUR_SEEN_KEY = 'videoconf.tourSeen'

const TOTAL_STEPS = 5

export function TourOverlay({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (!open) setStep(0)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        markSeen()
        onClose()
      }
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step])

  function next() {
    if (step < TOTAL_STEPS - 1) {
      setStep((s) => s + 1)
    } else {
      markSeen()
      onClose()
    }
  }
  function prev() {
    setStep((s) => Math.max(0, s - 1))
  }

  if (!open) return null
  const stepN = step + 1
  const title = t(`tour.step${stepN}Title`)
  const body = t(`tour.step${stepN}Body`)
  const isLast = step === TOTAL_STEPS - 1

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => {
          markSeen()
          onClose()
        }}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="relative w-full max-w-md rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface)] shadow-2xl p-5"
      >
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-flame)] mb-2">
          {t('tour.progress', { step: stepN, total: TOTAL_STEPS })}
        </p>
        <h2
          id="tour-title"
          className="text-lg font-semibold text-[var(--color-ink)] mb-2"
        >
          {title}
        </h2>
        <p className="text-sm text-[var(--color-ink-soft)] mb-4">{body}</p>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-1.5 mb-4" aria-hidden>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step
                  ? 'w-6 bg-[var(--color-flame)]'
                  : i < step
                  ? 'w-1.5 bg-[var(--color-flame-soft)]'
                  : 'w-1.5 bg-[var(--color-line-strong)]'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              markSeen()
              onClose()
            }}
            className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] font-mono uppercase tracking-wider"
          >
            {t('common.skip')}
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={prev}
                className="h-9 px-3 rounded-md border border-[var(--color-line)] text-sm text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
              >
                ← {t('common.back')}
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="h-9 px-4 rounded-md bg-[var(--color-flame)] text-[var(--color-canvas)] text-sm font-medium hover:bg-[var(--color-flame-soft)]"
            >
              {isLast ? t('tour.step5Cta') : `${t('common.next')} →`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function tourSeen(): boolean {
  return localStorage.getItem(TOUR_SEEN_KEY) === '1'
}

export function markSeen() {
  localStorage.setItem(TOUR_SEEN_KEY, '1')
}

export function resetTour() {
  localStorage.removeItem(TOUR_SEEN_KEY)
}
