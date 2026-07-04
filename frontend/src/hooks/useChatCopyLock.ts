import { useCallback, useEffect, useState } from 'react'
import { useLocalParticipant, useRoomContext } from '@livekit/components-react'
import { RoomEvent } from 'livekit-client'
import { HOST_TOPIC, decodeHostAction, encodeHostAction } from '@/lib/hostBroadcast'

/**
 * Cooperative "host locked the chat from being copied" flag. Stored locally
 * in each client and synced via the LK data channel `vc.host` topic.
 *
 * Not security-proof — a determined user can disable CSS or override the
 * event handler in DevTools — but it's an honest UX signal for confidential
 * meetings, similar to Zoom's "Disable chat save".
 *
 * Multiple components can call this hook; each maintains its own subscription
 * to the same broadcast so their state stays in sync without needing a
 * context wrapper.
 */
export function useChatCopyLock() {
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const [locked, setLocalLocked] = useState(false)

  useEffect(() => {
    if (!room) return
    const onData = (
      payload: Uint8Array,
      _participant: unknown,
      _kind: unknown,
      topic?: string,
    ) => {
      if (topic !== HOST_TOPIC) return
      const msg = decodeHostAction(payload)
      if (msg?.action === 'set_chat_copy_locked') {
        setLocalLocked(msg.locked)
      }
    }
    room.on(RoomEvent.DataReceived, onData)
    return () => {
      room.off(RoomEvent.DataReceived, onData)
    }
  }, [room])

  const broadcast = useCallback(
    async (newLocked: boolean) => {
      setLocalLocked(newLocked)
      if (!localParticipant) return
      await localParticipant
        .publishData(
          encodeHostAction({ action: 'set_chat_copy_locked', locked: newLocked }),
          { reliable: true, topic: HOST_TOPIC },
        )
        .catch(() => {})
    },
    [localParticipant],
  )

  return { locked, setLocked: broadcast }
}
