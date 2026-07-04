import { useLaserPointer } from '@/hooks/useLaserPointer'

/**
 * Renders each remote pointer as a fixed red glow dot at its normalized
 * viewport position. The local pointer is intentionally NOT rendered — the
 * sender already sees their own cursor.
 *
 * Pointer-events are off so the overlay doesn't intercept clicks/hover.
 */
export function LaserPointerOverlay() {
  const { remotePointers } = useLaserPointer()
  const entries = Object.values(remotePointers)
  if (entries.length === 0) return null

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-40 pointer-events-none overflow-hidden"
    >
      {entries.map((p) => (
        <div
          key={p.identity}
          className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
        >
          <span className="relative w-4 h-4">
            <span className="absolute inset-0 rounded-full bg-[var(--color-bad)] opacity-50 animate-ping" />
            <span className="absolute inset-0 rounded-full bg-[var(--color-bad)] shadow-[0_0_18px_var(--color-bad)]" />
          </span>
          <span className="mt-1 px-1.5 py-px text-[10px] font-mono uppercase tracking-wider rounded bg-[var(--color-canvas)]/80 text-[var(--color-ink)] border border-[var(--color-line)] whitespace-nowrap">
            {p.name}
          </span>
        </div>
      ))}
    </div>
  )
}
