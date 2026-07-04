import { useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'videoconf.devicePrefs'

export type DevicePrefs = {
  cameraId?: string
  micId?: string
  speakerId?: string
}

export function loadDevicePrefs(): DevicePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as DevicePrefs) : {}
  } catch {
    return {}
  }
}

function saveDevicePrefs(prefs: DevicePrefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}

type DeviceList = {
  cameras: MediaDeviceInfo[]
  mics: MediaDeviceInfo[]
  speakers: MediaDeviceInfo[]
}

const EMPTY_DEVICES: DeviceList = { cameras: [], mics: [], speakers: [] }

/**
 * Manages a pre-join MediaStream for the camera preview + mic level meter.
 *
 * Responsibilities:
 *   1. getUserMedia with selected camera/mic (or default) whenever toggles flip
 *   2. enumerateDevices once permission is granted so labels show
 *   3. Web Audio AnalyserNode → continuous mic level (0..1)
 *   4. Persists chosen device IDs to localStorage so next visit picks them up
 *
 * Note: speakerId is stored but not applied — LiveKit's RoomAudioRenderer
 * doesn't expose sinkId. Saved for future settings panel.
 */
export function usePrejoinMedia({
  camEnabled,
  micEnabled,
}: {
  camEnabled: boolean
  micEnabled: boolean
}) {
  const [prefs, setPrefs] = useState<DevicePrefs>(() => loadDevicePrefs())
  const [devices, setDevices] = useState<DeviceList>(EMPTY_DEVICES)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [micLevel, setMicLevel] = useState(0)

  // Track the latest stream so the cleanup effect always tears down the
  // correct one even if the component re-renders quickly.
  const streamRef = useRef<MediaStream | null>(null)
  streamRef.current = stream

  // 1. Acquire / re-acquire the stream on toggle or device-pref change.
  useEffect(() => {
    let canceled = false

    // Tear down any previous stream before requesting a new one — this
    // releases the camera so the next getUserMedia can pick a different
    // device without a "device in use" error.
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      setStream(null)
    }

    if (!camEnabled && !micEnabled) {
      setError(null)
      return
    }

    const constraints: MediaStreamConstraints = {
      video: camEnabled
        ? prefs.cameraId
          ? { deviceId: { ideal: prefs.cameraId } }
          : true
        : false,
      audio: micEnabled
        ? prefs.micId
          ? { deviceId: { ideal: prefs.micId } }
          : true
        : false,
    }

    navigator.mediaDevices
      .getUserMedia(constraints)
      .then((s) => {
        if (canceled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        setStream(s)
        setError(null)
      })
      .catch((e: Error) => {
        if (canceled) return
        if (e.name === 'NotAllowedError' || e.name === 'SecurityError') {
          setError('Akses kamera/mikrofon ditolak. Cek izin browser.')
        } else if (e.name === 'NotFoundError') {
          setError('Kamera/mikrofon nggak ketemu.')
        } else {
          setError(e.message || 'Gagal akses media')
        }
      })

    return () => {
      canceled = true
    }
  }, [camEnabled, micEnabled, prefs.cameraId, prefs.micId])

  // Stop tracks on unmount.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  // 2. List devices once we have permission (labels are blank otherwise).
  useEffect(() => {
    if (!stream) return
    navigator.mediaDevices
      .enumerateDevices()
      .then((all) => {
        setDevices({
          cameras: all.filter((d) => d.kind === 'videoinput' && d.deviceId),
          mics: all.filter((d) => d.kind === 'audioinput' && d.deviceId),
          speakers: all.filter((d) => d.kind === 'audiooutput' && d.deviceId),
        })
      })
      .catch(() => {
        // enumerateDevices can fail silently in some browsers — just skip.
      })
  }, [stream])

  // 3. Mic level via AnalyserNode. Tied to stream + micEnabled so it tears
  // down when the user mutes pre-join.
  useEffect(() => {
    if (!stream || !micEnabled) {
      setMicLevel(0)
      return
    }
    const audioTrack = stream.getAudioTracks()[0]
    if (!audioTrack) return

    type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext }
    const AudioCtx =
      window.AudioContext ?? (window as WebkitWindow).webkitAudioContext
    if (!AudioCtx) return

    const ctx = new AudioCtx()
    const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]))
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.6
    source.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)

    let raf = 0
    const tick = () => {
      analyser.getByteFrequencyData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) sum += data[i]
      // Normalize to 0..1 and amplify a bit so soft talking shows up.
      const avg = Math.min(1, (sum / data.length / 255) * 1.6)
      setMicLevel(avg)
      raf = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      source.disconnect()
      ctx.close().catch(() => {})
    }
  }, [stream, micEnabled])

  function updatePref(field: keyof DevicePrefs, value: string) {
    setPrefs((p) => {
      const next = { ...p, [field]: value || undefined }
      saveDevicePrefs(next)
      return next
    })
  }

  return {
    devices,
    stream,
    micLevel,
    error,
    prefs,
    setCameraId: (id: string) => updatePref('cameraId', id),
    setMicId: (id: string) => updatePref('micId', id),
    setSpeakerId: (id: string) => updatePref('speakerId', id),
  }
}
