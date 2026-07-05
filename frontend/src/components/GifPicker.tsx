import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

// Public beta key Giphy documents in their examples. Swap for your own
// via VITE_GIPHY_API_KEY when going to prod (this one is rate-limited).
const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY || 'dc6zaTOxFJmzC'

type Gif = {
  id: string
  title: string
  url: string
  width: number
  height: number
}

/**
 * Compact GIF search dropdown. Opens over the chat composer, fetches Giphy
 * trending by default and searches on debounced input. Selection returns the
 * GIF's URL + name via `onPick` so the parent can pipe it into send() as an
 * attachment (no re-upload — Giphy URLs are public CDN).
 */
export function GifPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (gif: { url: string; title: string; size: number }) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [gifs, setGifs] = useState<Gif[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const endpoint = query.trim()
          ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=20&rating=g`
          : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20&rating=g`
        const res = await fetch(endpoint)
        if (!res.ok) throw new Error(`Giphy HTTP ${res.status}`)
        const json = (await res.json()) as { data: Array<{ id: string; title: string; images: { fixed_height: { url: string; width: string; height: string } } }> }
        if (cancelled) return
        setGifs(
          json.data.map((g) => ({
            id: g.id,
            title: g.title,
            url: g.images.fixed_height.url,
            width: parseInt(g.images.fixed_height.width, 10) || 200,
            height: parseInt(g.images.fixed_height.height, 10) || 200,
          })),
        )
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : t('gif.loadError'))
        setGifs([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, query, t])

  if (!open) return null

  return (
    <div className="border-t border-[var(--color-line)] shrink-0 bg-[var(--color-surface)]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-line)]">
        <span aria-hidden className="text-base">🎞</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('gif.searchPlaceholder')}
          className="flex-1 h-8 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] px-2 text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-flame)]"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] text-sm leading-none px-1"
        >
          ×
        </button>
      </div>
      <div className="p-2 max-h-48 overflow-y-auto">
        {loading && (
          <p className="text-[10px] font-mono text-[var(--color-ink-faint)] text-center py-4">
            {t('gif.loading')}
          </p>
        )}
        {error && (
          <p className="text-[10px] text-[var(--color-bad)] text-center py-2">{error}</p>
        )}
        {!loading && !error && gifs.length === 0 && (
          <p className="text-[10px] font-mono text-[var(--color-ink-faint)] text-center py-4">
            {t('gif.empty')}
          </p>
        )}
        <div className="grid grid-cols-3 gap-1">
          {gifs.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onPick({ url: g.url, title: g.title, size: 0 })}
              className="rounded overflow-hidden aspect-video bg-[var(--color-surface-2)] hover:ring-2 hover:ring-[var(--color-flame)]"
            >
              <img
                src={g.url}
                alt={g.title}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
        <p className="mt-2 text-[9px] font-mono text-[var(--color-ink-faint)] text-center">
          {t('gif.poweredBy')}
        </p>
      </div>
    </div>
  )
}
