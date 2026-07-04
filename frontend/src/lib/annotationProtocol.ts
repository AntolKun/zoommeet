/**
 * Wire protocol for in-meeting annotation strokes broadcast over the LiveKit
 * data channel.
 *
 * Coordinates are normalized to viewport [0..1] × [0..1] so each viewer's
 * canvas can map back to its own window size.
 *
 * Strokes are sent on mouseup (one payload per completed stroke) so we don't
 * spam the channel — slight delay for remote viewers is acceptable for an
 * MVP. Clear is a separate event.
 */

export const ANNOTATE_TOPIC = 'vc.annotate'

export type StrokePayload = {
  kind: 'stroke'
  /** Unique per stroke for dedup on receivers. */
  uid: string
  /** Sender identity for attribution / cleanup. */
  identity: string
  color: string
  thickness: number
  /** Points in normalized [0..1] viewport coordinates, in draw order. */
  points: Array<[number, number]>
}

export type ClearPayload = {
  kind: 'clear'
  /** Optional identity — clear strokes by this user only. Absent = clear all. */
  byIdentity?: string
}

export type AnnotatePayload = StrokePayload | ClearPayload

const enc = new TextEncoder()
const dec = new TextDecoder()

export function encodeAnnotate(p: AnnotatePayload): Uint8Array {
  return enc.encode(JSON.stringify(p))
}

export function decodeAnnotate(bytes: Uint8Array): AnnotatePayload | null {
  try {
    const o = JSON.parse(dec.decode(bytes)) as Partial<AnnotatePayload>
    if (o.kind === 'clear') {
      return o as ClearPayload
    }
    if (o.kind === 'stroke') {
      const s = o as Partial<StrokePayload>
      if (typeof s.uid !== 'string' || typeof s.identity !== 'string') return null
      if (typeof s.color !== 'string' || typeof s.thickness !== 'number') return null
      if (!Array.isArray(s.points)) return null
      return s as StrokePayload
    }
    return null
  } catch {
    return null
  }
}

export function newStrokeUid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
