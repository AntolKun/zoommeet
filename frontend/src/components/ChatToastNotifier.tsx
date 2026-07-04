import { useEffect, useRef, useState } from 'react'
import { useRoomChat } from '@/hooks/useRoomChat'
import { playChat } from '@/lib/sounds'

const VISIBLE_MS = 5000
const MAX_VISIBLE = 4

type Toast = {
  id: string
  from: string
  body: string
}

/**
 * Bottom-right transient notifications for new incoming chat. Reads from
 * RoomChatProvider so it shares state with ChatPanel (no double subscription).
 *
 * Skips messages already present at mount (history is "old"), self-sent
 * messages, and anything from the initial backend history fetch.
 */
export function ChatToastNotifier() {
  const { messages } = useRoomChat()

  const seenUids = useRef<Set<string>>(new Set())
  const initialized = useRef(false)
  const [toasts, setToasts] = useState<Toast[]>([])

  // Treat whatever is already in the buffer at mount as "old" — don't toast it.
  if (!initialized.current) {
    initialized.current = true
    for (const m of messages) seenUids.current.add(m.uid)
  }

  useEffect(() => {
    const fresh: Toast[] = []
    for (const m of messages) {
      if (seenUids.current.has(m.uid)) continue
      seenUids.current.add(m.uid)
      if (m.isMine) continue
      fresh.push({ id: m.uid, from: m.sender_name, body: m.body })
    }
    if (fresh.length === 0) return

    setToasts((prev) => [...prev, ...fresh].slice(-MAX_VISIBLE))
    playChat()

    for (const t of fresh) {
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id))
      }, VISIBLE_MS)
    }
  }, [messages])

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-[calc(100vw-2rem)] sm:max-w-xs"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  )
}

function ToastItem({ toast }: { toast: Toast }) {
  return (
    <div
      className="chat-toast pointer-events-auto rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface)]/95 shadow-2xl px-4 py-3 backdrop-blur-sm"
      role="status"
    >
      <p className="text-[11px] font-mono uppercase tracking-wider text-[var(--color-flame)]">
        {toast.from}
      </p>
      <p className="text-sm text-[var(--color-ink)] mt-0.5 break-words line-clamp-4">
        {toast.body}
      </p>
    </div>
  )
}
