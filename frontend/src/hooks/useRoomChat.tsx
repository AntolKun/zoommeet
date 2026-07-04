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

export type ChatMessage = ChatPayload & {
  /** True if this message was sent by the current user. */
  isMine: boolean
  /** Set when an edit lands; the UI uses this to show "(edited)". */
  edited_at?: string
  /** Set when a delete lands; the UI shows a deleted placeholder. */
  deleted_at?: string
  /** Emoji → list of user_ids that reacted. */
  reactions?: Record<string, number[]>
}

type BackendMessage = {
  id: number
  room_id: number
  sender_id: number
  recipient_id?: number
  body: string
  edited_at?: string
  deleted_at?: string
  created_at: string
  sender_name?: string
  recipient_name?: string
  reactions?: Record<string, number[]>
}

type SendOptions = {
  /** Auth user.id to direct-message. Identity (LK) is derived from this for
   *  targeted data-channel delivery. */
  recipientId?: number
  recipientName?: string
}

type ChatContextValue = {
  messages: ChatMessage[]
  send: (text: string, opts?: SendOptions) => Promise<void>
  editMessage: (messageId: number, newBody: string) => Promise<void>
  deleteMessage: (messageId: number) => Promise<void>
  toggleReaction: (messageId: number, emoji: string) => Promise<void>
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
        return
      }
    }
    room.on(RoomEvent.DataReceived, onData)
    return () => {
      room.off(RoomEvent.DataReceived, onData)
    }
  }, [room, addMessage, applyEdit, applyDelete, applyReaction])

  const send = useCallback(
    async (rawText: string, opts?: SendOptions) => {
      const text = rawText.trim()
      if (!text || !localParticipant) return
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

  const value = useMemo(
    () => ({ messages, send, editMessage, deleteMessage, toggleReaction, latest, historyLoaded }),
    [messages, send, editMessage, deleteMessage, toggleReaction, latest, historyLoaded],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
