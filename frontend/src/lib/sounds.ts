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

// ==== Soundboard ====
// Broadcast-friendly synth effects — no assets, generated in-browser. Each
// entry is a short (< 1s) sequence so users don't hijack the room with a
// long track. Every client that receives the broadcast plays the same one.

export type SfxName = 'applause' | 'drumroll' | 'airhorn' | 'ding' | 'rimshot' | 'sad' | 'yay' | 'boo'

export const SFX_LIST: SfxName[] = ['applause', 'drumroll', 'airhorn', 'ding', 'rimshot', 'sad', 'yay', 'boo']

const SFX_LABEL: Record<SfxName, string> = {
  applause: '👏 Applause',
  drumroll: '🥁 Drumroll',
  airhorn: '📣 Airhorn',
  ding: '🔔 Ding',
  rimshot: '🥁 Ba-dum tss',
  sad: '😢 Sad',
  yay: '🎉 Yay',
  boo: '👎 Boo',
}

export function sfxLabel(name: SfxName): string {
  return SFX_LABEL[name]
}

/** Play a soundboard effect locally. Always plays if master sounds are on
 *  (ignores per-sound toggles — soundboard is its own event class). */
export function playSfx(name: SfxName) {
  if (!soundsEnabled()) return
  const ac = ctx()
  if (!ac) return
  if (ac.state === 'suspended') ac.resume().catch(() => {})
  switch (name) {
    case 'applause':
      // Fast rising noise bursts imitating a clap chain.
      for (let i = 0; i < 6; i++) {
        const start = ac.currentTime + i * 0.06
        playNoise(ac, start, 0.05, 0.08)
      }
      break
    case 'drumroll':
      // ~15 rapid low pulses.
      for (let i = 0; i < 20; i++) {
        const start = ac.currentTime + i * 0.04
        playPulse(ac, start, 120, 0.03, 0.06, 'square')
      }
      break
    case 'airhorn':
      // Sawtooth sweep 400 → 800 Hz, twice.
      for (let i = 0; i < 2; i++) {
        const start = ac.currentTime + i * 0.28
        playSweep(ac, start, 400, 800, 0.22, 0.12, 'sawtooth')
      }
      break
    case 'ding':
      // Sharp bell (E6 + G6 harmonic).
      playPulse(ac, ac.currentTime, 1318.51, 0.4, 0.08, 'sine')
      playPulse(ac, ac.currentTime, 1567.98, 0.35, 0.05, 'sine')
      break
    case 'rimshot':
      // Ba-dum ... tss.
      playPulse(ac, ac.currentTime, 220, 0.08, 0.09, 'square')
      playPulse(ac, ac.currentTime + 0.13, 180, 0.1, 0.08, 'square')
      playNoise(ac, ac.currentTime + 0.28, 0.16, 0.06)
      break
    case 'sad':
      // Wah-wah descending. Trombone-y.
      playSweep(ac, ac.currentTime, 440, 220, 0.4, 0.1, 'sawtooth')
      break
    case 'yay':
      // C-E-G-C major arpeggio, fast.
      playPulse(ac, ac.currentTime, 523.25, 0.12, 0.07)
      playPulse(ac, ac.currentTime + 0.09, 659.25, 0.12, 0.07)
      playPulse(ac, ac.currentTime + 0.18, 783.99, 0.12, 0.07)
      playPulse(ac, ac.currentTime + 0.27, 1046.5, 0.2, 0.08)
      break
    case 'boo':
      // Low descending sawtooth.
      playSweep(ac, ac.currentTime, 200, 80, 0.5, 0.1, 'sawtooth')
      break
  }
}

function playPulse(ac: AudioContext, start: number, freq: number, durationSec: number, volume: number, type: OscillatorType = 'sine') {
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec)
  osc.connect(gain)
  gain.connect(ac.destination)
  osc.start(start)
  osc.stop(start + durationSec + 0.05)
}

function playSweep(ac: AudioContext, start: number, fromHz: number, toHz: number, durationSec: number, volume: number, type: OscillatorType = 'sine') {
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(fromHz, start)
  osc.frequency.exponentialRampToValueAtTime(toHz, start + durationSec)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec)
  osc.connect(gain)
  gain.connect(ac.destination)
  osc.start(start)
  osc.stop(start + durationSec + 0.05)
}

function playNoise(ac: AudioContext, start: number, durationSec: number, volume: number) {
  const bufferSize = Math.floor(ac.sampleRate * durationSec)
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1
  const src = ac.createBufferSource()
  src.buffer = buffer
  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec)
  src.connect(gain)
  gain.connect(ac.destination)
  src.start(start)
  src.stop(start + durationSec + 0.05)
}
