import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'

export function Lobby() {
  const navigate = useNavigate()
  const [value, setValue] = useState('')

  function go(e: React.FormEvent) {
    e.preventDefault()
    const slug = normalizeSlug(value)
    if (slug) navigate(`/room/${slug}`)
  }

  return (
    <div className="mx-auto max-w-md px-5 py-16 w-full">
      <p className="font-mono text-xs text-[var(--color-flame)] mb-3">// gabung cepat</p>
      <h2 className="text-2xl font-semibold tracking-tight mb-1">Gabung ke meeting</h2>
      <p className="text-sm text-[var(--color-ink-muted)] mb-8">
        Tempel link atau ketik kode room-nya.
      </p>

      <form onSubmit={go} className="space-y-4">
        <Field label="Link atau kode room" hint="Contoh: standup-jumat, atau link lengkap /room/standup-jumat">
          {(p) => (
            <Input
              autoFocus
              placeholder="standup-jumat"
              className="font-mono"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              {...p}
            />
          )}
        </Field>
        <Button type="submit" className="w-full" disabled={!normalizeSlug(value)}>
          Gabung →
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
