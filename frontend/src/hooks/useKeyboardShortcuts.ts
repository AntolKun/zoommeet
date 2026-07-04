import { useEffect } from 'react'
import { useLocalParticipant } from '@livekit/components-react'
import { dispatchUiAction } from '@/lib/uiActions'

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (TYPING_TAGS.has(target.tagName)) return true
  if (target.isContentEditable) return true
  return false
}

/**
 * Global keyboard shortcuts while inside a LiveKit room. Skips when focus is
 * in a text input so chat/rename inputs still work normally.
 *
 * Bindings (mirrors Zoom):
 *   M = toggle mic
 *   V = toggle camera
 *   L = toggle hand
 *   C = toggle chat panel
 *   P = toggle participants panel
 *   ? or H = open shortcut cheat sheet
 *   Q = ask to leave room
 */
export function useKeyboardShortcuts() {
  const { localParticipant } = useLocalParticipant()

  useEffect(() => {
    if (!localParticipant) return

    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if (isTypingTarget(e.target)) return

      const key = e.key.toLowerCase()
      switch (key) {
        case 'm':
          e.preventDefault()
          localParticipant
            .setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled)
            .catch(() => {})
          break
        case 'v':
          e.preventDefault()
          localParticipant
            .setCameraEnabled(!localParticipant.isCameraEnabled)
            .catch(() => {})
          break
        case 'l':
          e.preventDefault()
          dispatchUiAction('toggle-hand')
          break
        case 'c':
          e.preventDefault()
          dispatchUiAction('toggle-chat')
          break
        case 'p':
          e.preventDefault()
          dispatchUiAction('toggle-participants')
          break
        case '?':
        case 'h':
          e.preventDefault()
          dispatchUiAction('toggle-cheatsheet')
          break
        case 'q':
          e.preventDefault()
          dispatchUiAction('leave-room')
          break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [localParticipant])
}
