import type { ReactNode } from 'react'

export function PageFrame({ title, lede, actions, children }: { title: string; lede: string; /** Page-level buttons, aligned with the title. */ actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="rise py-8 lg:pt-10">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <h1 className="min-w-0 break-words text-[26px] leading-tight">{title}</h1>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
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
