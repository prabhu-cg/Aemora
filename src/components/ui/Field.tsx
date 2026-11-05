import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'

const input =
  'w-full rounded-lg border border-hairline-strong bg-surface px-3 text-ink-strong placeholder:text-ink-muted/70 focus-visible:outline-2 focus-visible:outline-accent-text aria-[invalid=true]:border-danger'

export function TextField({ label, hint, error, ...rest }: { label: string; hint?: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[13px] font-bold text-ink-strong">{label}</label>
      <input id={id} className={`${input} h-10`} aria-invalid={!!error} aria-describedby={`${id}-d`} {...rest} />
      <p id={`${id}-d`} className={`mt-1 text-[12px] ${error ? 'text-danger' : 'text-ink-muted'}`} role={error ? 'alert' : undefined}>
        {error ?? hint}
      </p>
    </div>
  )
}

export function TextArea({ label, hint, ...rest }: { label: string; hint?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[13px] font-bold text-ink-strong">{label}</label>
      <textarea id={id} className={`${input} py-2`} rows={3} aria-describedby={`${id}-d`} {...rest} />
      {hint && <p id={`${id}-d`} className="mt-1 text-[12px] text-ink-muted">{hint}</p>}
    </div>
  )
}
