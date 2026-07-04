import { useEffect } from 'react'
import { useRoomContext } from '@livekit/components-react'
import { RoomEvent } from 'livekit-client'
import { playJoin, playLeave } from '@/lib/sounds'

/**
 * Subscribes to LiveKit participant join/leave events and plays a short
 * synthesized chime for each. Rendered as an invisible child inside
 * <LiveKitRoom>.
 *
 * NOTE: We only fire AFTER the local participant is connected, so we don't
 * blast a "join" sound for every existing participant when WE join the room.
 */
export function RoomEventSounds() {
  const room = useRoomContext()

  useEffect(() => {
    if (!room) return

    let armed = false
    // Arm after a short delay so initial participant sync doesn't trigger sounds.
    const armTimer = window.setTimeout(() => {
      armed = true
    }, 1500)

    const onJoin = () => {
      if (armed) playJoin()
    }
    const onLeave = () => {
      if (armed) playLeave()
    }

    room.on(RoomEvent.ParticipantConnected, onJoin)
    room.on(RoomEvent.ParticipantDisconnected, onLeave)

    return () => {
      window.clearTimeout(armTimer)
      room.off(RoomEvent.ParticipantConnected, onJoin)
      room.off(RoomEvent.ParticipantDisconnected, onLeave)
    }
  }, [room])

  return null
}
