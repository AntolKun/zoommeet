import { useTranslation } from 'react-i18next'
import { useLaserPointer } from '@/hooks/useLaserPointer'

/**
 * Toggle button for the local laser pointer. While ON, cursor movement
 * broadcasts to all peers. Useful during a screen share to direct attention.
 */
export function LaserPointerButton() {
  const { t } = useTranslation()
  const { enabled, toggle } = useLaserPointer()
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      title={enabled ? t('controls.laserOffTitle') : t('controls.laserTitle')}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-xs font-medium border transition-colors ${
        enabled
          ? 'bg-[var(--color-bad)] text-white border-[var(--color-bad)]'
          : 'bg-[var(--color-surface)] text-[var(--color-ink)] border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)]'
      }`}
    >
      <PointerIcon />
      {enabled ? t('controls.laserOn') : t('controls.laser')}
    </button>
  )
}

function PointerIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />
    </svg>
  )
}
