/**
 * Wire protocol for in-room chat broadcast via LiveKit data channel.
 *
 * Three topics:
 *   - vc.chat        : new messages (full payload)
 *   - vc.chat-update : edits, deletes, reactions on existing messages
 *
 * Both backed by backend persistence for auth users so history survives the
 * meeting. Guests broadcast LK-only (no persistence, gone when meeting ends).
 */

export const CHAT_TOPIC = 'vc.chat'
export const CHAT_UPDATE_TOPIC = 'vc.chat-update'

export type ChatPayload = {
  /** Backend row id if persisted (auth sender). Absent for guest messages. */
  id?: number
  body: string
  sender_name: string
  /** App user.id for auth sender; absent for guests. */
  sender_id?: number
  /** When set, this is a DM addressed to this user.id; otherwise public. */
  recipient_id?: number
  recipient_name?: string
  /** RFC3339 / ISO 8601 timestamp. */
  created_at: string
  /** Client-generated UUID for dedup against history fetched later. */
  uid: string
  /** Optional attached file — image/PDF/doc. Present when the message
   *  carries a file uploaded via POST /rooms/:slug/attachments. */
  attachment_url?: string
  attachment_name?: string
  attachment_type?: string
  attachment_size?: number
  /** Optional reply-to reference (quoted message). */
  reply_to_message_id?: number
  reply_to_body?: string
  reply_to_sender?: string
}

export type ChatUpdate =
  | { kind: 'edit'; message_id: number; body: string; edited_at: string }
  | { kind: 'delete'; message_id: number; deleted_at: string }
  | { kind: 'react'; message_id: number; emoji: string; user_id: number; added: boolean }
  | { kind: 'pin'; message_id: number; is_pinned: boolean }

const enc = new TextEncoder()
const dec = new TextDecoder()

export function encodeChatPayload(p: ChatPayload): Uint8Array {
  return enc.encode(JSON.stringify(p))
}

export function decodeChatPayload(bytes: Uint8Array): ChatPayload | null {
  try {
    const parsed = JSON.parse(dec.decode(bytes)) as Partial<ChatPayload>
    if (typeof parsed.body !== 'string' || typeof parsed.sender_name !== 'string') return null
    if (typeof parsed.created_at !== 'string' || typeof parsed.uid !== 'string') return null
    if (parsed.recipient_id !== undefined && typeof parsed.recipient_id !== 'number') return null
    if (parsed.attachment_url !== undefined && typeof parsed.attachment_url !== 'string') return null
    return parsed as ChatPayload
  } catch {
    return null
  }
}

export function encodeChatUpdate(u: ChatUpdate): Uint8Array {
  return enc.encode(JSON.stringify(u))
}

export function decodeChatUpdate(bytes: Uint8Array): ChatUpdate | null {
  try {
    const parsed = JSON.parse(dec.decode(bytes)) as Partial<ChatUpdate>
    if (parsed.kind === 'edit') {
      if (typeof parsed.message_id !== 'number') return null
      if (typeof parsed.body !== 'string' || typeof parsed.edited_at !== 'string') return null
      return parsed as ChatUpdate
    }
    if (parsed.kind === 'delete') {
      if (typeof parsed.message_id !== 'number') return null
      if (typeof parsed.deleted_at !== 'string') return null
      return parsed as ChatUpdate
    }
    if (parsed.kind === 'react') {
      if (typeof parsed.message_id !== 'number') return null
      if (typeof parsed.emoji !== 'string' || typeof parsed.user_id !== 'number') return null
      if (typeof parsed.added !== 'boolean') return null
      return parsed as ChatUpdate
    }
    return null
  } catch {
    return null
  }
}

export function newUid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
