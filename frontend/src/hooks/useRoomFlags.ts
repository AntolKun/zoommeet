import { useCallback, useEffect, useState } from 'react'
import { useLocalParticipant, useRoomContext } from '@livekit/components-react'
import { RoomEvent } from 'livekit-client'
import { HOST_TOPIC, decodeHostAction, encodeHostAction } from '@/lib/hostBroadcast'

/**
 * Cooperative room flags broadcast over the LiveKit data channel. Each hook
 * here mirrors `useChatCopyLock`'s pattern — every consumer maintains its own
 * subscription and they all converge to the latest broadcast value.
 *
 * Not security-proof: a determined user can edit DevTools to bypass. Use only
 * as a UX signal for cooperative meetings.
 */

function useFlagBroadcast<TAction extends string, TKey extends string>(
  matchAction: TAction,
  flagKey: TKey,
): { value: boolean; set: (next: boolean) => Promise<void> } {
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const [value, setValue] = useState(false)

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
      if (!msg || msg.action !== matchAction) return
      const v = (msg as unknown as Record<string, unknown>)[flagKey]
      if (typeof v === 'boolean') setValue(v)
    }
    room.on(RoomEvent.DataReceived, onData)
    return () => {
      room.off(RoomEvent.DataReceived, onData)
    }
  }, [room, matchAction, flagKey])

  const set = useCallback(
    async (next: boolean) => {
      setValue(next)
      if (!localParticipant) return
      const payload = { action: matchAction, [flagKey]: next } as unknown as Parameters<
        typeof encodeHostAction
      >[0]
      await localParticipant
        .publishData(encodeHostAction(payload), { reliable: true, topic: HOST_TOPIC })
        .catch(() => {})
    },
    [localParticipant, matchAction, flagKey],
  )

  return { value, set }
}

/** Chat input disabled for non-hosts when value=true. */
export function useChatDisabled() {
  const { value, set } = useFlagBroadcast('set_chat_disabled', 'disabled')
  return { disabled: value, setDisabled: set }
}

/**
 * Non-hosts can't unmute their mic when value=true. Enforced cooperatively by
 * `MicLockEnforcer`, which listens to TrackUnmuted and auto-remutes.
 */
export function useUnmuteRestricted() {
  const { value, set } = useFlagBroadcast('set_unmute_restricted', 'restricted')
  return { restricted: value, setRestricted: set }
}

/**
 * Watermark on shared screens. When enabled, an overlay with the local
 * viewer's name + timestamp is drawn over the room while someone shares.
 */
export function useWatermark() {
  const { value, set } = useFlagBroadcast('set_watermark', 'enabled')
  return { enabled: value, setEnabled: set }
}

/**
 * Annotation mode. When enabled by the host, every client gets a full-screen
 * canvas that captures pen strokes and broadcasts them to peers. Drawing is
 * a free-for-all once turned on.
 */
export function useAnnotationEnabled() {
  const { value, set } = useFlagBroadcast('set_annotation_enabled', 'enabled')
  return { enabled: value, setEnabled: set }
}
