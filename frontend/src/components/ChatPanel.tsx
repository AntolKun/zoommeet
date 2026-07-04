import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParticipants } from '@livekit/components-react'
import { useRoomChat, type ChatMessage } from '@/hooks/useRoomChat'
import { useChatCopyLock } from '@/hooks/useChatCopyLock'
import { useChatDisabled } from '@/hooks/useRoomFlags'
import { getCurrentUserId } from '@/lib/api'

type Props = {
  open: boolean
  onClose: () => void
  /** Hosts can chat even when chat is disabled for everyone else. */
  isHost: boolean
}

const EMOJI_PALETTE = [
  '😀', '😂', '🥲', '😊', '😍', '🤔', '🙄', '😮',
  '😴', '🤩', '🙏', '👍', '👎', '👏', '🙌', '💪',
  '🔥', '🎉', '✅', '❌', '💡', '⚡', '✨', '❤️',
  '👀', '🤝', '☕', '🍕', '🚀', '📌', '⏰', '💬',
]

const REACTION_PICKER = ['👍', '❤️', '😂', '😮', '🎉', '🔥', '🙏', '👀']

type Tab =
  | { kind: 'all' }
  | { kind: 'dm'; userId: number; name: string }

/**
 * Custom event other components fire to open a specific DM tab. Used by
 * ParticipantsPanel's "DM" button — keeps state lifting out of Room.tsx.
 */
type OpenDmEventDetail = { userId: number; name: string }
export const OPEN_DM_EVENT = 'vc.openChatDm'
export function dispatchOpenDm(userId: number, name: string) {
  window.dispatchEvent(
    new CustomEvent<OpenDmEventDetail>(OPEN_DM_EVENT, { detail: { userId, name } }),
  )
}

