/**
 * Tiny pub-sub over window CustomEvents for UI actions that need to cross
 * component boundaries (keyboard shortcut → panel toggle, etc.) without
 * threading a global context.
 *
 * Action names are namespaced under `vc.ui:` so dispatchers/listeners don't
 * collide with other window events.
 */

export type UiAction =
  | 'toggle-chat'
  | 'toggle-participants'
  | 'toggle-hand'
  | 'open-cheatsheet'
  | 'toggle-cheatsheet'
  | 'toggle-mic'
  | 'toggle-cam'
  | 'leave-room'

const EVENT = 'vc.ui'

export function dispatchUiAction(action: UiAction) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { action } }))
}

export function onUiAction(action: UiAction, handler: () => void): () => void {
  const listener = (e: Event) => {
    const ce = e as CustomEvent<{ action: UiAction }>
    if (ce.detail?.action === action) handler()
  }
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}
