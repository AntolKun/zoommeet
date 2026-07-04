import { useTranslation } from 'react-i18next'
import { useNoiseSuppression } from '@/hooks/useNoiseSuppression'

/**
 * Toolbar toggle for the local participant's noise-suppression processor
 * (LiveKit Krisp). Greyed out on unsupported browsers.
 */
export function NoiseSuppressionButton() {
  const { t } = useTranslation()
  const { enabled, supported, busy, toggle } = useNoiseSuppression()

  if (!supported) {
    return (
      <button
        type="button"
        disabled
        title={t('noiseSuppression.unsupportedTitle')}
        className="inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-xs font-medium bg-[var(--color-surface)] text-[var(--color-ink-faint)] border border-[var(--color-line)] opacity-60 cursor-not-allowed"
      >
        <NoiseIcon />
        {t('noiseSuppression.unsupported')}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={enabled}
      title={enabled ? t('noiseSuppression.titleOn') : t('noiseSuppression.titleOff')}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-xs font-medium border transition-colors disabled:opacity-50 ${
        enabled
          ? 'bg-[color-mix(in_oklab,var(--color-flame)_18%,transparent)] text-[var(--color-flame-soft)] border-[var(--color-flame)]'
          : 'bg-[var(--color-surface)] text-[var(--color-ink)] border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)]'
      }`}
    >
      <NoiseIcon />
      <span>{enabled ? t('noiseSuppression.shortOn') : t('noiseSuppression.short')}</span>
    </button>
  )
}

function NoiseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12h2l2-7 4 14 3-10 2 7h5" />
    </svg>
  )
}
