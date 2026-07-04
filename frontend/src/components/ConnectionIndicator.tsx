import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useConnectionState,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
} from '@livekit/components-react'
import { ConnectionQuality, ConnectionState, ParticipantEvent } from 'livekit-client'

type QualityInfo = { labelKey: string; color: string; dot: string }

const QUALITY_MAP: Record<ConnectionQuality, QualityInfo> = {
  [ConnectionQuality.Excellent]: {
    labelKey: 'connection.qualityExcellent',
    color: 'var(--color-ok)',
    dot: 'var(--color-ok)',
  },
  [ConnectionQuality.Good]: {
    labelKey: 'connection.qualityGood',
    color: 'var(--color-ink-soft)',
    dot: 'var(--color-flame)',
  },
  [ConnectionQuality.Poor]: {
    labelKey: 'connection.qualityPoor',
    color: 'var(--color-bad)',
    dot: 'var(--color-bad)',
  },
  [ConnectionQuality.Lost]: {
    labelKey: 'connection.qualityLost',
    color: 'var(--color-bad)',
    dot: 'var(--color-bad)',
  },
  [ConnectionQuality.Unknown]: {
    labelKey: 'connection.qualityUnknown',
    color: 'var(--color-ink-faint)',
    dot: 'var(--color-ink-faint)',
  },
}

/**
 * Small badge in the top-right cluster showing connection quality of the
 * local participant. Click to expand a stats card with details (state,
 * room, peers, RTT if surfaced).
 */
export function ConnectionIndicator() {
  const { t } = useTranslation()
  const state = useConnectionState()
  const { localParticipant } = useLocalParticipant()
  const participants = useParticipants()
  const room = useRoomContext()

  // Re-render when LK fires a quality update.
  const [quality, setQuality] = useState<ConnectionQuality>(
    localParticipant?.connectionQuality ?? ConnectionQuality.Unknown,
  )
  useEffect(() => {
    if (!localParticipant) return
    const sync = (q: ConnectionQuality) => setQuality(q)
    setQuality(localParticipant.connectionQuality)
    localParticipant.on(ParticipantEvent.ConnectionQualityChanged, sync)
    return () => {
      localParticipant.off(ParticipantEvent.ConnectionQualityChanged, sync)
    }
  }, [localParticipant])

  const [open, setOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const info = QUALITY_MAP[quality]
  const qualityLabel = t(info.labelKey)
  const stateLabel = stateToLabel(state, t)

  return (
    <div ref={popoverRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`${t('connection.popupTitle')}: ${qualityLabel}`}
        aria-label={`${t('connection.popupTitle')}: ${qualityLabel}`}
        className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md bg-[var(--color-surface)] border border-[var(--color-line-strong)] text-xs font-mono"
      >
        <SignalBars quality={quality} />
        <span style={{ color: info.color }}>{qualityLabel}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface)] shadow-2xl p-4">
          <h3 className="text-sm font-semibold text-[var(--color-ink)] mb-3">{t('connection.popupTitle')}</h3>
          <dl className="space-y-2 text-xs">
            <StatRow label={t('connection.labelQuality')} valueColor={info.color} value={qualityLabel} />
            <StatRow label={t('connection.labelStatus')} value={stateLabel} />
            <StatRow label={t('connection.labelParticipants')} value={String(participants.length)} />
            <StatRow label={t('connection.labelRoom')} value={room?.name ?? '—'} valueClass="font-mono truncate max-w-[160px]" />
            <StatRow label={t('connection.labelIdentity')} value={localParticipant?.identity ?? '—'} valueClass="font-mono truncate max-w-[160px]" />
          </dl>
          <p className="text-[10px] text-[var(--color-ink-faint)] mt-3 font-mono uppercase tracking-wider">
            {t('connection.popupFooter')}
          </p>
        </div>
      )}
    </div>
  )
}

function StatRow({
  label,
  value,
  valueColor,
  valueClass,
}: {
  label: string
  value: string
  valueColor?: string
  valueClass?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[var(--color-ink-muted)] font-mono uppercase tracking-wider text-[10px]">
        {label}
      </dt>
      <dd
        className={`text-[var(--color-ink)] ${valueClass ?? ''}`}
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </dd>
    </div>
  )
}

function SignalBars({ quality }: { quality: ConnectionQuality }) {
  const lit =
    quality === ConnectionQuality.Excellent
      ? 3
      : quality === ConnectionQuality.Good
      ? 2
      : quality === ConnectionQuality.Poor
      ? 1
      : quality === ConnectionQuality.Lost
      ? 0
      : 0
  const color = QUALITY_MAP[quality].dot
  return (
    <span className="inline-flex items-end gap-[2px] h-3.5">
      {[0, 1, 2].map((i) => {
        const isLit = i < lit
        return (
          <span
            key={i}
            className="w-[3px] rounded-sm transition-colors"
            style={{
              height: `${5 + i * 3}px`,
              background: isLit ? color : 'var(--color-line-strong)',
            }}
          />
        )
      })}
    </span>
  )
}

function stateToLabel(s: ConnectionState, t: (k: string) => string): string {
  switch (s) {
    case ConnectionState.Connected:
      return t('connection.stateConnected')
    case ConnectionState.Connecting:
      return t('connection.stateConnecting')
    case ConnectionState.Reconnecting:
      return t('connection.stateReconnecting')
    case ConnectionState.Disconnected:
      return t('connection.stateDisconnected')
    default:
      return String(s)
  }
}
