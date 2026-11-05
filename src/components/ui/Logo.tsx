export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-extrabold tracking-tight text-ink-strong ${className}`}>
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <rect width="24" height="24" rx="6" fill="var(--accent)" />
        <path d="M6 7.5h12M6 12h12M6 16.5h7" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      </svg>
      Aemora
    </span>
  )
}