export function ChatPanel({ open, onClose, isHost }: Props) {
  const { t } = useTranslation()
  const { messages, send, historyLoaded, uploadAttachment } = useRoomChat()
  const { locked: copyLocked } = useChatCopyLock()
  const { disabled: chatDisabled } = useChatDisabled()
  const inputDisabled = chatDisabled && !isHost
  const myId = getCurrentUserId()

  const [text, setText] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>({ kind: 'all' })
  // Pending attachment: user picked a file, previewing before send.
  const [pending, setPending] = useState<{ file: File; preview?: string } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const participants = useParticipants()

  // Collect DM partners from message history so they each get a tab. The
  // partner is whichever side of the DM isn't me.
  const dmPartners = useMemo(() => {
    const m = new Map<number, string>()
    for (const msg of messages) {
      if (msg.recipient_id === undefined) continue
      const partnerId = msg.isMine ? msg.recipient_id : msg.sender_id
      const partnerName = msg.isMine
        ? msg.recipient_name ?? `user_${msg.recipient_id}`
        : msg.sender_name
      if (partnerId === undefined || partnerId === myId) continue
      if (!m.has(partnerId)) m.set(partnerId, partnerName)
    }
    return [...m.entries()].map(([userId, name]) => ({ userId, name }))
  }, [messages, myId])

  // Listen for external "open DM" requests.
  useEffect(() => {
    function handle(e: Event) {
      const detail = (e as CustomEvent<OpenDmEventDetail>).detail
      if (!detail) return
      setActiveTab({ kind: 'dm', userId: detail.userId, name: detail.name })
    }
    window.addEventListener(OPEN_DM_EVENT, handle)
    return () => window.removeEventListener(OPEN_DM_EVENT, handle)
  }, [])

  // Filter messages for the active tab.
  const visibleMessages = useMemo(() => {
    if (activeTab.kind === 'all') {
      return messages.filter((m) => m.recipient_id === undefined)
    }
    const target = activeTab.userId
    return messages.filter((m) => {
      if (m.recipient_id === undefined) return false
      const senderIsMe = m.isMine
      const partnerSent =
        m.sender_id === target && (m.recipient_id === myId || m.recipient_id === target)
      const iSentToPartner = senderIsMe && m.recipient_id === target
      return iSentToPartner || partnerSent
    })
  }, [messages, activeTab, myId])

  useEffect(() => {
    if (!open) return
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [visibleMessages.length, open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  function handleTextChange(value: string) {
    setText(value)
    const el = inputRef.current
    const caret = el?.selectionStart ?? value.length
    const upto = value.slice(0, caret)
    const m = upto.match(/(?:^|\s)@(\S{0,40})$/)
    if (m) {
      setMentionOpen(true)
      setMentionQuery(m[1])
    } else {
      setMentionOpen(false)
    }
  }

  const mentionSuggestions = useMemo(() => {
    if (!mentionOpen) return []
    const q = mentionQuery.toLowerCase()
    return participants
      .filter((p) => (p.name?.trim() || p.identity).toLowerCase().includes(q))
      .slice(0, 6)
  }, [mentionOpen, mentionQuery, participants])

  function insertMention(name: string) {
    const el = inputRef.current
    const caret = el?.selectionStart ?? text.length
    const upto = text.slice(0, caret)
    const after = text.slice(caret)
    const newUpto = upto.replace(/@\S*$/, `@${name} `)
    const next = newUpto + after
    setText(next)
    setMentionOpen(false)
    requestAnimationFrame(() => {
      el?.focus()
      const pos = newUpto.length
      el?.setSelectionRange(pos, pos)
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (sending) return
    if (!text.trim() && !pending) return
    setSending(true)
    setUploadError(null)
    try {
      let attachment: Awaited<ReturnType<typeof uploadAttachment>> | undefined
      if (pending) {
        try {
          attachment = await uploadAttachment(pending.file)
        } catch (err) {
          setUploadError(err instanceof Error ? err.message : t('chat.attachUploadFail'))
          setSending(false)
          return
        }
      }
      const opts: Parameters<typeof send>[1] = {}
      if (activeTab.kind === 'dm') {
        opts.recipientId = activeTab.userId
        opts.recipientName = activeTab.name
      }
      if (attachment) opts.attachment = attachment
      await send(text, opts)
      setText('')
      setPending(null)
      setEmojiOpen(false)
      setMentionOpen(false)
    } finally {
      setSending(false)
    }
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (!f) return
    setUploadError(null)
    if (f.size > 10 * 1024 * 1024) {
      setUploadError(t('chat.attachTooBig'))
      return
    }
    // Local preview for images so the user sees what they're about to send.
    const preview = f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined
    setPending({ file: f, preview })
  }

  function clearPending() {
    if (pending?.preview) URL.revokeObjectURL(pending.preview)
    setPending(null)
    setUploadError(null)
  }

  function insertEmoji(emoji: string) {
    const el = inputRef.current
    if (!el) {
      setText((t) => t + emoji)
      return
    }
    const start = el.selectionStart ?? text.length
    const end = el.selectionEnd ?? text.length
    setText(text.slice(0, start) + emoji + text.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + emoji.length
      el.setSelectionRange(pos, pos)
    })
  }

  return (
    <>
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        aria-label={t('chat.title')}
        className={`fixed top-0 right-0 z-50 h-svh w-[min(380px,90vw)] bg-[var(--color-surface)] border-l border-[var(--color-line-strong)] shadow-2xl transition-transform flex flex-col ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex items-center justify-between px-5 h-14 border-b border-[var(--color-line)] shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">{t('chat.title')}</h2>
            <span className="font-mono text-xs text-[var(--color-ink-muted)]">
              {messages.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] font-mono uppercase tracking-wider"
          >
            {t('waiting.closeUpper')}
          </button>
        </header>

        {/* Tabs row: Semua + each DM partner */}
        <div className="flex items-center gap-1 px-3 pt-2 pb-1 border-b border-[var(--color-line)] shrink-0 overflow-x-auto">
          <TabButton
            active={activeTab.kind === 'all'}
            onClick={() => setActiveTab({ kind: 'all' })}
            label={t('chat.tabAll')}
          />
          {dmPartners.map((p) => (
            <TabButton
              key={p.userId}
              active={activeTab.kind === 'dm' && activeTab.userId === p.userId}
              onClick={() => setActiveTab({ kind: 'dm', userId: p.userId, name: p.name })}
              label={`@ ${p.name}`}
              onClose={() => {
                if (activeTab.kind === 'dm' && activeTab.userId === p.userId) {
                  setActiveTab({ kind: 'all' })
                }
              }}
            />
          ))}
        </div>

        {copyLocked && (
          <div className="px-4 py-1.5 bg-[color-mix(in_oklab,var(--color-flame)_14%,transparent)] border-b border-[var(--color-line)] flex items-center gap-2">
            <span className="text-xs">🔒</span>
            <span className="text-[11px] text-[var(--color-ink-soft)] font-mono uppercase tracking-wider">
              {t('chat.copyLocked')}
            </span>
          </div>
        )}

        {inputDisabled && (
          <div className="px-4 py-1.5 bg-[color-mix(in_oklab,var(--color-bad)_14%,transparent)] border-b border-[var(--color-line)] flex items-center gap-2">
            <span className="text-xs">🚫</span>
            <span className="text-[11px] text-[var(--color-ink-soft)] font-mono uppercase tracking-wider">
              {t('chat.disabledBanner')}
            </span>
          </div>
        )}

        {activeTab.kind === 'dm' && (
          <div className="px-4 py-1.5 bg-[color-mix(in_oklab,var(--color-flame)_10%,transparent)] border-b border-[var(--color-line)] flex items-center gap-2">
            <span className="text-xs">📨</span>
            <span className="text-[11px] text-[var(--color-ink-soft)] font-mono uppercase tracking-wider">
              {t('chat.dmBanner', { name: activeTab.name })}
            </span>
          </div>
        )}

        <div
          ref={listRef}
          className={`flex-1 overflow-y-auto px-4 py-3 space-y-3 ${copyLocked ? 'select-none' : ''}`}
          onCopy={copyLocked ? (e) => e.preventDefault() : undefined}
          onContextMenu={copyLocked ? (e) => e.preventDefault() : undefined}
        >
          {!historyLoaded && visibleMessages.length === 0 && (
            <p className="text-xs text-[var(--color-ink-faint)] font-mono">{t('chat.loading')}</p>
          )}
          {historyLoaded && visibleMessages.length === 0 && (
            <p className="text-xs text-[var(--color-ink-faint)] text-center mt-8">
              {activeTab.kind === 'dm'
                ? t('chat.emptyDm', { name: activeTab.name })
                : t('chat.emptyAll')}
            </p>
          )}
          {visibleMessages.map((m) => (
            <MessageRow key={m.uid} msg={m} />
          ))}
        </div>

        {emojiOpen && (
          <div className="border-t border-[var(--color-line)] px-3 py-2 grid grid-cols-8 gap-1 max-h-32 overflow-y-auto shrink-0">
            {EMOJI_PALETTE.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => insertEmoji(e)}
                className="h-7 w-7 rounded hover:bg-[var(--color-surface-2)] text-base leading-none"
                aria-label={t('chat.insertEmoji', { emoji: e })}
              >
                {e}
              </button>
            ))}
          </div>
        )}

        {mentionOpen && mentionSuggestions.length > 0 && (
          <div className="border-t border-[var(--color-line)] px-2 py-1 shrink-0 max-h-44 overflow-y-auto">
            {mentionSuggestions.map((p) => {
              const name = p.name?.trim() || p.identity
              return (
                <button
                  key={p.identity}
                  type="button"
                  onClick={() => insertMention(name)}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-[var(--color-surface-2)] flex items-center gap-2"
                >
                  <span className="text-[var(--color-flame)] font-mono text-xs">@</span>
                  <span className="text-sm text-[var(--color-ink)] truncate">{name}</span>
                </button>
              )
            })}
          </div>
        )}

        {(pending || uploadError) && (
          <div className="border-t border-[var(--color-line)] px-3 py-2 shrink-0">
            {pending && (
              <div className="flex items-center gap-2 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)] p-2">
                {pending.preview ? (
                  <img
                    src={pending.preview}
                    alt=""
                    className="w-10 h-10 rounded object-cover"
                  />
                ) : (
                  <span className="w-10 h-10 rounded bg-[var(--color-surface)] flex items-center justify-center text-lg" aria-hidden>📎</span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[var(--color-ink)] truncate">{pending.file.name}</p>
                  <p className="text-[10px] font-mono text-[var(--color-ink-faint)]">
                    {formatBytes(pending.file.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearPending}
                  aria-label={t('chat.attachRemove')}
                  className="text-[var(--color-ink-muted)] hover:text-[var(--color-bad)] px-1"
                >
                  ×
                </button>
              </div>
            )}
            {uploadError && (
              <p className="text-[10px] text-[var(--color-bad)] mt-1">{uploadError}</p>
            )}
          </div>
        )}
        <form
          onSubmit={handleSubmit}
          className="border-t border-[var(--color-line)] p-3 flex items-end gap-2 shrink-0"
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,application/pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
            onChange={onPickFile}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || inputDisabled}
            title={t('chat.attachTitle')}
            aria-label={t('chat.attachTitle')}
            className="h-9 w-9 shrink-0 rounded-md border border-[var(--color-line)] flex items-center justify-center text-base text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] disabled:opacity-50"
          >
            📎
          </button>
          <button
            type="button"
            onClick={() => setEmojiOpen((v) => !v)}
            aria-pressed={emojiOpen}
            title={t('chat.emojiTitle')}
            className={`h-9 w-9 shrink-0 rounded-md border flex items-center justify-center text-base transition-colors ${
              emojiOpen
                ? 'bg-[var(--color-surface-2)] border-[var(--color-line-strong)] text-[var(--color-ink)]'
                : 'border-[var(--color-line)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
            }`}
          >
            😀
          </button>
          <input
            ref={inputRef}
            type="text"
            placeholder={
              inputDisabled
                ? t('chat.placeholderDisabled')
                : activeTab.kind === 'dm'
                ? t('chat.placeholderDm', { name: activeTab.name })
                : t('chat.placeholder')
            }
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            maxLength={2000}
            disabled={sending || inputDisabled}
            className="flex-1 h-9 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] px-3 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-flame)] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || inputDisabled || (!text.trim() && !pending)}
            className="h-9 px-3 rounded-md bg-[var(--color-flame)] text-[var(--color-canvas)] text-xs font-medium hover:bg-[var(--color-flame-soft)] disabled:opacity-50"
          >
            {t('chat.send')}
          </button>
        </form>
      </aside>
    </>
  )
}

function TabButton({
  active,
  onClick,
  label,
  onClose,
}: {
  active: boolean
  onClick: () => void
  label: string
  onClose?: () => void
}) {
  const { t } = useTranslation()
  return (
    <span
      className={`inline-flex items-center rounded shrink-0 ${
        active
          ? 'bg-[var(--color-flame)] text-[var(--color-canvas)]'
          : 'bg-[var(--color-surface-2)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`text-xs font-medium px-2 h-7 max-w-[120px] truncate`}
      >
        {label}
      </button>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={t('chat.tabClose')}
          className={`text-base leading-none px-1 h-7 ${
            active ? 'text-[var(--color-canvas)]/80 hover:text-[var(--color-canvas)]' : 'text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
          }`}
        >
          ×
        </button>
      )}
    </span>
  )
}

function MessageRow({ msg }: { msg: ChatMessage }) {
  const { t, i18n } = useTranslation()
  const { editMessage, deleteMessage, toggleReaction } = useRoomChat()
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(msg.body)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const time = formatTime(msg.created_at, i18n.language)
  const myId = getCurrentUserId()

  const isDeleted = !!msg.deleted_at
  const isEdited = !!msg.edited_at
  const isDM = msg.recipient_id !== undefined
  const canEditOrDelete = msg.isMine && !isDeleted && msg.id !== undefined

  async function saveEdit() {
    if (msg.id === undefined) return
    try {
      await editMessage(msg.id, editText)
      setEditing(false)
      setError(null)
    } catch {
      setError(t('chat.errEditFailed'))
    }
  }

  async function doDelete() {
    if (msg.id === undefined) return
    if (!confirm(t('chat.editPrompt'))) return
    try {
      await deleteMessage(msg.id)
    } catch {
      setError(t('chat.errDeleteFailed'))
    }
  }

  function chooseReaction(emoji: string) {
    if (msg.id === undefined) return
    setPickerOpen(false)
    toggleReaction(msg.id, emoji).catch(() => setError(t('chat.errReactFailed')))
  }

  return (
    <div
      className={`group flex flex-col ${msg.isMine ? 'items-end' : 'items-start'}`}
    >
      {!msg.isMine && (
        <p className="text-[10px] text-[var(--color-ink-muted)] font-mono mb-0.5 px-1">
          {msg.sender_name}
          {isDM && msg.recipient_id === myId && (
            <span className="ml-1 text-[var(--color-flame)]">{t('chat.toMeArrow')}</span>
          )}
        </p>
      )}
      {msg.isMine && isDM && msg.recipient_name && (
        <p className="text-[10px] text-[var(--color-flame)] font-mono mb-0.5 px-1">
          → {msg.recipient_name}
        </p>
      )}

      {editing ? (
        <div className="w-full max-w-[80%] flex flex-col gap-1.5">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={2}
            maxLength={2000}
            className="w-full rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line-strong)] px-2 py-1.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-flame)] resize-none"
          />
          <div className="flex items-center gap-1.5 justify-end">
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setEditText(msg.body)
              }}
              className="text-[10px] font-mono text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            >
              {t('chat.cancelEdit')}
            </button>
            <button
              type="button"
              onClick={saveEdit}
              disabled={!editText.trim() || editText === msg.body}
              className="h-7 px-2 text-[11px] rounded bg-[var(--color-flame)] text-[var(--color-canvas)] hover:bg-[var(--color-flame-soft)] disabled:opacity-50"
            >
              {t('chat.saveEdit')}
            </button>
          </div>
        </div>
      ) : (
        <div className="relative max-w-[80%]">
          {isDeleted ? (
            <div className="rounded-lg px-3 py-1.5 text-sm italic text-[var(--color-ink-faint)] border border-dashed border-[var(--color-line)]">
              {t('chat.deletedPlaceholder')}
            </div>
          ) : (
            <div
              className={`rounded-lg px-3 py-1.5 text-sm break-words ${
                msg.isMine
                  ? `${isDM ? 'bg-[var(--color-flame-deep)]' : 'bg-[var(--color-flame)]'} text-[var(--color-canvas)]`
                  : `${isDM ? 'border-[var(--color-flame)] bg-[color-mix(in_oklab,var(--color-flame)_8%,transparent)]' : 'border-[var(--color-line)] bg-[var(--color-surface-2)]'} text-[var(--color-ink)] border`
              }`}
            >
              {msg.body && <MessageBody text={msg.body} />}
              {msg.attachment_url && (
                <AttachmentBlock
                  url={msg.attachment_url}
                  name={msg.attachment_name}
                  type={msg.attachment_type}
                  size={msg.attachment_size}
                  isMine={msg.isMine}
                />
              )}
            </div>
          )}

          {!isDeleted && msg.id !== undefined && (
            <div
              className={`absolute -top-3 ${
                msg.isMine ? 'left-0' : 'right-0'
              } opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5`}
            >
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                title={t('chat.reactTitle')}
                className="w-6 h-6 rounded-full bg-[var(--color-surface)] border border-[var(--color-line-strong)] flex items-center justify-center text-xs hover:bg-[var(--color-surface-2)]"
              >
                😊
              </button>
              {canEditOrDelete && (
                <>
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    title={t('chat.editTitle')}
                    className="w-6 h-6 rounded-full bg-[var(--color-surface)] border border-[var(--color-line-strong)] flex items-center justify-center text-[10px] hover:bg-[var(--color-surface-2)]"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={doDelete}
                    title={t('chat.deleteTitle')}
                    className="w-6 h-6 rounded-full bg-[var(--color-surface)] border border-[var(--color-line-strong)] flex items-center justify-center text-[10px] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-bad)]"
                  >
                    🗑
                  </button>
                </>
              )}
            </div>
          )}

          {pickerOpen && (
            <div
              className={`absolute top-full mt-1 z-10 ${
                msg.isMine ? 'right-0' : 'left-0'
              } bg-[var(--color-surface)] border border-[var(--color-line-strong)] rounded-md shadow-2xl p-1 flex items-center gap-0.5`}
            >
              {REACTION_PICKER.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => chooseReaction(emoji)}
                  className="w-7 h-7 rounded hover:bg-[var(--color-surface-2)] text-base leading-none"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
        <div className={`flex flex-wrap gap-1 mt-1 ${msg.isMine ? 'justify-end' : ''}`}>
          {Object.entries(msg.reactions).map(([emoji, userIds]) => {
            if (userIds.length === 0) return null
            const reacted = myId !== null && userIds.includes(myId)
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => msg.id !== undefined && toggleReaction(msg.id, emoji)}
                className={`inline-flex items-center gap-0.5 px-1.5 h-5 rounded-full border text-[11px] ${
                  reacted
                    ? 'border-[var(--color-flame)] bg-[color-mix(in_oklab,var(--color-flame)_18%,transparent)] text-[var(--color-flame-soft)]'
                    : 'border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
                }`}
              >
                <span>{emoji}</span>
                <span className="font-mono">{userIds.length}</span>
              </button>
            )
          })}
        </div>
      )}

      <p className="text-[10px] text-[var(--color-ink-faint)] font-mono mt-0.5 px-1">
        {time}
        {isEdited && !isDeleted && <span> · {t('chat.edited')}</span>}
      </p>
      {error && (
        <p className="text-[10px] text-[var(--color-bad)] font-mono mt-0.5 px-1">{error}</p>
      )}
    </div>
  )
}

function MessageBody({ text }: { text: string }) {
  const parts = useMemo(() => {
    const segments: Array<{ kind: 'text' | 'mention'; value: string }> = []
    const regex = /(@\S+)/g
    let last = 0
    let m: RegExpExecArray | null
    while ((m = regex.exec(text)) !== null) {
      if (m.index > last) {
        segments.push({ kind: 'text', value: text.slice(last, m.index) })
      }
      segments.push({ kind: 'mention', value: m[1] })
      last = m.index + m[1].length
    }
    if (last < text.length) {
      segments.push({ kind: 'text', value: text.slice(last) })
    }
    return segments
  }, [text])

  return (
    <>
      {parts.map((p, i) =>
        p.kind === 'mention' ? (
          <span key={i} className="font-semibold underline decoration-dotted underline-offset-2">
            {p.value}
          </span>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </>
  )
}

function AttachmentBlock({
  url,
  name,
  type,
  size,
  isMine,
}: {
  url: string
  name?: string
  type?: string
  size?: number
  isMine: boolean
}) {
  const isImage = type?.startsWith('image/')
  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block mt-1">
        <img
          src={url}
          alt={name ?? ''}
          loading="lazy"
          className="max-w-full max-h-64 rounded object-contain border border-[var(--color-line)]"
        />
      </a>
    )
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      download={name}
      className={`mt-1 flex items-center gap-2 rounded-md px-2 py-1.5 no-underline border ${
        isMine
          ? 'border-[var(--color-canvas)]/30 text-[var(--color-canvas)] hover:bg-[var(--color-canvas)]/10'
          : 'border-[var(--color-line)] text-[var(--color-ink)] hover:bg-[var(--color-surface)]'
      }`}
    >
      <span aria-hidden className="text-lg leading-none">{fileIcon(type)}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium truncate">{name ?? 'file'}</span>
        {size !== undefined && (
          <span className={`block text-[10px] font-mono ${isMine ? 'text-[var(--color-canvas)]/70' : 'text-[var(--color-ink-faint)]'}`}>
            {formatBytes(size)}
          </span>
        )}
      </span>
    </a>
  )
}

function fileIcon(type?: string): string {
  if (!type) return '📎'
  if (type === 'application/pdf') return '📄'
  if (type.includes('spreadsheet') || type.includes('excel') || type === 'text/csv') return '📊'
  if (type.includes('presentation') || type.includes('powerpoint')) return '📽'
  if (type.includes('word') || type === 'text/plain') return '📝'
  return '📎'
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(iso: string, lang: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString(lang === 'en' ? 'en-US' : 'id-ID', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}
