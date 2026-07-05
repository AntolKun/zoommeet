import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useLocalParticipant, useRoomContext } from '@livekit/components-react'
import { RoomEvent } from 'livekit-client'
import { api, getCurrentUserId } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import {
  CHAT_TOPIC,
  CHAT_UPDATE_TOPIC,
  decodeChatPayload,
  decodeChatUpdate,
  encodeChatPayload,
  encodeChatUpdate,
  newUid,
  type ChatPayload,
} from '@/lib/chatProtocol'
import {
  DM_READ_TOPIC,
  TYPING_TOPIC,
  decodeDMRead,
  decodeTyping,
  encodeDMRead,
  encodeTyping,
  type TypingPayload,
} from '@/lib/chatPresence'

export type ChatMessage = ChatPayload & {
  /** True if this message was sent by the current user. */
  isMine: boolean
  /** Set when an edit lands; the UI uses this to show "(edited)". */
  edited_at?: string
  /** Set when a delete lands; the UI shows a deleted placeholder. */
  deleted_at?: string
  /** Emoji → list of user_ids that reacted. */
  reactions?: Record<string, number[]>
  /** Host-pinned marker. Live-synced across clients via vc.chat-update. */
  is_pinned?: boolean
}

type BackendMessage = {
  id: number
  room_id: number
  sender_id: number
  recipient_id?: number
  body: string
  attachment_url?: string
  attachment_name?: string
  attachment_type?: string
  attachment_size?: number
  reply_to_message_id?: number
  reply_to_body?: string
  reply_to_sender?: string
  is_pinned?: boolean
  edited_at?: string
  deleted_at?: string
  created_at: string
  sender_name?: string
  recipient_name?: string
  reactions?: Record<string, number[]>
}

export type ChatAttachment = {
  url: string
  name: string
  type: string
  size: number
}

type SendOptions = {
  /** Auth user.id to direct-message. Identity (LK) is derived from this for
   *  targeted data-channel delivery. */
  recipientId?: number
  recipientName?: string
  /** Optional file attachment. Client must call uploadAttachment first. */
  attachment?: ChatAttachment
  /** Optional reply-to reference. Client already has body/sender for preview. */
  replyTo?: { id: number; body: string; sender: string }
}

type ChatContextValue = {
  messages: ChatMessage[]
  send: (text: string, opts?: SendOptions) => Promise<void>
  editMessage: (messageId: number, newBody: string) => Promise<void>
  deleteMessage: (messageId: number) => Promise<void>
  toggleReaction: (messageId: number, emoji: string) => Promise<void>
  /** Upload a file to attach to a subsequent send() call. Throws on failure. */
  uploadAttachment: (file: File) => Promise<ChatAttachment>
  /** Host-only. Flips the message's pinned state; server enforces auth. */
  togglePin: (messageId: number, currentlyPinned: boolean) => Promise<void>
  /** Currently active typers (excludes self). Key = participant identity. */
  typers: Record<string, TypingPayload>
  /** Debounced broadcast: call on every keystroke. Auto-clears after 3s idle. */
  emitTyping: (activeTab: { kind: 'all' } | { kind: 'dm'; userId: number }) => void
  /** Mark all DM messages from `partnerId` up to `upToMessageId` as read + broadcast. */
  markDMRead: (partnerId: number, upToMessageId: number) => void
  /** Highest message id from me that has been read by that DM partner. */
  dmReadUpTo: Record<number, number>
  latest: ChatMessage | null
  historyLoaded: boolean
}

const Ctx = createContext<ChatContextValue | null>(null)

export function useRoomChat() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useRoomChat must be used inside <RoomChatProvider>')
  return v
}

/**
 * In-room chat provider with persistent history + realtime delivery.
 *
 * Topics:
 *   - vc.chat        : new messages (full payload)
 *   - vc.chat-update : edits/deletes/reactions on existing messages
 *
 * Auth users persist on send/edit/delete/react so state survives reconnect.
 * Guests broadcast LK-only.
 */
