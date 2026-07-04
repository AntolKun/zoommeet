import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'

import { ApiError, api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Field, Input, PasswordInput } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Alert'

type FormData = { email: string; password: string }

type LoginResponse = {
  token: string
  user: { id: number; email: string; display_name: string }
}

export function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const { t } = useTranslation()
  const [serverError, setServerError] = useState<string | null>(null)

  const schema = useMemo(
    () =>
      z.object({
        email: z.string().min(1, t('auth.errEmailRequired')).email(t('auth.errEmailFormat')),
        password: z.string().min(1, t('auth.errPasswordRequired')),
      }),
    [t],
  )

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname || '/dashboard'

  async function onSubmit(values: FormData) {
    setServerError(null)
    try {
      const res = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        body: values,
        noAuth: true,
      })
      login(res.token)
      navigate(from, { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) setServerError(t('auth.errInvalidCredentials'))
        else if (err.status === 429) setServerError(t('auth.errRateLimit'))
        else setServerError(err.message)
      } else {
        setServerError(t('auth.errGeneric'))
      }
    }
  }

  return (
    <>
      <div className="space-y-1.5">
        <h1 className="text-3xl font-semibold tracking-tight">{t('auth.loginHeader')}</h1>
        <p className="text-[var(--color-ink-muted)] text-sm">
          {t('auth.loginNoAccount')}{' '}
          <Link to="/register" className="text-[var(--color-flame)] hover:underline underline-offset-2">
            {t('auth.loginNoAccountLink')}
          </Link>
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4" noValidate>
        {serverError && <Alert tone="error">{serverError}</Alert>}

        <Field label={t('auth.emailLabel')} error={errors.email?.message}>
          {(p) => (
            <Input
              type="email"
              autoComplete="email"
              autoFocus
              placeholder={t('auth.emailPlaceholder')}
              {...p}
              {...register('email')}
            />
          )}
        </Field>

        <Field label={t('auth.passwordLabel')} error={errors.password?.message}>
          {(p) => (
            <PasswordInput
              autoComplete="current-password"
              placeholder={t('auth.passwordPlaceholderLogin')}
              {...p}
              {...register('password')}
            />
          )}
        </Field>

        <Button type="submit" loading={isSubmitting} className="w-full mt-2">
          {isSubmitting ? t('auth.loginCheckingButton') : t('auth.loginButton')}
        </Button>
      </form>
    </>
  )
}
