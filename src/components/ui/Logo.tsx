import { LogoMark } from './LogoMark'

export const TAGLINE = 'Generate. Build. Scale.'

/** The mark with the product name, and optionally the tagline beneath it. */
export function Logo({ className = '', tagline = false, markClassName = 'size-8' }: { className?: string; tagline?: boolean; markClassName?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-bold text-ink-strong ${className}`}>
      <LogoMark className={markClassName} />
      <span className="flex flex-col leading-tight">
        <span className="text-[15px] tracking-tight">Aemora</span>
        {tagline && <span className="text-xs font-medium text-ink-muted">{TAGLINE}</span>}
      </span>
    </span>
  )
}
