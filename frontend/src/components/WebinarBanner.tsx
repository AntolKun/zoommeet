import { useTranslation } from 'react-i18next'

/**
 * Top-center pill that stays visible for audience members in a webinar room.
 * Hosts don't see it — they can already speak/publish. Nudges the audience
 * to use chat/Q&A/reactions since mic + cam are disabled.
 */
export function WebinarBanner({ isHost }: { isHost: boolean }) {
  const { t } = useTranslation()
  if (isHost) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-16 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
    >
      <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-[color-mix(in_oklab,var(--color-flame)_20%,var(--color-canvas))] border border-[var(--color-flame)] px-3 py-1.5 shadow-xl backdrop-blur-sm">
        <span aria-hidden className="text-sm leading-none">📺</span>
        <span className="text-xs font-medium text-[var(--color-ink)]">
          {t('webinar.audienceLabel')}
        </span>
      </div>
    </div>
  )
}
