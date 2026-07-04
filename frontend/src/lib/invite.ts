/**
 * Helpers for sharing a room: build .ics (iCalendar) files and mailto links.
 * All operate purely on the client — no backend involvement, no SMTP.
 */

export type InviteInfo = {
  name: string
  joinUrl: string
  scheduledAt?: string // RFC3339 UTC; absent for instant rooms
  durationMinutes?: number
  password?: string // surfaces in invite text/body if set
}

/** Format a JS Date as iCalendar UTC: 20260601T140000Z */
function toIcsDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  )
}

/** RFC 5545 line folding: lines >75 octets get folded with CRLF + space. */
function fold(line: string): string {
  if (line.length <= 75) return line
  const chunks: string[] = []
  for (let i = 0; i < line.length; i += 73) {
    chunks.push(line.slice(i, i + 73))
  }
  return chunks.join('\r\n ')
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

/**
 * Returns iCalendar (.ics) content for a scheduled room. If the room is not
 * scheduled, defaults to a 1-hour event starting now.
 */
export function buildIcs(info: InviteInfo): string {
  const start = info.scheduledAt ? new Date(info.scheduledAt) : new Date()
  const durationMin = info.durationMinutes ?? 60
  const end = new Date(start.getTime() + durationMin * 60_000)

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//videoconf.app//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeIcs(info.joinUrl)}-${start.getTime()}@videoconf.app`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${escapeIcs(info.name)}`,
    `DESCRIPTION:${escapeIcs(buildInviteBody(info))}`,
    `URL:${escapeIcs(info.joinUrl)}`,
    `LOCATION:${escapeIcs(info.joinUrl)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n')
}

export function downloadIcs(info: InviteInfo) {
  const ics = buildIcs(info)
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safe = info.name.replace(/[^a-z0-9-]+/gi, '-').toLowerCase() || 'meeting'
  a.href = url
  a.download = `${safe}.ics`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Build the body text for both .ics description and mailto body. */
export function buildInviteBody(info: InviteInfo): string {
  const lines: string[] = ['Halo!', '', `Kamu diundang ke meeting "${info.name}".`]
  if (info.scheduledAt && info.durationMinutes) {
    const fmt = new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'full',
      timeStyle: 'short',
    })
    lines.push('')
    lines.push(`Waktu: ${fmt.format(new Date(info.scheduledAt))} (${info.durationMinutes} menit)`)
  }
  lines.push('')
  lines.push(`Link gabung: ${info.joinUrl}`)
  if (info.password) {
    lines.push(`Password: ${info.password}`)
  }
  lines.push('')
  lines.push('Klik link-nya, isi nama, gabung. Gak perlu install apa-apa.')
  return lines.join('\n')
}

/** Opens the user's default email client with a pre-filled invitation. */
export function openMailtoInvite(info: InviteInfo) {
  const subject = `Undangan: ${info.name}`
  const body = buildInviteBody(info)
  const url = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  window.location.href = url
}
