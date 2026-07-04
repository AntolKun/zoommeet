import { useEffect } from 'react'

/**
 * Browser-native "Are you sure you want to leave?" prompt while the user is
 * actively in a meeting. Browsers control the dialog text (we just signal
 * `preventDefault` + `returnValue`); they ignore custom strings since 2017.
 *
 * Pass `active=false` once the user has explicitly clicked Leave so we don't
 * double-prompt their actual exit.
 */
export function useLeaveConfirm(active: boolean) {
  useEffect(() => {
    if (!active) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Older browsers required setting returnValue. Modern browsers ignore.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [active])
}
