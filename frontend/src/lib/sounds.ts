/**
 * Tiny synthesized sounds using Web Audio API. No asset files needed —
 * the tones are generated in-browser so the bundle stays light.
 *
 * Two layers of preference:
 *   - master toggle (videoconf.soundsOn) — kill switch from the toolbar
 *   - per-sound toggle (videoconf.sound.join, .leave, .chat, .reaction)
 *
 * Both default ON, and a sound only fires if BOTH master and its per-sound
 * key allow it.
 */

const SOUND_PREF_KEY = 'videoconf.soundsOn'

export type SoundName = 'join' | 'leave' | 'chat' | 'reaction'
const PER_SOUND_KEY: Record<SoundName, string> = {
  join: 'videoconf.sound.join',
  leave: 'videoconf.sound.leave',
  chat: 'videoconf.sound.chat',
  reaction: 'videoconf.sound.reaction',
}

export function soundsEnabled(): boolean {
  return localStorage.getItem(SOUND_PREF_KEY) !== '0'
}

export function setSoundsEnabled(on: boolean) {
  localStorage.setItem(SOUND_PREF_KEY, on ? '1' : '0')
}

export function soundEnabled(name: SoundName): boolean {
  return localStorage.getItem(PER_SOUND_KEY[name]) !== '0'
}

export function setSoundEnabled(name: SoundName, on: boolean) {
  localStorage.setItem(PER_SOUND_KEY[name], on ? '1' : '0')
}

function shouldPlay(name: SoundName): boolean {
  return soundsEnabled() && soundEnabled(name)
}

let cachedCtx: AudioContext | null = null
function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (cachedCtx) return cachedCtx
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    cachedCtx = new Ctor()
    return cachedCtx
  } catch {
    return null
  }
}

type Tone = { freq: number; durationMs: number; delay?: number; type?: OscillatorType; volume?: number }

function playSequence(name: SoundName, tones: Tone[]) {
  if (!shouldPlay(name)) return
  const ac = ctx()
  if (!ac) return
  if (ac.state === 'suspended') ac.resume().catch(() => {})

  for (const t of tones) {
    const start = ac.currentTime + (t.delay ?? 0) / 1000
    const dur = t.durationMs / 1000
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = t.type ?? 'sine'
    osc.frequency.setValueAtTime(t.freq, start)
    const vol = t.volume ?? 0.08
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(vol, start + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
    osc.connect(gain)
    gain.connect(ac.destination)
    osc.start(start)
    osc.stop(start + dur + 0.05)
  }
}

/** Rising two-note chime (C5 → E5). */
export function playJoin() {
  playSequence('join', [
    { freq: 523.25, durationMs: 110 },
    { freq: 659.25, durationMs: 160, delay: 90 },
  ])
}

/** Falling two-note chime (E5 → C5). */
export function playLeave() {
  playSequence('leave', [
    { freq: 659.25, durationMs: 110 },
    { freq: 523.25, durationMs: 160, delay: 90 },
  ])
}

/** Short single blip (G5). */
export function playChat() {
  playSequence('chat', [{ freq: 783.99, durationMs: 90, volume: 0.06 }])
}

/** Soft pop for emoji reactions (A4). */
export function playReaction() {
  playSequence('reaction', [{ freq: 440, durationMs: 70, volume: 0.05, type: 'triangle' }])
}
