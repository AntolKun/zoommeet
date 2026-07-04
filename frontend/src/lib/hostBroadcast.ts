/**
 * Host-issued commands broadcast over the LiveKit data channel. Participant
 * attributes are owned by each participant, so host can't change them
 * directly — instead it asks via this channel and clients comply.
 */

export const HOST_TOPIC = 'vc.host'

export type HostAction =
  | { action: 'lower_all_hands' }
  | { action: 'mute_all' }
  | { action: 'reset_votes' }
  | { action: 'set_chat_copy_locked'; locked: boolean }
  | { action: 'set_chat_disabled'; disabled: boolean }
  | { action: 'set_unmute_restricted'; restricted: boolean }
  | { action: 'set_spotlight'; target_identity: string | null; target_name: string | null }
  | { action: 'set_watermark'; enabled: boolean }
  | { action: 'set_annotation_enabled'; enabled: boolean }
  | {
      action: 'breakout_assign'
      target_identity: string
      breakout_slug: string
      breakout_name: string
    }

const enc = new TextEncoder()
const dec = new TextDecoder()

export function encodeHostAction(a: HostAction): Uint8Array {
  return enc.encode(JSON.stringify(a))
}

export function decodeHostAction(bytes: Uint8Array): HostAction | null {
  try {
    const obj = JSON.parse(dec.decode(bytes)) as Partial<HostAction>
    if (
      obj.action === 'lower_all_hands' ||
      obj.action === 'mute_all' ||
      obj.action === 'reset_votes'
    ) {
      return obj as HostAction
    }
    if (
      obj.action === 'set_chat_copy_locked' &&
      typeof (obj as { locked?: unknown }).locked === 'boolean'
    ) {
      return obj as HostAction
    }
    if (
      obj.action === 'set_chat_disabled' &&
      typeof (obj as { disabled?: unknown }).disabled === 'boolean'
    ) {
      return obj as HostAction
    }
    if (
      obj.action === 'set_unmute_restricted' &&
      typeof (obj as { restricted?: unknown }).restricted === 'boolean'
    ) {
      return obj as HostAction
    }
    if (obj.action === 'set_spotlight') {
      const sp = obj as Partial<Extract<HostAction, { action: 'set_spotlight' }>>
      const tIdent = sp.target_identity
      const tName = sp.target_name
      if (
        (tIdent === null || typeof tIdent === 'string') &&
        (tName === null || typeof tName === 'string')
      ) {
        return obj as HostAction
      }
    }
    if (
      obj.action === 'set_watermark' &&
      typeof (obj as { enabled?: unknown }).enabled === 'boolean'
    ) {
      return obj as HostAction
    }
    if (
      obj.action === 'set_annotation_enabled' &&
      typeof (obj as { enabled?: unknown }).enabled === 'boolean'
    ) {
      return obj as HostAction
    }
    if (obj.action === 'breakout_assign') {
      const ba = obj as Partial<Extract<HostAction, { action: 'breakout_assign' }>>
      if (
        typeof ba.target_identity === 'string' &&
        typeof ba.breakout_slug === 'string' &&
        typeof ba.breakout_name === 'string'
      ) {
        return obj as HostAction
      }
    }
    return null
  } catch {
    return null
  }
}