export function RoomChatProvider({
  slug,
  children,
}: {
  slug: string | undefined
  children: React.ReactNode
}) {
  const { isAuthenticated } = useAuth()
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const myId = getCurrentUserId()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const seenIds = useRef(new Set<number>())
  const seenUids = useRef(new Set<string>())
  const [typers, setTypers] = useState<Record<string, TypingPayload>>({})
  const [dmReadUpTo, setDmReadUpTo] = useState<Record<number, number>>({})
  // Auto-clear typer state 3s after last event so a client that drops off
  // stays "typing" no longer than one message worth of stale.
  const typerTimers = useRef<Record<string, number>>({})
  // Local debounce state for our own outbound typing event.
  const lastTypingSent = useRef<number>(0)
  const stopTypingTimer = useRef<number | null>(null)

  const addMessage = useCallback((m: ChatPayload, isMine: boolean) => {
    if (m.id !== undefined && seenIds.current.has(m.id)) return
    if (seenUids.current.has(m.uid)) return
    if (m.id !== undefined) seenIds.current.add(m.id)
    seenUids.current.add(m.uid)
    setMessages((prev) => [...prev, { ...m, isMine }])
  }, [])

  const applyEdit = useCallback((messageId: number, body: string, editedAt: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, body, edited_at: editedAt } : m,
      ),
    )
  }, [])

  const applyDelete = useCallback((messageId: number, deletedAt: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, body: '', deleted_at: deletedAt } : m,
      ),
    )
  }, [])

  const applyPin = useCallback((messageId: number, isPinned: boolean) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, is_pinned: isPinned } : m)),
    )
  }, [])

  const applyReaction = useCallback(
    (messageId: number, emoji: string, userId: number, added: boolean) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m
          const next: Record<string, number[]> = { ...(m.reactions ?? {}) }
          const existing = next[emoji] ?? []
          if (added) {
            if (!existing.includes(userId)) {
              next[emoji] = [...existing, userId]
            }
          } else {
            const filtered = existing.filter((u) => u !== userId)
            if (filtered.length === 0) {
              delete next[emoji]
            } else {
              next[emoji] = filtered
            }
          }
          return { ...m, reactions: next }
        }),
      )
    },
    [],
  )

  // Load persistent history once per slug (auth users only — guest fetch
  // would 401). Backend returns DESC by id; we render ASC.
  useEffect(() => {
    if (!slug || !isAuthenticated || historyLoaded) return
    let canceled = false
    api<{ messages: BackendMessage[] }>(`/rooms/${slug}/messages`)
      .then((r) => {
        if (canceled) return
        const sorted = [...r.messages].sort((a, b) => a.id - b.id)
        const next: ChatMessage[] = []
        for (const m of sorted) {
          seenIds.current.add(m.id)
          const uid = `db-${m.id}`
          seenUids.current.add(uid)
          next.push({
            id: m.id,
            uid,
            body: m.body,
            sender_name: m.sender_name ?? `user_${m.sender_id}`,
            sender_id: m.sender_id,
            recipient_id: m.recipient_id,
            recipient_name: m.recipient_name,
            created_at: m.created_at,
            edited_at: m.edited_at,
            deleted_at: m.deleted_at,
            reactions: m.reactions,
            attachment_url: m.attachment_url,
            attachment_name: m.attachment_name,
            attachment_type: m.attachment_type,
            attachment_size: m.attachment_size,
            reply_to_message_id: m.reply_to_message_id,
            reply_to_body: m.reply_to_body,
            reply_to_sender: m.reply_to_sender,
            is_pinned: m.is_pinned,
            isMine: m.sender_id === myId,
          })
        }
        setMessages((prev) => [...next, ...prev])
        setHistoryLoaded(true)
      })
      .catch(() => {
        setHistoryLoaded(true)
      })
    return () => {
      canceled = true
    }
  }, [slug, isAuthenticated, historyLoaded, myId])

  // Listen for LK data channel chat messages.
  useEffect(() => {
    if (!room) return
    const onData = (
      payload: Uint8Array,
      _participant: unknown,
      _kind: unknown,
      topic?: string,
    ) => {
      if (topic === CHAT_TOPIC) {
        const msg = decodeChatPayload(payload)
        if (!msg) return
        addMessage(msg, false)
        return
      }
      if (topic === CHAT_UPDATE_TOPIC) {
        const upd = decodeChatUpdate(payload)
        if (!upd) return
        if (upd.kind === 'edit') applyEdit(upd.message_id, upd.body, upd.edited_at)
        else if (upd.kind === 'delete') applyDelete(upd.message_id, upd.deleted_at)
        else if (upd.kind === 'react')
          applyReaction(upd.message_id, upd.emoji, upd.user_id, upd.added)
        else if (upd.kind === 'pin') applyPin(upd.message_id, upd.is_pinned)
        return
      }
      if (topic === TYPING_TOPIC) {
        const t = decodeTyping(payload)
        if (!t || t.identity === localParticipant?.identity) return
        setTypers((prev) => {
          if (!t.active) {
            const { [t.identity]: _, ...rest } = prev
            void _
            return rest
          }
          return { ...prev, [t.identity]: t }
        })
        // Refresh the 3s auto-clear timer for this identity.
        const existing = typerTimers.current[t.identity]
        if (existing) window.clearTimeout(existing)
        if (t.active) {
          typerTimers.current[t.identity] = window.setTimeout(() => {
            setTypers((prev) => {
              const { [t.identity]: _, ...rest } = prev
              void _
              return rest
            })
          }, 3500)
        }
        return
      }
      if (topic === DM_READ_TOPIC) {
        const r = decodeDMRead(payload)
        if (!r || myId === null) return
        // The broadcaster read messages FROM `partner_id`, up to `up_to_message_id`.
        // If I'm that partner, this means my messages up to that id are seen.
        if (r.partner_id === myId) {
          setDmReadUpTo((prev) => {
            const cur = prev[r.reader_id] ?? 0
            if (r.up_to_message_id <= cur) return prev
            return { ...prev, [r.reader_id]: r.up_to_message_id }
          })
        }
        return
      }
    }
    room.on(RoomEvent.DataReceived, onData)
    return () => {
      room.off(RoomEvent.DataReceived, onData)
    }
  }, [room, addMessage, applyEdit, applyDelete, applyReaction, applyPin, localParticipant?.identity, myId])

  const send = useCallback(
    async (rawText: string, opts?: SendOptions) => {
      const text = rawText.trim()
      // Attachment-only messages are allowed — body can be empty when a file is present.
      if (!localParticipant) return
      if (!text && !opts?.attachment) return
      if (text.length > 2000) return

      const senderName =
        localParticipant.name?.trim() ||
        localParticipant.identity ||
        'Tamu'

      let backendId: number | undefined
      let createdAt = new Date().toISOString()
      if (isAuthenticated && slug) {
        try {
          const body: Record<string, unknown> = { body: text }
          if (opts?.recipientId) body.recipient_id = opts.recipientId
          if (opts?.attachment) {
            body.attachment_url = opts.attachment.url
            body.attachment_name = opts.attachment.name
            body.attachment_type = opts.attachment.type
            body.attachment_size = opts.attachment.size
          }
          if (opts?.replyTo) {
            body.reply_to_message_id = opts.replyTo.id
          }
          const msg = await api<BackendMessage>(`/rooms/${slug}/messages`, {
            method: 'POST',
            body,
          })
          backendId = msg.id
          createdAt = msg.created_at
        } catch {
          // Fall back to LK-only delivery.
        }
      }

      const payload: ChatPayload = {
        id: backendId,
        uid: newUid(),
        body: text,
        sender_name: senderName,
        sender_id: myId ?? undefined,
        recipient_id: opts?.recipientId,
        recipient_name: opts?.recipientName,
        created_at: createdAt,
        attachment_url: opts?.attachment?.url,
        attachment_name: opts?.attachment?.name,
        attachment_type: opts?.attachment?.type,
        attachment_size: opts?.attachment?.size,
        reply_to_message_id: opts?.replyTo?.id,
        reply_to_body: opts?.replyTo?.body,
        reply_to_sender: opts?.replyTo?.sender,
      }

      addMessage(payload, true)

      const bytes = encodeChatPayload(payload)
      // For DMs, target only the recipient (their LK identity is the user.id
      // string for auth users). For public messages, broadcast to everyone.
      const publishOpts: Parameters<typeof localParticipant.publishData>[1] = {
        reliable: true,
        topic: CHAT_TOPIC,
      }
      if (opts?.recipientId) {
        publishOpts.destinationIdentities = [String(opts.recipientId)]
      }
      await localParticipant.publishData(bytes, publishOpts).catch(() => {})
    },
    [slug, isAuthenticated, localParticipant, myId, addMessage],
  )

  const editMessage = useCallback(
    async (messageId: number, newBody: string) => {
      const trimmed = newBody.trim()
      if (!trimmed || !localParticipant) return
      try {
        const updated = await api<BackendMessage>(`/messages/${messageId}`, {
          method: 'PATCH',
          body: { body: trimmed },
        })
        const editedAt = updated.edited_at ?? new Date().toISOString()
        applyEdit(messageId, trimmed, editedAt)
        await localParticipant
          .publishData(
            encodeChatUpdate({
              kind: 'edit',
              message_id: messageId,
              body: trimmed,
              edited_at: editedAt,
            }),
            { reliable: true, topic: CHAT_UPDATE_TOPIC },
          )
          .catch(() => {})
      } catch {
        // surface to caller via promise rejection
        throw new Error('edit failed')
      }
    },
    [localParticipant, applyEdit],
  )

  const deleteMessage = useCallback(
    async (messageId: number) => {
      if (!localParticipant) return
      try {
        await api(`/messages/${messageId}`, { method: 'DELETE' })
        const deletedAt = new Date().toISOString()
        applyDelete(messageId, deletedAt)
        await localParticipant
          .publishData(
            encodeChatUpdate({
              kind: 'delete',
              message_id: messageId,
              deleted_at: deletedAt,
            }),
            { reliable: true, topic: CHAT_UPDATE_TOPIC },
          )
          .catch(() => {})
      } catch {
        throw new Error('delete failed')
      }
    },
    [localParticipant, applyDelete],
  )

  const toggleReaction = useCallback(
    async (messageId: number, emoji: string) => {
      if (!localParticipant || myId === null) return
      const current = messages.find((m) => m.id === messageId)
      const alreadyReacted = current?.reactions?.[emoji]?.includes(myId) ?? false
      const willAdd = !alreadyReacted

      try {
        if (willAdd) {
          await api(`/messages/${messageId}/reactions`, {
            method: 'POST',
            body: { emoji },
          })
        } else {
          await api(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
            method: 'DELETE',
          })
        }
        applyReaction(messageId, emoji, myId, willAdd)
        await localParticipant
          .publishData(
            encodeChatUpdate({
              kind: 'react',
              message_id: messageId,
              emoji,
              user_id: myId,
              added: willAdd,
            }),
            { reliable: true, topic: CHAT_UPDATE_TOPIC },
          )
          .catch(() => {})
      } catch {
        throw new Error('react failed')
      }
    },
    [localParticipant, myId, messages, applyReaction],
  )

  const latest = useMemo(
    () => (messages.length > 0 ? messages[messages.length - 1] : null),
    [messages],
  )

  const emitTyping = useCallback(
    (activeTab: { kind: 'all' } | { kind: 'dm'; userId: number }) => {
      if (!localParticipant) return
      const now = Date.now()
      const senderName =
        localParticipant.name?.trim() || localParticipant.identity || 'Tamu'
      // Debounce: only broadcast "active=true" at most every 2s.
      if (now - lastTypingSent.current > 2000) {
        lastTypingSent.current = now
        const payload: TypingPayload = {
          identity: localParticipant.identity,
          name: senderName,
          active: true,
          recipient_id: activeTab.kind === 'dm' ? activeTab.userId : undefined,
        }
        const publishOpts: Parameters<typeof localParticipant.publishData>[1] = {
          reliable: false,
          topic: TYPING_TOPIC,
        }
        if (activeTab.kind === 'dm') {
          publishOpts.destinationIdentities = [String(activeTab.userId)]
        }
        void localParticipant.publishData(encodeTyping(payload), publishOpts).catch(() => {})
      }
      // Always reset the "stop-typing" broadcast timer.
      if (stopTypingTimer.current) window.clearTimeout(stopTypingTimer.current)
      stopTypingTimer.current = window.setTimeout(() => {
        lastTypingSent.current = 0
        const payload: TypingPayload = {
          identity: localParticipant.identity,
          name: senderName,
          active: false,
          recipient_id: activeTab.kind === 'dm' ? activeTab.userId : undefined,
        }
        const publishOpts: Parameters<typeof localParticipant.publishData>[1] = {
          reliable: false,
          topic: TYPING_TOPIC,
        }
        if (activeTab.kind === 'dm') {
          publishOpts.destinationIdentities = [String(activeTab.userId)]
        }
        void localParticipant.publishData(encodeTyping(payload), publishOpts).catch(() => {})
      }, 3000)
    },
    [localParticipant],
  )

  const markDMRead = useCallback(
    (partnerId: number, upToMessageId: number) => {
      if (!localParticipant || myId === null) return
      const readerName =
        localParticipant.name?.trim() || localParticipant.identity || 'Tamu'
      const payload = {
        reader_id: myId,
        reader_name: readerName,
        partner_id: partnerId,
        up_to_message_id: upToMessageId,
      }
      const publishOpts: Parameters<typeof localParticipant.publishData>[1] = {
        reliable: true,
        topic: DM_READ_TOPIC,
        destinationIdentities: [String(partnerId)],
      }
      void localParticipant.publishData(encodeDMRead(payload), publishOpts).catch(() => {})
    },
    [localParticipant, myId],
  )

  const togglePin = useCallback(
    async (messageId: number, currentlyPinned: boolean) => {
      if (!localParticipant) return
      const nextState = !currentlyPinned
      try {
        await api<BackendMessage>(`/messages/${messageId}/${nextState ? 'pin' : 'unpin'}`, {
          method: 'POST',
        })
        applyPin(messageId, nextState)
        const bytes = encodeChatUpdate({ kind: 'pin', message_id: messageId, is_pinned: nextState })
        await localParticipant
          .publishData(bytes, { reliable: true, topic: CHAT_UPDATE_TOPIC })
          .catch(() => {})
      } catch {
        // Server rejected (not host, etc.) — leave state alone.
      }
    },
    [localParticipant, applyPin],
  )

  const uploadAttachment = useCallback(
    async (file: File): Promise<ChatAttachment> => {
      if (!slug) throw new Error('no room')
      // JSON api() helper doesn't support multipart; hit fetch directly.
      const form = new FormData()
      form.append('file', file)
      const token = localStorage.getItem('videoconf.token')
      const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api'
      const res = await fetch(`${base}/rooms/${slug}/attachments`, {
        method: 'POST',
        body: form,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const text = await res.text()
      const data = text ? JSON.parse(text) : {}
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      return data as ChatAttachment
    },
    [slug],
  )

  const value = useMemo(
    () => ({
      messages,
      send,
      editMessage,
      deleteMessage,
      toggleReaction,
      uploadAttachment,
      togglePin,
      typers,
      emitTyping,
      markDMRead,
      dmReadUpTo,
      latest,
      historyLoaded,
    }),
    [
      messages,
      send,
      editMessage,
      deleteMessage,
      toggleReaction,
      uploadAttachment,
      togglePin,
      typers,
      emitTyping,
      markDMRead,
      dmReadUpTo,
      latest,
      historyLoaded,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
