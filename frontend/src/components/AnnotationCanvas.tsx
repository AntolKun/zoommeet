import { useEffect, useRef, useState } from 'react'
import { useAnnotation } from '@/hooks/useAnnotation'
import { useAnnotationEnabled } from '@/hooks/useRoomFlags'

/**
 * Full-viewport canvas overlay. When annotation is enabled by the host, it
 * intercepts mouse drags and emits strokes; otherwise it stays mounted
 * (so remote strokes still render) but `pointer-events: none` so it lets
 * clicks pass through to LK controls underneath.
 *
 * Strokes are kept in viewport-normalized coords ([0..1] × [0..1]) so the
 * same content renders consistently on every viewer's window.
 */
export function AnnotationCanvas() {
  const { enabled } = useAnnotationEnabled()
  const { strokes, color, thickness, addStroke } = useAnnotation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const drawingRef = useRef<{ pts: Array<[number, number]> } | null>(null)

  // Track viewport size so the canvas resolution matches the screen — keeps
  // stroke crispness consistent at the cost of redraws on resize.
  useEffect(() => {
    const update = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Redraw the entire canvas any time strokes or size change. Cheaper than
  // patching incremental updates and keeps logic simple.
  useEffect(() => {
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
  }, [strokes, size])

  // Drawing handlers — only active when annotation mode is on.
  useEffect(() => {
    if (!enabled) return
    const canvas = canvasRef.current
    if (!canvas) return

    function toNorm(e: PointerEvent): [number, number] {
      return [e.clientX / window.innerWidth, e.clientY / window.innerHeight]
    }

    function onDown(e: PointerEvent) {
      if (e.button !== 0) return
      e.preventDefault()
      drawingRef.current = { pts: [toNorm(e)] }
      canvas?.setPointerCapture(e.pointerId)
    }
    function onMove(e: PointerEvent) {
      const cur = drawingRef.current
      if (!cur) return
      cur.pts.push(toNorm(e))
      // Draw incrementally on local canvas for immediate feedback.
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
  }, [enabled, color, thickness, addStroke, size])

  return (
    <canvas
      ref={canvasRef}
      width={size.w}
      height={size.h}
      className="fixed inset-0 z-30"
      style={{
        pointerEvents: enabled ? 'auto' : 'none',
        cursor: enabled ? 'crosshair' : 'auto',
      }}
      aria-hidden
    />
  )
}
