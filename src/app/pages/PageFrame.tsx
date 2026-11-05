import type { ReactNode } from 'react'

export function PageFrame({ title, lede, children }: { title: string; lede: string; children?: ReactNode }) {
  return (
    <div className="rise mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-[26px] leading-tight">{title}</h1>
      <p className="mt-2 max-w-[62ch] text-ink-muted">{lede}</p>
      <div className="mt-8">{children}</div>
    </div>
  )
}

export function Upcoming({ chunk, items }: { chunk: string; items: string[] }) {
  return (
    <section aria-label="Planned for this area" className="rounded-xl border border-dashed border-hairline-strong p-6">
      <h2 className="text-base">Arrives in {chunk}</h2>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-ink">
        {items.map((i) => <li key={i}>{i}</li>)}
      </ul>
    </section>
  )
}
