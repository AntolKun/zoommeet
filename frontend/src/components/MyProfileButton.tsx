import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalParticipant } from '@livekit/components-react'
import { PRESENCE_VALUES, presenceColor, usePresence } from '@/hooks/usePresence'

const GUEST_NAME_KEY = 'videoconf.guestName'

/**
 * Lets the user rename themselves mid-meeting. Updates LiveKit's
 * `participant.name` (everyone else gets the new name automatically) and
 * persists the choice to localStorage so guests don't have to retype it on
 * their next visit.
 */
export function MyProfileButton() {
  const { t } = useTranslation()
  const { localParticipant } = useLocalParticipant()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(
    () => localParticipant?.name?.trim() || localParticipant?.identity || '',
  )
  const [saving, setSaving] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep the input in sync if LiveKit's name flips elsewhere (e.g., reconnect).
  useEffect(() => {
    if (open) return
    setName(localParticipant?.name?.trim() || localParticipant?.identity || '')
  }, [localParticipant?.name, localParticipant?.identity, open])

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
    requestAnimationFrame(() => inputRef.current?.focus())
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!localParticipant) return
    const trimmed = name.trim()
    if (trimmed.length === 0 || trimmed.length > 50) return
    setSaving(true)
    try {
      await localParticipant.setName(trimmed)
      // Persist for guests so the next visit pre-fills the input.
      localStorage.setItem(GUEST_NAME_KEY, trimmed)
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const displayed = localParticipant?.name?.trim() || localParticipant?.identity || t('profile.me')
  const { presence, setPresence } = usePresence()

  return (
    <div ref={popoverRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={t('profile.renameTitle')}
        className="inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-xs font-medium bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)] transition-colors max-w-[200px]"
      >
        <span className="relative inline-flex items-center">
          <UserIcon />
          <span
            aria-hidden
            className="absolute -bottom-1 -right-1 w-2 h-2 rounded-full border border-[var(--color-surface)]"
            style={{ background: presenceColor(presence) }}
          />
        </span>
        <span className="truncate">{displayed}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface)] shadow-2xl p-3">
          {/* Presence selector */}
          <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--color-ink-faint)] mb-1.5">
            {t('presence.label')}
          </label>
          <div className="grid grid-cols-2 gap-1 mb-3">
            {PRESENCE_VALUES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPresence(p)}
                aria-pressed={presence === p}
                className={`flex items-center gap-1.5 h-8 px-2 rounded text-xs transition-colors ${
                  presence === p
                    ? 'bg-[var(--color-surface-2)] border border-[var(--color-line-strong)] text-[var(--color-ink)]'
                    : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)] border border-transparent'
                }`}
              >
                <span
                  aria-hidden
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: presenceColor(p) }}
                />
                <span className="truncate">{t(`presence.${p}`)}</span>
              </button>
            ))}
          </div>

          <form onSubmit={save} noValidate>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--color-ink-faint)] mb-1.5">
              {t('profile.renameLabel')}
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              placeholder={t('profile.renamePlaceholder')}
              className="w-full h-9 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] px-3 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-flame)]"
            />
            <div className="flex items-center justify-end gap-2 mt-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-8 px-3 text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={saving || !name.trim() || name.trim() === displayed}
                className="h-8 px-3 rounded-md bg-[var(--color-flame)] text-[var(--color-canvas)] text-xs font-medium hover:bg-[var(--color-flame-soft)] disabled:opacity-50"
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}


function UserIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}
