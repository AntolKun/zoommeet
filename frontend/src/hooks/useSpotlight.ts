import { useCallback, useEffect, useState } from 'react'
import { useLocalParticipant, useRoomContext } from '@livekit/components-react'
import { RoomEvent } from 'livekit-client'
import { HOST_TOPIC, decodeHostAction, encodeHostAction } from '@/lib/hostBroadcast'

export type SpotlightState = {
  identity: string | null
  name: string | null
}

const EMPTY: SpotlightState = { identity: null, name: null }

/**
 * Host can spotlight a participant — every other client receives the
 * broadcast and visually highlights that participant in the room. Pin one,
 * pin same identity again = clear, pin null = clear.
 *
 * Cooperative: not enforced server-side, so a participant who reloads
 * mid-meeting won't see the active spotlight until the host re-pins. The
 * host's UI shows the active spotlight so they can repin if needed.
 */
export function useSpotlight() {
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const [state, setState] = useState<SpotlightState>(EMPTY)

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
      if (!msg || msg.action !== 'set_spotlight') return
      setState({ identity: msg.target_identity, name: msg.target_name })
    }
    room.on(RoomEvent.DataReceived, onData)
    return () => {
      room.off(RoomEvent.DataReceived, onData)
    }
  }, [room])

  const setSpotlight = useCallback(
    async (identity: string | null, name: string | null) => {
      setState({ identity, name })
      if (!localParticipant) return
      await localParticipant
        .publishData(
          encodeHostAction({
            action: 'set_spotlight',
            target_identity: identity,
            target_name: name,
          }),
          { reliable: true, topic: HOST_TOPIC },
        )
        .catch(() => {})
    },
    [localParticipant],
  )

  return { spotlight: state, setSpotlight }
}
