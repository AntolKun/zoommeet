import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  pollTotalVotes,
  useClosePoll,
  useCreatePoll,
  usePolls,
  useVotePoll,
  type Poll,
} from '@/hooks/usePolls'

type Props = {
  open: boolean
  onClose: () => void
  slug: string
  isHost: boolean
}

/**
 * Right-edge slide-in panel for polls. Hosts see a "Bikin poll baru" form on
 * top; everyone sees the polls list with live vote bars. Voting on a closed
 * poll is disabled. Each option's bar shows percentage + count.
 */
export function PollsPanel({ open, onClose, slug, isHost }: Props) {
  const { t } = useTranslation()
  const { data, isLoading, error } = usePolls(slug, open)
  const polls = data ?? []
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        aria-label={t('polls.title')}
        className={`fixed top-0 right-0 z-50 h-svh w-[min(420px,92vw)] bg-[var(--color-surface)] border-l border-[var(--color-line-strong)] shadow-2xl transition-transform flex flex-col ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex items-center justify-between px-5 h-14 border-b border-[var(--color-line)] shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">{t('polls.title')}</h2>
            <span className="font-mono text-xs text-[var(--color-ink-muted)]">
              {polls.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] font-mono uppercase tracking-wider"
          >
            {t('waiting.closeUpper')}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {isHost && (
            <>
              {creating ? (
                <CreatePollForm
                  slug={slug}
                  onDone={() => setCreating(false)}
                  onCancel={() => setCreating(false)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="w-full h-9 rounded-md border border-dashed border-[var(--color-line-strong)] text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:border-[var(--color-flame)]"
                >
                  {t('polls.createButton')}
                </button>
              )}
            </>
          )}

          {isLoading && !data && (
            <p className="text-xs text-[var(--color-ink-faint)] font-mono">{t('polls.loading')}</p>
          )}

          {error && (
            <p className="text-xs text-[var(--color-bad)] font-mono">{t('polls.loadError')}</p>
          )}

          {!isLoading && polls.length === 0 && (
            <p className="text-xs text-[var(--color-ink-faint)] text-center mt-8">
              {isHost ? t('polls.emptyHost') : t('polls.emptyGuest')}
            </p>
          )}

          {polls.map((p) => (
            <PollCard key={p.id} poll={p} slug={slug} isHost={isHost} />
          ))}
        </div>
      </aside>
    </>
  )
}

function CreatePollForm({
  slug,
  onDone,
  onCancel,
}: {
  slug: string
  onDone: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState<string[]>(['', ''])
  const createPoll = useCreatePoll(slug)

  function update(i: number, val: string) {
    setOptions((arr) => arr.map((v, idx) => (idx === i ? val : v)))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedOpts = options.map((o) => o.trim()).filter((o) => o.length > 0)
    if (question.trim().length === 0 || trimmedOpts.length < 2) return
    try {
      await createPoll.mutateAsync({ question: question.trim(), options: trimmedOpts })
      onDone()
    } catch {
      // mutation error surfaces below via createPoll.error
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface-2)] p-3 space-y-2"
    >
      <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-flame)]">
        {t('polls.createTag')}
      </p>
      <input
        type="text"
        placeholder={t('polls.questionPlaceholder')}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        maxLength={500}
        autoFocus
        className="w-full h-9 rounded-md bg-[var(--color-surface)] border border-[var(--color-line)] px-3 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-flame)]"
      />

      <div className="space-y-1.5">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="text-[10px] text-[var(--color-ink-faint)] font-mono w-4">
              {String.fromCharCode(65 + i)}
            </span>
            <input
              type="text"
              placeholder={t('polls.optionPlaceholder', { n: i + 1 })}
              value={opt}
              onChange={(e) => update(i, e.target.value)}
              maxLength={200}
              className="flex-1 h-8 rounded-md bg-[var(--color-surface)] border border-[var(--color-line)] px-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-flame)]"
            />
            {options.length > 2 && (
              <button
                type="button"
                onClick={() => setOptions((arr) => arr.filter((_, idx) => idx !== i))}
                className="text-[var(--color-ink-faint)] hover:text-[var(--color-bad)] text-lg leading-none px-1"
                aria-label={t('polls.removeOption', { n: i + 1 })}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {options.length < 10 && (
        <button
          type="button"
          onClick={() => setOptions((arr) => [...arr, ''])}
          className="text-[10px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] font-mono uppercase tracking-wider"
        >
          {t('polls.addOption')}
        </button>
      )}

      {createPoll.error && (
        <p className="text-[10px] text-[var(--color-bad)] font-mono">{t('polls.errCreate')}</p>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="h-8 px-3 text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={createPoll.isPending}
          className="h-8 px-3 rounded-md bg-[var(--color-flame)] text-[var(--color-canvas)] text-xs font-medium hover:bg-[var(--color-flame-soft)] disabled:opacity-50"
        >
          {createPoll.isPending ? t('polls.submitting') : t('polls.submitCreate')}
        </button>
      </div>
    </form>
  )
}

function PollCard({ poll, slug, isHost }: { poll: Poll; slug: string; isHost: boolean }) {
  const { t } = useTranslation()
  const vote = useVotePoll(slug)
  const close = useClosePoll(slug)
  const total = pollTotalVotes(poll)

  function chooseOption(optionId: number) {
    if (!poll.is_open) return
    vote.mutate({ pollId: poll.id, optionId })
  }

  return (
    <article
      className={`rounded-md border bg-[var(--color-surface-2)] p-3 ${
        poll.is_open ? 'border-[var(--color-line-strong)]' : 'border-[var(--color-line)]'
      }`}
    >
      <header className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-medium text-[var(--color-ink)] leading-tight">
          {poll.question}
        </h3>
        {!poll.is_open && (
          <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-ink-faint)] shrink-0">
            {t('polls.closed')}
          </span>
        )}
      </header>

      <ul className="space-y-1.5">
        {poll.options.map((opt) => (
          <PollOptionBar
            key={opt.id}
            label={opt.label}
            count={poll.counts[String(opt.id)] ?? 0}
            total={total}
            myChoice={poll.my_vote === opt.id}
            disabled={!poll.is_open || vote.isPending}
            onClick={() => chooseOption(opt.id)}
          />
        ))}
      </ul>

      <footer className="flex items-center justify-between mt-2.5">
        <p className="text-[10px] text-[var(--color-ink-faint)] font-mono uppercase tracking-wider">
          {t('polls.voteCount', { count: total })}
        </p>
        {isHost && poll.is_open && (
          <button
            type="button"
            onClick={() => close.mutate(poll.id)}
            disabled={close.isPending}
            className="text-[10px] text-[var(--color-ink-muted)] hover:text-[var(--color-bad)] font-mono uppercase tracking-wider disabled:opacity-50"
          >
            {t('polls.closePoll')}
          </button>
        )}
      </footer>
    </article>
  )
}

function PollOptionBar({
  label,
  count,
  total,
  myChoice,
  disabled,
  onClick,
}: {
  label: string
  count: number
  total: number
  myChoice: boolean
  disabled: boolean
  onClick: () => void
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={myChoice}
        className={`relative w-full text-left rounded border transition-colors overflow-hidden ${
          myChoice
            ? 'border-[var(--color-flame)] bg-[color-mix(in_oklab,var(--color-flame)_10%,transparent)]'
            : 'border-[var(--color-line)] hover:border-[var(--color-line-strong)]'
        } ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
      >
        <span
          className="absolute inset-y-0 left-0 bg-[color-mix(in_oklab,var(--color-flame)_20%,transparent)]"
          style={{ width: `${pct}%` }}
          aria-hidden
        />
        <span className="relative flex items-center justify-between px-2.5 py-1.5 text-sm text-[var(--color-ink)]">
          <span className="truncate flex items-center gap-1.5">
            {myChoice && <span aria-hidden className="text-[var(--color-flame)]">●</span>}
            <span className="truncate">{label}</span>
          </span>
          <span className="font-mono text-xs text-[var(--color-ink-soft)] shrink-0">
            {count} <span className="text-[var(--color-ink-faint)]">·</span> {pct}%
          </span>
        </span>
      </button>
    </li>
  )
}
