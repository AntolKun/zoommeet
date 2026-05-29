import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { ApiError, api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Field, Input, PasswordInput } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Alert'

const schema = z.object({
  email: z.string().min(1, 'Email belum diisi').email('Format email belum benar'),
  password: z.string().min(1, 'Password belum diisi'),
})

type FormData = z.infer<typeof schema>

type LoginResponse = {
  token: string
  user: { id: number; email: string; display_name: string }
}

export function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const [serverError, setServerError] = useState<string | null>(null)

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
        if (err.status === 401) setServerError('Email atau password salah.')
        else if (err.status === 429)
          setServerError('Terlalu banyak percobaan. Coba lagi sebentar lagi.')
        else setServerError(err.message)
      } else {
        setServerError('Tidak bisa terhubung ke server. Cek koneksimu.')
      }
    }
  }

  return (
    <>
      <div className="space-y-1.5">
        <h1 className="text-3xl font-semibold tracking-tight">Masuk lagi</h1>
        <p className="text-[var(--color-ink-muted)] text-sm">
          Belum punya akun?{' '}
          <Link to="/register" className="text-[var(--color-flame)] hover:underline underline-offset-2">
            Bikin satu — gratis
          </Link>
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4" noValidate>
        {serverError && <Alert tone="error">{serverError}</Alert>}

        <Field label="Email" error={errors.email?.message}>
          {(p) => (
            <Input
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="kamu@contoh.com"
              {...p}
              {...register('email')}
            />
          )}
        </Field>

        <Field label="Password" error={errors.password?.message}>
          {(p) => (
            <PasswordInput
              autoComplete="current-password"
              placeholder="Password kamu"
              {...p}
              {...register('password')}
            />
          )}
        </Field>

        <Button type="submit" loading={isSubmitting} className="w-full mt-2">
          {isSubmitting ? 'Memeriksa...' : 'Masuk'}
        </Button>
      </form>
    </>
  )
}
