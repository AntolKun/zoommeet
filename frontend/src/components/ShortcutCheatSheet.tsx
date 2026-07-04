import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { onUiAction } from '@/lib/uiActions'

/**
 * Modal listing all keyboard shortcuts. Triggered by `?` or `H` key. Listens
 * for `toggle-cheatsheet` action so the shortcut hook can drive it without
 * lifting state.
 */
export function ShortcutCheatSheet() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    return onUiAction('toggle-cheatsheet', () => setOpen((v) => !v))
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  const bindings: Array<{ keys: string[]; action: string }> = [
    { keys: ['M'], action: t('shortcuts.actionMic') },
    { keys: ['V'], action: t('shortcuts.actionCam') },
    { keys: ['L'], action: t('shortcuts.actionHand') },
    { keys: ['C'], action: t('shortcuts.actionChat') },
    { keys: ['P'], action: t('shortcuts.actionParticipants') },
    { keys: ['Q'], action: t('shortcuts.actionQuit') },
    { keys: ['Space'], action: t('shortcuts.actionPtt') },
    { keys: ['?', 'H'], action: t('shortcuts.actionHelp') },
    { keys: ['Esc'], action: t('shortcuts.actionEsc') },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('shortcuts.title')}
        className="relative w-full max-w-md rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface)] shadow-2xl p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">
            {t('shortcuts.title')}
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] font-mono uppercase tracking-wider"
          >
            {t('common.close')}
          </button>
        </div>

        <dl className="space-y-2">
          {bindings.map((b) => (
            <div
              key={b.action}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <dt className="text-[var(--color-ink)]">{b.action}</dt>
              <dd className="flex items-center gap-1">
                {b.keys.map((k, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && (
                      <span className="text-[10px] text-[var(--color-ink-faint)] font-mono">
                        {t('shortcuts.or')}
                      </span>
                    )}
                    <kbd className="inline-flex items-center justify-center min-w-[28px] px-1.5 h-7 rounded border border-[var(--color-line-strong)] bg-[var(--color-surface-2)] text-[11px] font-mono text-[var(--color-ink)] shadow-[0_2px_0_var(--color-line-strong)]">
                      {k}
                    </kbd>
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-5 text-[10px] text-[var(--color-ink-faint)] font-mono uppercase tracking-wider">
          {t('shortcuts.footer')}
        </p>
      </div>
    </div>
  )
}
