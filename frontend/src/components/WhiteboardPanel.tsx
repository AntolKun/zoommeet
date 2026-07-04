import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWhiteboard } from '@/hooks/useWhiteboard'

const COLORS = [
  '#0c0a09', // dark (ink on white)
  '#ef4444', // red
  '#f59e0b', // amber
  '#84cc16', // lime
  '#22d3ee', // cyan
  '#a78bfa', // violet
]

const THICKNESSES = [2, 4, 8]

type Props = {
  open: boolean
  onClose: () => void
}

/**
 * Center-screen whiteboard surface. Backdrop dims the meeting; the canvas is
 * a fixed 16:9 frame so everyone draws on the same logical coordinate space.
 * Strokes use the same vector pipeline as in-room annotations but on a
 * separate topic (`vc.whiteboard`).
 */
export function WhiteboardPanel({ open, onClose }: Props) {
  const { t } = useTranslation()
  const { strokes, color, setColor, thickness, setThickness, addStroke, clearMine, clearAll } =
    useWhiteboard()

  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const drawingRef = useRef<{ pts: Array<[number, number]> } | null>(null)

  // Track canvas wrapper size — the canvas is 16:9 and centered in the modal.
  useEffect(() => {
    if (!open) return
    function update() {
      const el = wrapperRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setSize({ w: Math.round(rect.width), h: Math.round(rect.height) })
    }
    update()
    const ro = new ResizeObserver(update)
    if (wrapperRef.current) ro.observe(wrapperRef.current)
    return () => ro.disconnect()
  }, [open])

  // Redraw all strokes.
  useEffect(() => {
    if (!open) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const s of strokes) {
      if (s.points.length < 2) continue
      ctx.beginPath()
      ctx.strokeStyle = s.color
      ctx.lineWidth = s.thickness
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      const [x0, y0] = s.points[0]
      ctx.moveTo(x0 * size.w, y0 * size.h)
      for (let i = 1; i < s.points.length; i++) {
        const [xi, yi] = s.points[i]
        ctx.lineTo(xi * size.w, yi * size.h)
      }
      ctx.stroke()
    }
  }, [strokes, size, open])

  // Pointer handlers — coords normalized relative to canvas rect.
  useEffect(() => {
    if (!open) return
    const canvas = canvasRef.current
    if (!canvas) return

    function toNorm(e: PointerEvent): [number, number] {
      const rect = canvas!.getBoundingClientRect()
      return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height]
    }

    function onDown(e: PointerEvent) {
      if (e.button !== 0) return
      drawingRef.current = { pts: [toNorm(e)] }
      canvas?.setPointerCapture(e.pointerId)
    }
    function onMove(e: PointerEvent) {
      const cur = drawingRef.current
      if (!cur) return
      cur.pts.push(toNorm(e))
      const ctx = canvas?.getContext('2d')
      if (!ctx || cur.pts.length < 2) return
      const [px, py] = cur.pts[cur.pts.length - 2]
      const [nx, ny] = cur.pts[cur.pts.length - 1]
      ctx.beginPath()
      ctx.strokeStyle = color
      ctx.lineWidth = thickness
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.moveTo(px * size.w, py * size.h)
      ctx.lineTo(nx * size.w, ny * size.h)
      ctx.stroke()
    }
    function onUp(e: PointerEvent) {
      const cur = drawingRef.current
      drawingRef.current = null
      if (canvas?.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
      if (!cur || cur.pts.length < 2) return
      addStroke(cur.pts)
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
    }
  }, [open, color, thickness, addStroke, size])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-5xl flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--color-ink)]">{t('whiteboard.title')}</span>
          <span className="font-mono text-[10px] text-[var(--color-ink-faint)] uppercase tracking-wider">
            {t('whiteboard.strokes', { n: strokes.length })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Toolbar
            color={color}
            setColor={setColor}
            thickness={thickness}
            setThickness={setThickness}
            clearMine={clearMine}
            clearAll={clearAll}
          />
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface)] text-xs text-[var(--color-ink)] hover:bg-[var(--color-surface-2)]"
          >
            {t('common.close')}
          </button>
        </div>
      </div>

      <div
        ref={wrapperRef}
        className="w-full max-w-5xl aspect-video bg-white rounded-md shadow-2xl border border-[var(--color-line-strong)] overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          width={size.w}
          height={size.h}
          className="w-full h-full block"
          style={{ cursor: 'crosshair', touchAction: 'none' }}
        />
      </div>
    </div>
  )
}

function Toolbar({
  color,
  setColor,
  thickness,
  setThickness,
  clearMine,
  clearAll,
}: {
  color: string
  setColor: (c: string) => void
  thickness: number
  setThickness: (n: number) => void
  clearMine: () => void
  clearAll: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-1 rounded-md bg-[var(--color-surface)] border border-[var(--color-line-strong)] px-2 py-1">
      <div className="flex items-center gap-1">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-pressed={color === c}
            aria-label={t('annotate.colorAria', { c })}
            className={`w-5 h-5 rounded-full border ${
              color === c
                ? 'border-[var(--color-ink)] scale-110'
                : 'border-[var(--color-line-strong)]'
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
            className={`w-6 h-6 rounded flex items-center justify-center ${
              thickness === th ? 'bg-[var(--color-surface-2)]' : 'hover:bg-[var(--color-surface-2)]'
            }`}
          >
            <span
              className="rounded-full"
              style={{ background: 'var(--color-ink)', width: th + 2, height: th + 2 }}
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
      <button
        type="button"
        onClick={clearAll}
        title={t('annotate.clearAllTitle')}
        className="h-6 px-2 text-[10px] font-mono uppercase tracking-wider rounded text-[var(--color-bad)] hover:bg-[color-mix(in_oklab,var(--color-bad)_10%,transparent)]"
      >
        {t('annotate.clearAll')}
      </button>
    </div>
  )
}
