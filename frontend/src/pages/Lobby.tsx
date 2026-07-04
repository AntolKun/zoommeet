import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'

export function Lobby() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [value, setValue] = useState('')

  function go(e: React.FormEvent) {
    e.preventDefault()
    const slug = normalizeSlug(value)
    if (slug) navigate(`/room/${slug}`)
  }

  return (
    <div className="mx-auto max-w-md px-5 py-16 w-full">
      <p className="font-mono text-xs text-[var(--color-flame)] mb-3">{t('lobby.tag')}</p>
      <h2 className="text-2xl font-semibold tracking-tight mb-1">{t('lobby.title')}</h2>
      <p className="text-sm text-[var(--color-ink-muted)] mb-8">{t('lobby.subtitle')}</p>

      <form onSubmit={go} className="space-y-4">
        <Field label={t('lobby.fieldLabel')} hint={t('lobby.fieldHint')}>
          {(p) => (
            <Input
              autoFocus
              placeholder={t('lobby.placeholder')}
              className="font-mono"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              {...p}
            />
          )}
        </Field>
        <Button type="submit" className="w-full" disabled={!normalizeSlug(value)}>
          {t('lobby.joinButton')}
        </Button>
      </form>
    </div>
  )
}

/** Accepts a raw slug or a full /room/<slug> URL and returns the slug. */
function normalizeSlug(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  const match = trimmed.match(/\/room\/([^/?#]+)/)
  return (match ? match[1] : trimmed).trim()
}
