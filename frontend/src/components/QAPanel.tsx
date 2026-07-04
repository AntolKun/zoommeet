import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalParticipant } from '@livekit/components-react'
import {
  useAnswerQuestion,
  useCreateQuestion,
  useDismissQuestion,
  useQuestions,
  useUpvoteQuestion,
  type Question,
} from '@/hooks/useQuestions'

type Props = {
  open: boolean
  onClose: () => void
  slug: string
  isHost: boolean
}

const MAX_TEXT = 1000

/**
 * Right-edge slide-in Q&A panel. Anyone can ask + upvote. Host can answer
 * (with text) or dismiss. Questions sorted open-first by upvotes, then newest.
 */
export function QAPanel({ open, onClose, slug, isHost }: Props) {
  const { t } = useTranslation()
  const { data, isLoading, error } = useQuestions(slug, open)
  const questions = data ?? []
  const create = useCreateQuestion(slug)
  const { localParticipant } = useLocalParticipant()
  const [text, setText] = useState('')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    const askerName =
      localParticipant?.name?.trim() ||
      localParticipant?.identity ||
      t('profile.me')
    try {
      await create.mutateAsync({ text: trimmed, askerName })
      setText('')
    } catch {
      // mutation error visible inline below
    }
  }

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
        aria-label={t('qa.title')}
        className={`fixed top-0 right-0 z-50 h-svh w-[min(420px,92vw)] bg-[var(--color-surface)] border-l border-[var(--color-line-strong)] shadow-2xl transition-transform flex flex-col ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex items-center justify-between px-5 h-14 border-b border-[var(--color-line)] shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">{t('qa.title')}</h2>
            <span className="font-mono text-xs text-[var(--color-ink-muted)]">
              {questions.filter((q) => q.status === 'open').length}
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
          {isLoading && !data && (
            <p className="text-xs text-[var(--color-ink-faint)] font-mono">{t('qa.loading')}</p>
          )}

          {error && (
            <p className="text-xs text-[var(--color-bad)] font-mono">{t('qa.loadError')}</p>
          )}

          {!isLoading && questions.length === 0 && (
            <p className="text-xs text-[var(--color-ink-faint)] text-center mt-8">
              {t('qa.empty')}
            </p>
          )}

          {questions.map((q) => (
            <QuestionCard key={q.id} question={q} slug={slug} isHost={isHost} />
          ))}
        </div>

        <form
          onSubmit={submit}
          className="border-t border-[var(--color-line)] p-3 space-y-2 shrink-0"
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('qa.askPlaceholder')}
            rows={2}
            maxLength={MAX_TEXT}
            className="w-full rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-flame)] resize-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-[var(--color-ink-faint)]">
              {text.length}/{MAX_TEXT}
            </span>
            <button
              type="submit"
              disabled={create.isPending || !text.trim()}
              className="h-8 px-3 rounded-md bg-[var(--color-flame)] text-[var(--color-canvas)] text-xs font-medium hover:bg-[var(--color-flame-soft)] disabled:opacity-50"
            >
              {create.isPending ? t('qa.submitting') : t('qa.submitAsk')}
            </button>
          </div>
          {create.error && (
            <p className="text-[10px] text-[var(--color-bad)] font-mono">{t('qa.errAsk')}</p>
          )}
        </form>
      </aside>
    </>
  )
}

function QuestionCard({ question, slug, isHost }: { question: Question; slug: string; isHost: boolean }) {
  const { t } = useTranslation()
  const upvote = useUpvoteQuestion(slug)
  const answer = useAnswerQuestion(slug)
  const dismiss = useDismissQuestion(slug)
  const [answering, setAnswering] = useState(false)
  const [answerText, setAnswerText] = useState('')

  function toggleVote() {
    if (upvote.isPending) return
    upvote.mutate({ id: question.id, on: !question.my_upvote })
  }

  async function submitAnswer(e: React.FormEvent) {
    e.preventDefault()
    if (!answerText.trim()) return
    try {
      await answer.mutateAsync({ id: question.id, answer: answerText.trim() })
      setAnswering(false)
      setAnswerText('')
    } catch {
      // error inline
    }
  }

  const isOpen = question.status === 'open'
  const isAnswered = question.status === 'answered'
  const isDismissed = question.status === 'dismissed'

  return (
    <article
      className={`rounded-md border p-3 ${
        isOpen
          ? 'border-[var(--color-line-strong)] bg-[var(--color-surface-2)]'
          : isAnswered
          ? 'border-[var(--color-ok)] bg-[color-mix(in_oklab,var(--color-ok)_8%,transparent)]'
          : 'border-[var(--color-line)] bg-[var(--color-surface)] opacity-60'
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={toggleVote}
          disabled={upvote.isPending || isDismissed}
          aria-pressed={question.my_upvote}
          title={question.my_upvote ? t('qa.upvoteOff') : t('qa.upvoteOn')}
          className={`shrink-0 flex flex-col items-center justify-center w-10 h-12 rounded-md border transition-colors ${
            question.my_upvote
              ? 'border-[var(--color-flame)] bg-[color-mix(in_oklab,var(--color-flame)_18%,transparent)] text-[var(--color-flame-soft)]'
              : 'border-[var(--color-line)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:border-[var(--color-line-strong)]'
          } disabled:opacity-50`}
        >
          <span aria-hidden className="text-sm leading-none">▲</span>
          <span className="font-mono text-xs leading-tight">{question.upvotes}</span>
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--color-ink)] break-words">{question.text}</p>
          <p className="mt-1 text-[10px] text-[var(--color-ink-muted)] font-mono">
            {question.asker_name}
            {isAnswered && ` · ${t('qa.statusAnswered')}`}
            {isDismissed && ` · ${t('qa.statusDismissed')}`}
          </p>

          {isAnswered && question.answer_text && (
            <div className="mt-2 pl-3 border-l-2 border-[var(--color-ok)]">
              <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-ok)] mb-0.5">
                {t('qa.hostAnswerTag')}
              </p>
              <p className="text-xs text-[var(--color-ink)] break-words">{question.answer_text}</p>
            </div>
          )}

          {isHost && isOpen && !answering && (
            <div className="flex items-center gap-1.5 mt-2">
              <button
                type="button"
                onClick={() => setAnswering(true)}
                className="h-7 px-2 text-[11px] rounded border border-[var(--color-line)] text-[var(--color-ok)] hover:border-[var(--color-ok)] hover:bg-[color-mix(in_oklab,var(--color-ok)_10%,transparent)]"
              >
                {t('qa.answer')}
              </button>
              <button
                type="button"
                onClick={() => dismiss.mutate(question.id)}
                disabled={dismiss.isPending}
                className="h-7 px-2 text-[11px] rounded border border-[var(--color-line)] text-[var(--color-ink-muted)] hover:border-[var(--color-bad)] hover:text-[var(--color-bad)] disabled:opacity-50"
              >
                {t('qa.dismiss')}
              </button>
            </div>
          )}

          {answering && (
            <form onSubmit={submitAnswer} className="mt-2 space-y-1.5">
              <textarea
                autoFocus
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder={t('qa.answerPlaceholder')}
                rows={2}
                maxLength={2000}
                className="w-full rounded-md bg-[var(--color-surface)] border border-[var(--color-line)] px-2 py-1.5 text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-flame)] resize-none"
              />
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setAnswering(false)
                    setAnswerText('')
                  }}
                  className="text-[10px] font-mono text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                >
                  {t('common.cancel').toLowerCase()}
                </button>
                <button
                  type="submit"
                  disabled={answer.isPending || !answerText.trim()}
                  className="h-7 px-2 text-[11px] rounded bg-[var(--color-ok)] text-white hover:opacity-90 disabled:opacity-50"
                >
                  {answer.isPending ? t('qa.submitting') : t('qa.submitAnswer')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </article>
  )
}
