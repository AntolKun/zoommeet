import { useEffect } from 'react'
import { useLocalParticipant } from '@livekit/components-react'

const TZ_ATTR = 'tz'

function detectTz(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

/**
 * Sets the local participant's `tz` attribute to the browser-reported IANA
 * timezone (e.g. "Asia/Jakarta"). Other participants can read it via their
 * own ParticipantsPanel to show "user is in WIB" / "user is in WIT".
 *
 * Idempotent — only re-sets when the participant's currently published value
 * differs (e.g. after a reconnect that dropped the attribute).
 */
export function useBroadcastMyTimezone() {
  const { localParticipant } = useLocalParticipant()

  useEffect(() => {
    if (!localParticipant) return
    const tz = detectTz()
    if (!tz) return
    if (localParticipant.attributes?.[TZ_ATTR] === tz) return
    localParticipant.setAttributes({ [TZ_ATTR]: tz }).catch(() => {})
  }, [localParticipant])
}

export const TIMEZONE_ATTR = TZ_ATTR
