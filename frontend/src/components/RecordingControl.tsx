import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useIsRecording } from '@livekit/components-react'
import { ApiError, api } from '@/lib/api'

type RecordingLayout = 'grid' | 'speaker' | 'single-speaker'
const LAYOUT_KEY = 'videoconf.recordingLayout'

const LAYOUT_OPTIONS: Array<{ value: RecordingLayout; labelKey: string; hintKey: string }> = [
  { value: 'grid', labelKey: 'recording.layoutGrid', hintKey: 'recording.layoutGridHint' },
  { value: 'speaker', labelKey: 'recording.layoutSpeaker', hintKey: 'recording.layoutSpeakerHint' },
  { value: 'single-speaker', labelKey: 'recording.layoutSolo', hintKey: 'recording.layoutSoloHint' },
]

type RecordingRow = {
  id: number
  status: string
}

type RecordingsResponse = { recordings: RecordingRow[] }

const ACTIVE_STATUSES = new Set(['starting', 'active', 'ending'])

/**
 * Owner-only control to start/stop server-side recording. Tracks the active
 * recording id locally; if room.isRecording is true but we don't know the id
 * (e.g. after a page reload), we look it up via the recordings list.
 */
export function RecordingControl({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const isRecording = useIsRecording()
  const [activeId, setActiveId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [layout, setLayout] = useState<RecordingLayout>(() => {
    const v = localStorage.getItem(LAYOUT_KEY) as RecordingLayout | null
    return v && LAYOUT_OPTIONS.some((o) => o.value === v) ? v : 'grid'
  })

  useEffect(() => {
    localStorage.setItem(LAYOUT_KEY, layout)
  }, [layout])

  // Reconcile activeId with server when isRecording flips on/off.
  useEffect(() => {
    if (!isRecording) {
      setActiveId(null)
      return
    }
    if (activeId !== null) return
    let cancelled = false
    api<RecordingsResponse>(`/rooms/${slug}/recordings`)
      .then((res) => {
        if (cancelled) return
        const live = res.recordings.find((r) => ACTIVE_STATUSES.has(r.status))
        if (live) setActiveId(live.id)
      })
      .catch(() => {
        // Silent — owner can still try stop via Start button toggle later.
      })
    return () => {
      cancelled = true
    }
  }, [isRecording, activeId, slug])

  async function start() {
    setBusy(true)
    setError(null)
    try {
      const rec = await api<{ id: number }>(`/rooms/${slug}/recordings`, {
        method: 'POST',
        body: { layout },
      })
      setActiveId(rec.id)
    } catch (e) {
      if (e instanceof ApiError) {
        // Most common failure on LiveKit Cloud: storage not configured (502 from Egress).
        setError(e.status === 502 ? t('recording.errEgress') : e.message)
      } else {
        setError(t('recording.errStart'))
      }
    } finally {
      setBusy(false)
    }
  }

  async function stop() {
    if (!activeId) return
    setBusy(true)
    setError(null)
    try {
      await api(`/recordings/${activeId}/stop`, { method: 'POST' })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('recording.errStop'))
    } finally {
      setBusy(false)
    }
  }

  const recordingNow = isRecording && activeId !== null
  const recordingWaitingId = isRecording && activeId === null

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="inline-flex items-stretch rounded-md border border-[var(--color-line-strong)] overflow-hidden">
        <button
          type="button"
          onClick={recordingNow ? stop : start}
          disabled={busy || recordingWaitingId}
          className={`inline-flex items-center gap-1.5 px-3 h-8 text-xs font-medium transition-colors ${
            recordingNow
              ? 'bg-[var(--color-bad)] text-white hover:opacity-90'
              : 'bg-[var(--color-surface)] text-[var(--color-ink)] hover:bg-[var(--color-surface-2)]'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {recordingNow ? (
            <>
              <span className="w-2 h-2 rounded-sm bg-white" />
              {t('recording.btnStop')}
            </>
          ) : recordingWaitingId ? (
            <>{t('recording.btnWaiting')}</>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-[var(--color-bad)]" />
              {t('recording.btnRecord')}
            </>
          )}
        </button>
        {!recordingNow && !recordingWaitingId && (
          <select
            value={layout}
            onChange={(e) => setLayout(e.target.value as RecordingLayout)}
            title={t(LAYOUT_OPTIONS.find((o) => o.value === layout)?.hintKey ?? '')}
            disabled={busy}
            className="border-l border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] text-[11px] px-1.5 outline-none hover:bg-[var(--color-surface-2)] focus:border-[var(--color-flame)] disabled:opacity-50"
          >
            {LAYOUT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.labelKey)}
              </option>
            ))}
          </select>
        )}
      </div>
      {error && (
        <span className="text-[10px] text-[var(--color-bad)] max-w-[240px] text-right">
          {error}
        </span>
      )}
    </div>
  )
}
