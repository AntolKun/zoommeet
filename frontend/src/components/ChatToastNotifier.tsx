import { useEffect, useRef, useState } from 'react'
import { useChat, useLocalParticipant } from '@livekit/components-react'

const VISIBLE_MS = 5000
const MAX_VISIBLE = 4

type Toast = {
  id: string
  from: string
  body: string
}

/**
 * Listens to LiveKit chat messages within the current room and shows a
 * fade-in/out toast in the bottom-right corner for each new incoming
 * message. Skips self-sent messages and ignores existing history on mount.
 *
 * Must be rendered inside <LiveKitRoom>.
 */
export function ChatToastNotifier() {
  const { chatMessages } = useChat()
  const { localParticipant } = useLocalParticipant()
  const localIdentity = localParticipant?.identity

  const seenIds = useRef<Set<string>>(new Set())
  const initialized = useRef(false)
  const [toasts, setToasts] = useState<Toast[]>([])

  // Treat anything already in the buffer at mount as "old" — don't toast it.
  if (!initialized.current) {
    initialized.current = true
    for (const m of chatMessages) seenIds.current.add(messageKey(m))
  }

  useEffect(() => {
    const fresh: Toast[] = []
    for (const m of chatMessages) {
      const key = messageKey(m)
      if (seenIds.current.has(key)) continue
      seenIds.current.add(key)
      if (m.from?.identity === localIdentity) continue
      fresh.push({
        id: key,
        from: m.from?.name?.trim() || m.from?.identity || 'Tamu',
        body: m.message,
      })
    }
    if (fresh.length === 0) return

    setToasts((prev) => [...prev, ...fresh].slice(-MAX_VISIBLE))

    for (const t of fresh) {
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id))
      }, VISIBLE_MS)
    }
  }, [chatMessages, localIdentity])

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

function messageKey(m: { id?: string; timestamp?: number; message: string }) {
  if (m.id) return m.id
  return `${m.timestamp ?? 0}-${m.message}`
}
