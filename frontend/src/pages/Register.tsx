import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'

import { ApiError, api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Field, Input, PasswordInput } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Alert'

type FormData = { display_name: string; email: string; password: string }

type RegisterResponse = {
  token: string
  user: { id: number; email: string; display_name: string }
}

export function Register() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const { t } = useTranslation()
  const [serverError, setServerError] = useState<string | null>(null)

  const schema = useMemo(
    () =>
      z.object({
        display_name: z
          .string()
          .min(1, t('auth.errNameRequired'))
          .max(100, t('auth.registerLong')),
        email: z.string().min(1, t('auth.errEmailRequired')).email(t('auth.errEmailFormat')),
        password: z
          .string()
          .min(8, t('auth.errPasswordShort'))
          .max(128, t('auth.registerPasswordLong')),
      }),
    [t],
  )

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { display_name: '', email: '', password: '' },
  })

  async function onSubmit(values: FormData) {
    setServerError(null)
    try {
      const res = await api<RegisterResponse>('/auth/register', {
        method: 'POST',
        body: values,
        noAuth: true,
      })
      login(res.token)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) setServerError(t('auth.registerEmailExists'))
        else if (err.status === 429) setServerError(t('auth.registerSlowDown'))
        else if (err.code === 'domain_not_allowed') setServerError(t('auth.errDomainNotAllowed'))
        else setServerError(err.message)
      } else {
        setServerError(t('auth.errGeneric'))
      }
    }
  }

  return (
    <>
      <div className="space-y-1.5">
        <h1 className="text-3xl font-semibold tracking-tight">{t('auth.registerHeader')}</h1>
        <p className="text-[var(--color-ink-muted)] text-sm">
          {t('auth.registerHaveAccount')}{' '}
          <Link to="/login" className="text-[var(--color-flame)] hover:underline underline-offset-2">
            {t('auth.registerHaveAccountLink')}
          </Link>
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4" noValidate>
        {serverError && <Alert tone="error">{serverError}</Alert>}

        <Field
          label={t('auth.registerNameLabel')}
          error={errors.display_name?.message}
          hint={t('auth.registerNameHint')}
        >
          {(p) => (
            <Input
              autoComplete="name"
              autoFocus
              placeholder={t('auth.registerNamePlaceholder')}
              {...p}
              {...register('display_name')}
            />
          )}
        </Field>

        <Field label={t('auth.emailLabel')} error={errors.email?.message}>
          {(p) => (
            <Input
              type="email"
              autoComplete="email"
              placeholder={t('auth.emailPlaceholder')}
              {...p}
              {...register('email')}
            />
          )}
        </Field>

        <Field
          label={t('auth.passwordLabel')}
          error={errors.password?.message}
          hint={t('auth.registerPasswordHint')}
        >
          {(p) => (
            <PasswordInput
              autoComplete="new-password"
              placeholder={t('auth.registerPasswordPlaceholder')}
              {...p}
              {...register('password')}
            />
          )}
        </Field>

        <Button type="submit" loading={isSubmitting} className="w-full mt-2">
          {isSubmitting ? t('auth.registerCreatingButton') : t('auth.registerButton')}
        </Button>

        <p className="text-[11px] text-[var(--color-ink-faint)] text-center pt-2">
          {t('auth.registerFooter')}
        </p>
      </form>
    </>
  )
}
