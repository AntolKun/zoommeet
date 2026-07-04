import { useTranslation } from 'react-i18next'
import { useAnnotation } from '@/hooks/useAnnotation'
import { useAnnotationEnabled } from '@/hooks/useRoomFlags'

const COLORS = [
  '#ef4444', // red
  '#f59e0b', // amber (brand flame)
  '#84cc16', // lime
  '#22d3ee', // cyan
  '#a78bfa', // violet
  '#f5efe9', // ink
  '#0c0a09', // canvas dark
]

const THICKNESSES = [2, 4, 8]

/**
 * Floating toolbar that appears at the top-center when annotation mode is
 * enabled. Lets any participant pick color + line thickness, clear their own
 * strokes, or clear everyone's (cooperative — non-host clear-all still works
 * but is socially policed).
 */
export function AnnotationToolbar({ isHost }: { isHost: boolean }) {
  const { t } = useTranslation()
  const { enabled } = useAnnotationEnabled()
  const { color, setColor, thickness, setThickness, clearMine, clearAll } = useAnnotation()
  if (!enabled) return null

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-[var(--color-surface)] border border-[var(--color-line-strong)] px-2 py-1.5 shadow-2xl backdrop-blur-sm">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-ink-faint)] px-1.5">
          {t('annotate.tag')}
        </span>

        <div className="flex items-center gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-pressed={color === c}
              aria-label={t('annotate.colorAria', { c })}
              className={`w-5 h-5 rounded-full border ${
                color === c ? 'border-[var(--color-ink)] scale-110' : 'border-[var(--color-line-strong)]'
              } transition-transform`}
              style={{ background: c }}
            />
          ))}
        </div>

        <span className="h-4 w-px bg-[var(--color-line)] mx-1" aria-hidden />

        <div className="flex items-center gap-1">
          {THICKNESSES.map((th) => (
            <button
              key={th}
              type="button"
              onClick={() => setThickness(th)}
              aria-pressed={thickness === th}
              aria-label={t('annotate.thicknessAria', { n: th })}
              className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
                thickness === th ? 'bg-[var(--color-surface-2)]' : 'hover:bg-[var(--color-surface-2)]'
              }`}
            >
              <span
                className="rounded-full"
                style={{
                  background: 'var(--color-ink)',
                  width: th + 2,
                  height: th + 2,
                }}
              />
            </button>
          ))}
        </div>

        <span className="h-4 w-px bg-[var(--color-line)] mx-1" aria-hidden />

        <button
          type="button"
          onClick={clearMine}
          title={t('annotate.clearMineTitle')}
          className="h-6 px-2 text-[10px] font-mono uppercase tracking-wider rounded text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)]"
        >
          {t('annotate.clearMine')}
        </button>
        {isHost && (
          <button
            type="button"
            onClick={clearAll}
            title={t('annotate.clearAllTitle')}
            className="h-6 px-2 text-[10px] font-mono uppercase tracking-wider rounded text-[var(--color-bad)] hover:bg-[color-mix(in_oklab,var(--color-bad)_10%,transparent)]"
          >
            {t('annotate.clearAll')}
          </button>
        )}
      </div>
    </div>
  )
}
