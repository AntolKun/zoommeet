/**
 * Wire protocol for laser pointer broadcast over the LiveKit data channel.
 *
 * Sender is the local user with pointer mode ON. Position is normalized to
 * the viewport [0..1] × [0..1] so different viewers' window sizes map their
 * own dot to the same relative spot.
 *
 * Frequency: throttled to ~30 Hz client-side; payload kept small so we can
 * comfortably use UNRELIABLE delivery — a dropped frame just smooths into
 * the next position.
 */

export const POINTER_TOPIC = 'vc.pointer'

export type PointerPayload = {
  /** 0..1 horizontal fraction of viewport. */
  x: number
  /** 0..1 vertical fraction of viewport. */
  y: number
  /** Sender identity for color/labeling. */
  identity: string
  /** Display name for label. */
  name: string
  /** True for explicit "pointer gone" — overlay can clear immediately. */
  off?: boolean
}

const enc = new TextEncoder()
const dec = new TextDecoder()

export function encodePointer(p: PointerPayload): Uint8Array {
  return enc.encode(JSON.stringify(p))
}

export function decodePointer(bytes: Uint8Array): PointerPayload | null {
  try {
    const o = JSON.parse(dec.decode(bytes)) as Partial<PointerPayload>
    if (typeof o.x !== 'number' || typeof o.y !== 'number') return null
    if (typeof o.identity !== 'string' || typeof o.name !== 'string') return null
    return o as PointerPayload
  } catch {
    return null
  }
}
