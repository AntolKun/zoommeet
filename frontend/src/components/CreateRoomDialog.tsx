import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'

import { ApiError } from '@/lib/api'
import { useCreateRoom, type Room } from '@/hooks/useRooms'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Alert'
import {
  defaultScheduledLocalValue,
  durationPresets,
  localValueToUTCISO,
} from '@/lib/schedule'

function makeSchema(t: (k: string) => string) {
  return z
    .object({
      name: z.string().min(1, t('createRoom.errNameRequired')).max(150, t('createRoom.errTooLong')),
      slug: z
        .string()
        .regex(/^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$/, t('createRoom.errSlugFormat'))
        .or(z.literal('')),
      is_public: z.boolean(),
      is_scheduled: z.boolean(),
      scheduled_at_local: z.string(),
      duration_minutes: z.number().int().min(5).max(480),
      recurrence: z.enum(['none', 'daily', 'weekly']),
      password: z
        .string()
        .min(4, t('createRoom.errPwShort'))
        .max(128, t('createRoom.errTooLong'))
        .or(z.literal('')),
      waiting_room_enabled: z.boolean(),
      default_mic_off: z.boolean(),
      default_cam_off: z.boolean(),
      is_webinar: z.boolean(),
    })
    .refine((v) => !v.is_scheduled || v.scheduled_at_local.length > 0, {
      path: ['scheduled_at_local'],
      message: t('createRoom.errStartRequired'),
    })
}

type FormData = z.infer<ReturnType<typeof makeSchema>>

type Props = {
  open: boolean
  onClose: () => void
  onCreated: (room: Room) => void
}

