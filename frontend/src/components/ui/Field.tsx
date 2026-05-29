import type { InputHTMLAttributes, ReactNode } from 'react'
import { useId, useState } from 'react'

type FieldProps = {
  label: string
  hint?: string
  error?: string
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode
}

export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = error ? errorId : hint ? hintId : undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-ink-muted)]"
      >
        {label}
      </label>
      {children({
        id,
        'aria-invalid': !!error || undefined,
        'aria-describedby': describedBy,
      })}
      {error ? (
        <p id={errorId} className="text-xs text-[var(--color-bad)]">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-[var(--color-ink-faint)]">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement>

const inputBase =
  'h-10 w-full rounded-md bg-[var(--color-surface)] border border-[var(--color-line)] px-3 text-[15px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] outline-none transition-colors hover:border-[var(--color-line-strong)] focus:border-[var(--color-flame)] aria-[invalid=true]:border-[var(--color-bad)] disabled:opacity-50'

export function Input(props: InputProps) {
  return <input {...props} className={`${inputBase} ${props.className ?? ''}`.trim()} />
}

type PasswordProps = InputProps & { showLabel?: string; hideLabel?: string }

export function PasswordInput({
  showLabel = 'lihat',
  hideLabel = 'sembunyikan',
  className = '',
  ...rest
}: PasswordProps) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        {...rest}
        type={visible ? 'text' : 'password'}
        className={`${inputBase} pr-16 ${className}`.trim()}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-2 my-auto h-7 px-2 text-[11px] font-medium uppercase tracking-wider text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] rounded"
      >
        {visible ? hideLabel : showLabel}
      </button>
    </div>
  )
}
