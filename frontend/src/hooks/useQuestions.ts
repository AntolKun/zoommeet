import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type QuestionStatus = 'open' | 'answered' | 'dismissed'

export type Question = {
  id: number
  room_id: number
  user_id?: number
  asker_name: string
  text: string
  status: QuestionStatus
  answered_by?: number
  answer_text?: string
  answered_at?: string
  created_at: string
  upvotes: number
  my_upvote: boolean
}

const POLL_INTERVAL_MS = 3_000

/**
 * Lists questions for a room. Polls every 3 seconds for near-realtime upvote
 * counts + new questions across clients.
 */
export function useQuestions(slug: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['questions', slug],
    queryFn: () =>
      api<{ questions: Question[] }>(`/rooms/${slug}/questions`).then(
        (r) => r.questions,
      ),
    enabled: !!slug && enabled,
    refetchInterval: enabled ? POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  })
}

export function useCreateQuestion(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { text: string; askerName: string }) =>
      api<Question>(`/rooms/${slug}/questions`, {
        method: 'POST',
        body: { text: input.text, asker_name: input.askerName },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['questions', slug] }),
  })
}

export function useUpvoteQuestion(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, on }: { id: number; on: boolean }) =>
      api<Question>(`/questions/${id}/upvote`, { method: on ? 'POST' : 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['questions', slug] }),
  })
}

export function useAnswerQuestion(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, answer }: { id: number; answer: string }) =>
      api<Question>(`/rooms/${slug}/questions/${id}/answer`, {
        method: 'POST',
        body: { answer },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['questions', slug] }),
  })
}

export function useDismissQuestion(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      api<void>(`/rooms/${slug}/questions/${id}/dismiss`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['questions', slug] }),
  })
}
