/**
 * Helpers for the room scheduling feature.
 * - All conversions assume the server stores UTC ISO timestamps.
 * - Display formatting uses the user's local time zone (Indonesia locale).
 */

const PRESET_DURATIONS_MIN = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480]

export function durationPresets(): number[] {
  return PRESET_DURATIONS_MIN
}

/**
 * Returns a string suitable for <input type="datetime-local"> defaulting to
 * one hour from now, rounded up to the next 15-minute mark.
 */
export function defaultScheduledLocalValue(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() + 60)
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15)
  d.setSeconds(0, 0)
  return toDateTimeLocal(d)
}

/** Format a Date as YYYY-MM-DDTHH:mm in local time for datetime-local inputs. */
export function toDateTimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** datetime-local string (browser local TZ) → UTC ISO for backend. */
export function localValueToUTCISO(local: string): string {
  return new Date(local).toISOString()
}

const formatAbsolute = new Intl.DateTimeFormat('id-ID', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

const formatAbsoluteWithYear = new Intl.DateTimeFormat('id-ID', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** "Sen, 3 Jun 14.30" — year omitted for the current year. */
export function formatScheduledAbsolute(iso: string): string {
  const d = new Date(iso)
  const fmt = d.getFullYear() === new Date().getFullYear() ? formatAbsolute : formatAbsoluteWithYear
  return fmt.format(d)
}

export type ScheduleStatus = 'upcoming' | 'live' | 'past'

export type ScheduleRelative = {
  status: ScheduleStatus
  label: string
}

/**
 * Returns human-readable Indonesian relative time + status.
 * Examples:
 *   { status: 'upcoming', label: '2 jam lagi' }
 *   { status: 'live',     label: 'sedang berlangsung · 30 mnt tersisa' }
 *   { status: 'past',     label: 'selesai 1 hari lalu' }
 */
export function scheduleRelative(scheduledIso: string, durationMin: number): ScheduleRelative {
  const now = Date.now()
  const start = new Date(scheduledIso).getTime()
  const end = start + durationMin * 60_000
  const sec = (ms: number) => Math.round(ms / 1000)

  if (now < start) {
    const diffSec = sec(start - now)
    return { status: 'upcoming', label: `${humanDelta(diffSec)} lagi` }
  }
  if (now < end) {
    const remainingSec = sec(end - now)
    return {
      status: 'live',
      label: `sedang berlangsung · ${humanDelta(remainingSec)} tersisa`,
    }
  }
  const pastSec = sec(now - end)
  return { status: 'past', label: `selesai ${humanDelta(pastSec)} lalu` }
}

export type Recurrence = 'daily' | 'weekly'

const DAY_NAMES_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

const formatTimeShort = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Returns the next occurrence start time for a recurring schedule. Always
 * advances past `now` so the dashboard shows future-tense relative time even
 * after the "original" scheduled_at has passed.
 *
 * - daily: same time today (if still upcoming) or tomorrow
 * - weekly: same weekday + time this week (if upcoming) or next week
 */
export function nextOccurrence(scheduledIso: string, recurrence: Recurrence): Date {
  const base = new Date(scheduledIso)
  const now = new Date()
  const candidate = new Date(base)
  // Anchor candidate to today (or current weekday) keeping the original hour/min/sec.
  if (recurrence === 'daily') {
    candidate.setFullYear(now.getFullYear(), now.getMonth(), now.getDate())
    if (candidate.getTime() <= now.getTime()) {
      candidate.setDate(candidate.getDate() + 1)
    }
  } else {
    const baseDow = base.getDay()
    const nowDow = now.getDay()
    let delta = baseDow - nowDow
    if (delta < 0) delta += 7
    candidate.setFullYear(now.getFullYear(), now.getMonth(), now.getDate() + delta)
    if (candidate.getTime() <= now.getTime()) {
      candidate.setDate(candidate.getDate() + 7)
    }
  }
  return candidate
}

/**
 * Human label for the recurrence pattern. Examples:
 *   - daily:  "Setiap hari · 14.00"
 *   - weekly: "Setiap Senin · 14.00"
 */
export function recurrenceLabel(scheduledIso: string, recurrence: Recurrence): string {
  const base = new Date(scheduledIso)
  const time = formatTimeShort.format(base)
  if (recurrence === 'daily') return `Setiap hari · ${time}`
  return `Setiap ${DAY_NAMES_ID[base.getDay()]} · ${time}`
}

function humanDelta(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, seconds)} dtk`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} mnt`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} jam`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} hari`
  const weeks = Math.round(days / 7)
  return `${weeks} minggu`
}
