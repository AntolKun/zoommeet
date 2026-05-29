import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { ApiError } from '@/lib/api'
import { useCreateRoom, type Room } from '@/hooks/useRooms'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Alert'

const schema = z.object({
  name: z.string().min(1, 'Kasih nama meeting-nya').max(150, 'Kepanjangan'),
  slug: z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$/,
      'Huruf kecil, angka, strip. 4-64 karakter.',
    )
    .or(z.literal('')),
  is_public: z.boolean(),
})

type FormData = z.infer<typeof schema>

type Props = {
  open: boolean
  onClose: () => void
  onCreated: (room: Room) => void
}

export function CreateRoomDialog({ open, onClose, onCreated }: Props) {
  const createRoom = useCreateRoom()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', slug: '', is_public: true },
  })

  const isPublic = watch('is_public')

  function close() {
    reset()
    setServerError(null)
    onClose()
  }

  async function onSubmit(values: FormData) {
    setServerError(null)
    try {
      const room = await createRoom.mutateAsync({
        name: values.name,
        slug: values.slug || undefined,
        is_public: values.is_public,
      })
      reset()
      onCreated(room)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) setServerError('Slug itu udah dipakai. Coba yang lain.')
        else setServerError(err.message)
      } else {
        setServerError('Gagal terhubung ke server.')
      }
    }
  }

  return (
    <Dialog open={open} onClose={close} title="Bikin meeting baru">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {serverError && <Alert tone="error">{serverError}</Alert>}

        <Field label="Nama meeting" error={errors.name?.message}>
          {(p) => (
            <Input autoFocus placeholder="Misal: Standup Jumat" {...p} {...register('name')} />
          )}
        </Field>

        <Field
          label="Slug"
          error={errors.slug?.message}
          hint="Opsional — bagian link setelah /room/. Kosongin biar diacak otomatis."
        >
          {(p) => (
            <Input
              placeholder="standup-jumat"
              className="font-mono"
              {...p}
              {...register('slug')}
            />
          )}
        </Field>

        <button
          type="button"
          onClick={() => setValue('is_public', !isPublic)}
          className="flex items-center gap-3 w-full text-left group"
        >
          <span
            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
              isPublic ? 'bg-[var(--color-flame)]' : 'bg-[var(--color-line-strong)]'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-[var(--color-canvas)] transition-transform ${
                isPublic ? 'translate-x-4' : ''
              }`}
            />
          </span>
          <span>
            <span className="block text-sm text-[var(--color-ink)]">
              {isPublic ? 'Publik' : 'Privat'}
            </span>
            <span className="block text-xs text-[var(--color-ink-muted)]">
              {isPublic
                ? 'Siapa pun yang login bisa gabung lewat link'
                : 'Cuma kamu yang bisa gabung'}
            </span>
          </span>
        </button>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={close}>
            Batal
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {isSubmitting ? 'Membuat...' : 'Bikin meeting'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
