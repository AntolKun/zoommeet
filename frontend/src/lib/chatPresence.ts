// Ephemeral chat presence: typing indicator + DM read receipts.
// Both use LiveKit data channels — nothing persisted, cleared on tab close.

export const TYPING_TOPIC = 'vc.chat-typing'
export const DM_READ_TOPIC = 'vc.chat-dm-read'

export type TypingPayload = {
  identity: string
  name: string
  active: boolean
  /** DM partner id when typing in a DM tab, absent for public. */
  recipient_id?: number
}

export type DMReadPayload = {
  reader_id: number
  reader_name: string
  /** The DM partner whose messages the reader marked as seen. */
  partner_id: number
  /** Highest message.id the reader has seen from that partner. */
  up_to_message_id: number
}

const enc = new TextEncoder()
const dec = new TextDecoder()

export function encodeTyping(p: TypingPayload): Uint8Array {
  return enc.encode(JSON.stringify(p))
}

export function decodeTyping(bytes: Uint8Array): TypingPayload | null {
  try {
    const parsed = JSON.parse(dec.decode(bytes)) as Partial<TypingPayload>
    if (typeof parsed.identity !== 'string' || typeof parsed.name !== 'string') return null
    if (typeof parsed.active !== 'boolean') return null
    return parsed as TypingPayload
  } catch {
    return null
  }
}

export function encodeDMRead(p: DMReadPayload): Uint8Array {
  return enc.encode(JSON.stringify(p))
}

export function decodeDMRead(bytes: Uint8Array): DMReadPayload | null {
  try {
    const parsed = JSON.parse(dec.decode(bytes)) as Partial<DMReadPayload>
    if (typeof parsed.reader_id !== 'number' || typeof parsed.partner_id !== 'number') return null
    if (typeof parsed.up_to_message_id !== 'number') return null
    if (typeof parsed.reader_name !== 'string') return null
    return parsed as DMReadPayload
  } catch {
    return null
  }
}
