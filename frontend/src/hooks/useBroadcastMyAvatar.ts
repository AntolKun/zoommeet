import { useEffect } from 'react'
import { useLocalParticipant } from '@livekit/components-react'
import { useMe } from '@/hooks/useMe'

const AVATAR_ATTR = 'avatar'

/**
 * Publishes the current user's avatar URL onto their LiveKit participant
 * attributes so other participants can read it via `participant.attributes`.
 *
 * Mirrors the timezone broadcast pattern. Only auth users have an avatar —
 * guests skip this (no useMe data).
 */
export function useBroadcastMyAvatar() {
  const { localParticipant } = useLocalParticipant()
  const { data: me } = useMe()

  useEffect(() => {
    if (!localParticipant) return
    const url = me?.avatar_url ?? ''
    // Only push when changed to avoid hammering setAttributes.
    if (localParticipant.attributes?.[AVATAR_ATTR] === url) return
    localParticipant.setAttributes({ [AVATAR_ATTR]: url }).catch(() => {})
  }, [localParticipant, me?.avatar_url])
}

export const AVATAR_ATTR_KEY = AVATAR_ATTR
