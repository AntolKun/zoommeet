import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useLocalParticipant, useRoomContext } from '@livekit/components-react'
import { RoomEvent } from 'livekit-client'
import {
  decodeAnnotate,
  encodeAnnotate,
  newStrokeUid,
  type StrokePayload,
} from '@/lib/annotationProtocol'

// Reuse the annotation payload shape, but transport on a separate topic so
// whiteboard strokes don't get mixed up with in-room annotation strokes.
const WHITEBOARD_TOPIC = 'vc.whiteboard'

type Ctx = {
  strokes: StrokePayload[]
  color: string
  setColor: (c: string) => void
  thickness: number
  setThickness: (n: number) => void
  addStroke: (points: Array<[number, number]>) => void
  clearAll: () => void
  clearMine: () => void
}

const C = createContext<Ctx | null>(null)

export function useWhiteboard() {
  const v = useContext(C)
  if (!v) throw new Error('useWhiteboard must be used inside <WhiteboardProvider>')
  return v
}

const COLOR_KEY = 'videoconf.whiteboardColor'
const THICK_KEY = 'videoconf.whiteboardThickness'
const DEFAULT_COLOR = '#0c0a09'
const DEFAULT_THICKNESS = 3

/**
 * Whiteboard provider — same drawing primitives as annotations but lives in
 * its own panel and uses a separate data-channel topic. Strokes persist for
 * the meeting (in-memory only, like annotations) and aren't sent to backend.
 */
export function WhiteboardProvider({ children }: { children: React.ReactNode }) {
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()

  const [strokes, setStrokes] = useState<StrokePayload[]>([])
  const [color, setColorState] = useState<string>(
    () => localStorage.getItem(COLOR_KEY) || DEFAULT_COLOR,
  )
  const [thickness, setThicknessState] = useState<number>(() => {
    const v = parseInt(localStorage.getItem(THICK_KEY) || '', 10)
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_THICKNESS
  })

  const setColor = useCallback((c: string) => {
    setColorState(c)
    localStorage.setItem(COLOR_KEY, c)
  }, [])
  const setThickness = useCallback((n: number) => {
    setThicknessState(n)
    localStorage.setItem(THICK_KEY, String(n))
  }, [])

  useEffect(() => {
    if (!room) return
    const onData = (
      payload: Uint8Array,
      _participant: unknown,
      _kind: unknown,
      topic?: string,
    ) => {
      if (topic !== WHITEBOARD_TOPIC) return
      const msg = decodeAnnotate(payload)
      if (!msg) return
      if (msg.kind === 'clear') {
        if (msg.byIdentity) {
          setStrokes((prev) => prev.filter((s) => s.identity !== msg.byIdentity))
        } else {
          setStrokes([])
        }
        return
      }
      setStrokes((prev) => {
        if (prev.some((s) => s.uid === msg.uid)) return prev
        return [...prev, msg]
      })
    }
    room.on(RoomEvent.DataReceived, onData)
    return () => {
      room.off(RoomEvent.DataReceived, onData)
    }
  }, [room])

  const addStroke = useCallback(
    (points: Array<[number, number]>) => {
      if (!localParticipant || points.length < 2) return
      const payload: StrokePayload = {
        kind: 'stroke',
        uid: newStrokeUid(),
        identity: localParticipant.identity,
        color,
        thickness,
        points,
      }
      setStrokes((prev) => [...prev, payload])
      localParticipant
        .publishData(encodeAnnotate(payload), {
          reliable: true,
          topic: WHITEBOARD_TOPIC,
        })
        .catch(() => {})
    },
    [localParticipant, color, thickness],
  )

  const clearAll = useCallback(() => {
    setStrokes([])
    if (!localParticipant) return
    localParticipant
      .publishData(encodeAnnotate({ kind: 'clear' }), {
        reliable: true,
        topic: WHITEBOARD_TOPIC,
      })
      .catch(() => {})
  }, [localParticipant])

  const clearMine = useCallback(() => {
    if (!localParticipant) return
    const me = localParticipant.identity
    setStrokes((prev) => prev.filter((s) => s.identity !== me))
    localParticipant
      .publishData(encodeAnnotate({ kind: 'clear', byIdentity: me }), {
        reliable: true,
        topic: WHITEBOARD_TOPIC,
      })
      .catch(() => {})
  }, [localParticipant])

  const value = useMemo<Ctx>(
    () => ({ strokes, color, setColor, thickness, setThickness, addStroke, clearAll, clearMine }),
    [strokes, color, setColor, thickness, setThickness, addStroke, clearAll, clearMine],
  )

  return <C.Provider value={value}>{children}</C.Provider>
}
