import { useEffect, useRef } from 'react'
import { useFloatingSelfView } from '@/hooks/useFloatingSelfView'

const TILE_SELECTOR = '.lk-participant-tile[data-lk-local-participant="true"]'

/**
 * When `useFloatingSelfView().enabled` is true, this component:
 *   1. Injects CSS that pins the local LK participant tile to a fixed corner
 *      with rounded corners + shadow + a high z-index, so it floats above
 *      the grid like Zoom's self-view.
 *   2. Wires a pointer-drag handler so the user can move it around. The
 *      latest position is persisted via the hook.
 *
 * The CSS uses attribute selectors on `<html data-float-self="1">`, set by
 * `useFloatingSelfView`, so changes apply instantly without rerendering
 * the LK tile tree.
 */
export function SelfViewFloater() {
  const { enabled, pos, setPos } = useFloatingSelfView()
  const dragRef = useRef<{ startX: number; startY: number; baseRight: number; baseBottom: number } | null>(null)

  // Attach a pointerdown handler to the local tile so users can drag it.
  // Re-attach when enabled flips because the tile may not exist before.
  useEffect(() => {
    if (!enabled) return
    let cleanup: (() => void) | null = null

    function attach() {
      const tile = document.querySelector<HTMLElement>(TILE_SELECTOR)
      if (!tile) return false

      function onDown(e: PointerEvent) {
        // Don't fight LK's own buttons inside the tile.
        if ((e.target as HTMLElement).closest('button')) return
        dragRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          baseRight: pos.right,
          baseBottom: pos.bottom,
        }
        tile!.setPointerCapture(e.pointerId)
        tile!.style.transition = 'none'
      }
      function onMove(e: PointerEvent) {
        const d = dragRef.current
        if (!d) return
        const nextRight = Math.max(0, d.baseRight - (e.clientX - d.startX))
        const nextBottom = Math.max(0, d.baseBottom - (e.clientY - d.startY))
        tile!.style.right = `${nextRight}px`
        tile!.style.bottom = `${nextBottom}px`
      }
      function onUp(e: PointerEvent) {
        const d = dragRef.current
        if (!d) return
        const right = Math.max(0, d.baseRight - (e.clientX - d.startX))
        const bottom = Math.max(0, d.baseBottom - (e.clientY - d.startY))
        // Clamp inside viewport — leave at least 100px visible.
        const clampedRight = Math.min(right, window.innerWidth - 100)
        const clampedBottom = Math.min(bottom, window.innerHeight - 100)
        setPos({ right: clampedRight, bottom: clampedBottom })
        dragRef.current = null
        if (tile!.hasPointerCapture(e.pointerId)) tile!.releasePointerCapture(e.pointerId)
        tile!.style.transition = ''
      }

      tile.addEventListener('pointerdown', onDown)
      tile.addEventListener('pointermove', onMove)
      tile.addEventListener('pointerup', onUp)
      tile.addEventListener('pointercancel', onUp)
      cleanup = () => {
        tile.removeEventListener('pointerdown', onDown)
        tile.removeEventListener('pointermove', onMove)
        tile.removeEventListener('pointerup', onUp)
        tile.removeEventListener('pointercancel', onUp)
      }
      return true
    }

    if (attach()) return () => cleanup?.()

    // The LK tile may mount slightly after we toggle enabled — observe and
    // retry until we hook it.
    const obs = new MutationObserver(() => {
      if (attach()) obs.disconnect()
    })
    obs.observe(document.body, { childList: true, subtree: true })
    return () => {
      obs.disconnect()
      cleanup?.()
    }
    // pos is intentionally not a dep — the drag handler reads it via closure
    // at down-time, and re-attaching on every position change would thrash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  if (!enabled) return null

  return (
    <style>{`
      html[data-float-self="1"] ${TILE_SELECTOR} {
        position: fixed !important;
        right: ${pos.right}px;
        bottom: ${pos.bottom}px;
        width: 180px !important;
        height: 120px !important;
        z-index: 35;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 12px 40px rgba(0,0,0,0.45),
                    0 0 0 1px var(--color-line-strong);
        cursor: grab;
        transition: box-shadow .2s ease;
      }
      html[data-float-self="1"] ${TILE_SELECTOR}:active {
        cursor: grabbing;
        box-shadow: 0 16px 48px rgba(0,0,0,0.55),
                    0 0 0 1px var(--color-flame);
      }
    `}</style>
  )
}