export function CreateRoomDialog({ open, onClose, onCreated }: Props) {
  const createRoom = useCreateRoom()
  const { t } = useTranslation()
  const schema = useMemo(() => makeSchema(t), [t])
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
    defaultValues: {
      name: '',
      slug: '',
      is_public: true,
      is_scheduled: false,
      scheduled_at_local: defaultScheduledLocalValue(),
      duration_minutes: 60,
      recurrence: 'none',
      password: '',
      waiting_room_enabled: false,
      default_mic_off: false,
      default_cam_off: false,
      is_webinar: false,
    },
  })

  const isPublic = watch('is_public')
  const isScheduled = watch('is_scheduled')
  const waitingRoomEnabled = watch('waiting_room_enabled')
  const defaultMicOff = watch('default_mic_off')
  const defaultCamOff = watch('default_cam_off')
  const isWebinar = watch('is_webinar')

  function close() {
    reset()
    setServerError(null)
    onClose()
  }

  async function onSubmit(values: FormData) {
    setServerError(null)
    try {
      const payload = {
        name: values.name,
        slug: values.slug || undefined,
        is_public: values.is_public,
        ...(values.is_scheduled
          ? {
              scheduled_at: localValueToUTCISO(values.scheduled_at_local),
              duration_minutes: values.duration_minutes,
              ...(values.recurrence !== 'none' ? { recurrence: values.recurrence } : {}),
            }
          : {}),
        ...(values.password ? { password: values.password } : {}),
        ...(values.waiting_room_enabled ? { waiting_room_enabled: true } : {}),
        ...(values.default_mic_off ? { default_mic_off: true } : {}),
        ...(values.default_cam_off ? { default_cam_off: true } : {}),
        ...(values.is_webinar ? { is_webinar: true } : {}),
      }
      const room = await createRoom.mutateAsync(payload)
      reset()
      onCreated(room)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) setServerError(t('createRoom.errSlugTaken'))
        else setServerError(err.message)
      } else {
        setServerError(t('auth.errGeneric'))
      }
    }
  }

  return (
    <Dialog open={open} onClose={close} title={t('createRoom.title')}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {serverError && <Alert tone="error">{serverError}</Alert>}

        <Field label={t('createRoom.nameLabel')} error={errors.name?.message}>
          {(p) => (
            <Input autoFocus placeholder={t('createRoom.namePlaceholder')} {...p} {...register('name')} />
          )}
        </Field>

        <Field
          label={t('createRoom.slugLabel')}
          error={errors.slug?.message}
          hint={t('createRoom.slugHint')}
        >
          {(p) => (
            <Input
              placeholder={t('createRoom.slugPlaceholder')}
              className="font-mono"
              {...p}
              {...register('slug')}
            />
          )}
        </Field>

        <Field
          label={t('createRoom.passwordLabel')}
          error={errors.password?.message}
          hint={t('createRoom.passwordHint')}
        >
          {(p) => (
            <Input
              type="text"
              placeholder={t('createRoom.passwordPlaceholder')}
              {...p}
              {...register('password')}
            />
          )}
        </Field>

        <ToggleRow
          on={isPublic}
          onToggle={() => setValue('is_public', !isPublic)}
          title={isPublic ? t('createRoom.publicTitle') : t('createRoom.privateTitle')}
          subtitle={
            isPublic
              ? t('createRoom.publicSubtitle')
              : t('createRoom.privateSubtitle')
          }
        />

        <ToggleRow
          on={isScheduled}
          onToggle={() => setValue('is_scheduled', !isScheduled)}
          title={isScheduled ? t('createRoom.scheduledTitle') : t('createRoom.anytimeTitle')}
          subtitle={
            isScheduled
              ? t('createRoom.scheduledSubtitle')
              : t('createRoom.anytimeSubtitle')
          }
        />

        <ToggleRow
          on={waitingRoomEnabled}
          onToggle={() => setValue('waiting_room_enabled', !waitingRoomEnabled)}
          title={waitingRoomEnabled ? t('createRoom.waitingRoomOnTitle') : t('createRoom.waitingRoomOffTitle')}
          subtitle={
            waitingRoomEnabled
              ? t('createRoom.waitingRoomOnSubtitle')
              : t('createRoom.waitingRoomOffSubtitle')
          }
        />

        <ToggleRow
          on={defaultMicOff}
          onToggle={() => setValue('default_mic_off', !defaultMicOff)}
          title={defaultMicOff ? t('createRoom.defaultMicOffOnTitle') : t('createRoom.defaultMicOffOffTitle')}
          subtitle={
            defaultMicOff
              ? t('createRoom.defaultMicOffOnSubtitle')
              : t('createRoom.defaultMicOffOffSubtitle')
          }
        />

        <ToggleRow
          on={defaultCamOff}
          onToggle={() => setValue('default_cam_off', !defaultCamOff)}
          title={defaultCamOff ? t('createRoom.defaultCamOffOnTitle') : t('createRoom.defaultCamOffOffTitle')}
          subtitle={
            defaultCamOff
              ? t('createRoom.defaultCamOffOnSubtitle')
              : t('createRoom.defaultCamOffOffSubtitle')
          }
        />

        <ToggleRow
          on={isWebinar}
          onToggle={() => setValue('is_webinar', !isWebinar)}
          title={isWebinar ? t('createRoom.webinarOnTitle') : t('createRoom.webinarOffTitle')}
          subtitle={
            isWebinar
              ? t('createRoom.webinarOnSubtitle')
              : t('createRoom.webinarOffSubtitle')
          }
        />

        {isScheduled && (
          <div className="pl-12 -mt-2 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('createRoom.startLabel')} error={errors.scheduled_at_local?.message}>
                {(p) => (
                  <Input
                    type="datetime-local"
                    className="font-mono text-sm"
                    {...p}
                    {...register('scheduled_at_local')}
                  />
                )}
              </Field>

              <Field label={t('createRoom.durationLabel')} error={errors.duration_minutes?.message}>
                {(p) => (
                  <select
                    className="h-10 w-full rounded-md bg-[var(--color-surface)] border border-[var(--color-line)] px-3 text-[15px] text-[var(--color-ink)] outline-none hover:border-[var(--color-line-strong)] focus:border-[var(--color-flame)]"
                    {...p}
                    {...register('duration_minutes', { valueAsNumber: true })}
                  >
                    {durationPresets().map((m) => (
                      <option key={m} value={m}>
                        {formatDurationOption(m, t)}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>

            <Field label={t('createRoom.recurrenceLabel')} hint={t('createRoom.recurrenceHint')}>
              {(p) => (
                <select
                  className="h-10 w-full rounded-md bg-[var(--color-surface)] border border-[var(--color-line)] px-3 text-[15px] text-[var(--color-ink)] outline-none hover:border-[var(--color-line-strong)] focus:border-[var(--color-flame)]"
                  {...p}
                  {...register('recurrence')}
                >
                  <option value="none">{t('createRoom.recurrenceNone')}</option>
                  <option value="daily">{t('createRoom.recurrenceDaily')}</option>
                  <option value="weekly">{t('createRoom.recurrenceWeekly')}</option>
                </select>
              )}
            </Field>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {isSubmitting ? t('createRoom.creating') : t('createRoom.create')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function ToggleRow({
  on,
  onToggle,
  title,
  subtitle,
}: {
  on: boolean
  onToggle: () => void
  title: string
  subtitle: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className="flex items-center gap-3 w-full text-left"
    >
      <span
        className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
          on ? 'bg-[var(--color-flame)]' : 'bg-[var(--color-line-strong)]'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-[var(--color-canvas)] transition-transform ${
            on ? 'translate-x-4' : ''
          }`}
        />
      </span>
      <span>
        <span className="block text-sm text-[var(--color-ink)]">{title}</span>
        <span className="block text-xs text-[var(--color-ink-muted)]">{subtitle}</span>
      </span>
    </button>
  )
}

function formatDurationOption(min: number, t: (k: string) => string): string {
  if (min < 60) return `${min} ${t('createRoom.durationMinute')}`
  const h = min / 60
  if (h === Math.floor(h)) return `${h} ${t('createRoom.durationHour')}`
  return `${min} ${t('createRoom.durationMinute')}`
}
