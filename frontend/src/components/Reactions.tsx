import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDataChannel } from '@livekit/components-react'
import { playReaction } from '@/lib/sounds'

const REACTION_TOPIC = 'vc.reaction'
const REACTIONS = ['👍', '❤️', '😂', '👏', '🎉', '😮', '🔥', '💯'] as const

type FloatingEmoji = {
  id: string
  emoji: string
  /** Horizontal offset 0–100 (% of viewport width). */
  x: number
}

const FLOAT_DURATION_MS = 2800

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function randomX(): number {
  // Spread within middle 80% of viewport to avoid edges.
  return 10 + Math.random() * 80
}

function newId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Single component that renders a reactions launcher button and the floating
 * emoji overlay. Click launcher → pick emoji → emoji floats up locally AND
 * broadcasts to other participants via LiveKit data channel.
 */
export function Reactions() {
  const { t } = useTranslation()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [floaters, setFloaters] = useState<FloatingEmoji[]>([])

  const spawn = useCallback((emoji: string) => {
    const f: FloatingEmoji = { id: newId(), emoji, x: randomX() }
    setFloaters((prev) => [...prev, f])
    playReaction()
    window.setTimeout(() => {
      setFloaters((prev) => prev.filter((x) => x.id !== f.id))
    }, FLOAT_DURATION_MS)
  }, [])

  const { send } = useDataChannel(REACTION_TOPIC, (msg) => {
    try {
      const payload = JSON.parse(decoder.decode(msg.payload)) as { emoji?: string }
      if (payload.emoji && REACTIONS.includes(payload.emoji as (typeof REACTIONS)[number])) {
        spawn(payload.emoji)
      }
    } catch {
      // Ignore malformed messages.
    }
  })

  // Keep a ref for send so callbacks don't capture stale closures.
  const sendRef = useRef(send)
  useEffect(() => {
    sendRef.current = send
  }, [send])

  function broadcast(emoji: string) {
    spawn(emoji)
    try {
      sendRef.current?.(
        encoder.encode(JSON.stringify({ emoji })),
        { reliable: false, topic: REACTION_TOPIC },
      )
    } catch {
      // ignore
    }
    setPickerOpen(false)
  }

  return (
    <>
      <ReactionsFloater floaters={floaters} />

      <div className="relative">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-expanded={pickerOpen}
          className="inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-xs font-medium bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)] transition-colors"
        >
          <span className="text-base leading-none">😀</span>
          {t('controls.reactions')}
        </button>

        {pickerOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setPickerOpen(false)}
              aria-hidden
            />
            <div
              role="menu"
              className="absolute top-full left-0 mt-2 z-50 grid grid-cols-4 gap-1 p-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-line-strong)] shadow-2xl"
            >
              {REACTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => broadcast(e)}
                  className="w-10 h-10 rounded-md hover:bg-[var(--color-surface-2)] transition-colors text-xl flex items-center justify-center"
                  aria-label={t('controls.sendReaction', { emoji: e })}
                >
                  {e}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}

function ReactionsFloater({ floaters }: { floaters: FloatingEmoji[] }) {
  if (floaters.length === 0) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-30" aria-hidden>
      {floaters.map((f) => (
        <span
          key={f.id}
          className="reaction-float absolute bottom-24 text-5xl select-none"
          style={{ left: `${f.x}%` }}
        >
          {f.emoji}
        </span>
      ))}
    </div>
  )
}
