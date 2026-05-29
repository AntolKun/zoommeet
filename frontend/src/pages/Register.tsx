import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { ApiError, api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Field, Input, PasswordInput } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Alert'

const schema = z.object({
  display_name: z
    .string()
    .min(1, 'Nama belum diisi')
    .max(100, 'Maksimal 100 karakter'),
  email: z.string().min(1, 'Email belum diisi').email('Format email belum benar'),
  password: z
    .string()
    .min(8, 'Minimal 8 karakter — biar aman')
    .max(128, 'Kepanjangan, tahan diri'),
})

type FormData = z.infer<typeof schema>

type RegisterResponse = {
  token: string
  user: { id: number; email: string; display_name: string }
}

export function Register() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [serverError, setServerError] = useState<string | null>(null)

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
        if (err.status === 409) setServerError('Email ini sudah terdaftar. Mau langsung login aja?')
        else if (err.status === 429)
          setServerError('Wah pelan-pelan. Coba lagi beberapa saat.')
        else setServerError(err.message)
      } else {
        setServerError('Tidak bisa terhubung ke server. Cek koneksimu.')
      }
    }
  }

  return (
    <>
      <div className="space-y-1.5">
        <h1 className="text-3xl font-semibold tracking-tight">Bikin akun</h1>
        <p className="text-[var(--color-ink-muted)] text-sm">
          Sudah punya?{' '}
          <Link to="/login" className="text-[var(--color-flame)] hover:underline underline-offset-2">
            Masuk di sini
          </Link>
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4" noValidate>
        {serverError && <Alert tone="error">{serverError}</Alert>}

        <Field label="Nama panggilan" error={errors.display_name?.message} hint="Yang muncul di video saat kamu join">
          {(p) => (
            <Input
              autoComplete="name"
              autoFocus
              placeholder="Misal: Alice K."
              {...p}
              {...register('display_name')}
            />
          )}
        </Field>

        <Field label="Email" error={errors.email?.message}>
          {(p) => (
            <Input
              type="email"
              autoComplete="email"
              placeholder="kamu@contoh.com"
              {...p}
              {...register('email')}
            />
          )}
        </Field>

        <Field
          label="Password"
          error={errors.password?.message}
          hint="Minimal 8 karakter"
        >
          {(p) => (
            <PasswordInput
              autoComplete="new-password"
              placeholder="Bebas, asal kamu inget"
              {...p}
              {...register('password')}
            />
          )}
        </Field>

        <Button type="submit" loading={isSubmitting} className="w-full mt-2">
          {isSubmitting ? 'Membuatkan akun...' : 'Bikin akun'}
        </Button>

        <p className="text-[11px] text-[var(--color-ink-faint)] text-center pt-2">
          Lanjut artinya kamu setuju aplikasi ini cuma proyek pembelajaran. Belum production-ready.
        </p>
      </form>
    </>
  )
}
