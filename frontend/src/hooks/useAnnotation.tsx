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
  ANNOTATE_TOPIC,
  decodeAnnotate,
  encodeAnnotate,
  newStrokeUid,
  type StrokePayload,
} from '@/lib/annotationProtocol'

type Ctx = {
  /** All strokes currently rendered, keyed by uid for dedup. */
  strokes: StrokePayload[]
  /** Local user's chosen color. Persisted to localStorage. */
  color: string
  setColor: (c: string) => void
  /** Local user's chosen line thickness. Persisted to localStorage. */
  thickness: number
  setThickness: (n: number) => void
  /** Send a completed stroke (broadcast + local commit). */
  addStroke: (points: Array<[number, number]>) => void
  /** Broadcast a clear-all event (host action). */
  clearAll: () => void
  /** Clear only my own strokes. */
  clearMine: () => void
}

const C = createContext<Ctx | null>(null)

export function useAnnotation() {
  const v = useContext(C)
  if (!v) throw new Error('useAnnotation must be used inside <AnnotationProvider>')
  return v
}

const COLOR_KEY = 'videoconf.annotateColor'
const THICK_KEY = 'videoconf.annotateThickness'
const DEFAULT_COLOR = '#ef4444'
const DEFAULT_THICKNESS = 3

export function AnnotationProvider({ children }: { children: React.ReactNode }) {
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

  // Listen for remote strokes + clear events.
  useEffect(() => {
    if (!room) return
    const onData = (
      payload: Uint8Array,
      _participant: unknown,
      _kind: unknown,
      topic?: string,
    ) => {
      if (topic !== ANNOTATE_TOPIC) return
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
      // Stroke — append if not seen.
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
      // Optimistic local render.
      setStrokes((prev) => [...prev, payload])
      // Broadcast.
      localParticipant
        .publishData(encodeAnnotate(payload), { reliable: true, topic: ANNOTATE_TOPIC })
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
        topic: ANNOTATE_TOPIC,
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
        topic: ANNOTATE_TOPIC,
      })
      .catch(() => {})
  }, [localParticipant])

  const value = useMemo<Ctx>(
    () => ({ strokes, color, setColor, thickness, setThickness, addStroke, clearAll, clearMine }),
    [strokes, color, setColor, thickness, setThickness, addStroke, clearAll, clearMine],
  )

  return <C.Provider value={value}>{children}</C.Provider>
}
