import { useEffect, useRef } from 'react'
import { useRoomChat, type ChatMessage } from '@/hooks/useRoomChat'

/**
 * Shows a native browser notification for incoming chat messages when the
 * tab is hidden. Requests permission lazily the first time something would
 * actually be notified — no popup the moment the user joins.
 *
 * Skips messages from self and skips anything already in the message buffer
 * at mount (history is "old").
 */
export function useChatBrowserNotifications() {
  const { messages } = useRoomChat()
  const seenUids = useRef<Set<string>>(new Set())
  const initialized = useRef(false)
  const permissionAsked = useRef(false)

  // Treat existing buffer as old.
  if (!initialized.current) {
    initialized.current = true
    for (const m of messages) seenUids.current.add(m.uid)
  }

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return

    // Identify fresh, foreign messages while the tab is hidden.
    const fresh: ChatMessage[] = []
    for (const m of messages) {
      if (seenUids.current.has(m.uid)) continue
      seenUids.current.add(m.uid)
      if (m.isMine) continue
      fresh.push(m)
    }

    if (fresh.length === 0) return
    if (document.visibilityState !== 'hidden') return

    const fire = () => {
      if (Notification.permission !== 'granted') return
      for (const m of fresh) {
        try {
          const n = new Notification(`${m.sender_name} di meeting`, {
            body: m.body.length > 140 ? `${m.body.slice(0, 140)}...` : m.body,
            tag: 'vc-chat',
            silent: false,
          })
          // Bring the user back to the meeting on click.
          n.onclick = () => {
            window.focus()
            n.close()
          }
        } catch {
          // Some browsers throw if called outside a user gesture — ignore.
        }
      }
    }

    if (Notification.permission === 'granted') {
      fire()
    } else if (Notification.permission !== 'denied' && !permissionAsked.current) {
      permissionAsked.current = true
      Notification.requestPermission()
        .then((p) => {
          if (p === 'granted') fire()
        })
        .catch(() => {})
    }
  }, [messages])
}
