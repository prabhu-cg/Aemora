import type { ReactNode } from 'react'
import { Check, ChevronDown, GripVertical, Link2 } from 'lucide-react'
import { LogoMark } from '../components/ui/LogoMark'
import { buildDialog } from '../features/dialog/ops'
import { resolveComponent } from '../features/mapping/engine'
import { FIELD_TYPES } from '../features/mapping/fieldTypes'
import { highlightXml } from '../features/xml/format'
import { generateXml } from '../features/xml/build'
import { sampleProject } from '../features/sample/sample'

/**
 * Authored previews of the real product, drawn from the built-in sample project so they show
 * true mappings, true field types and true XML. Each is a labelled picture with sample data,
 * hidden from assistive technology; the caption carries the meaning.
 */

const card = () => sampleProject().components.find((c) => c.name === 'Card')!
const fields = () => resolveComponent(card(), sampleProject().mappings)

export function AppWindow({ title, children, caption, className = '' }: { title: string; children: ReactNode; caption: string; className?: string }) {
  return (
    <figure className={`min-w-0 ${className}`}>
      <div aria-hidden="true" className="overflow-hidden rounded-2xl border border-hairline-strong bg-surface shadow-[0_2px_4px_-1px_#1010140f,0_18px_40px_-14px_#10101433]">
        <div className="flex items-center gap-2 border-b border-hairline bg-sand px-4 py-2.5">
          <LogoMark className="size-4" />
          <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-ink-strong">{title}</span>
          <span className="rounded-full border border-hairline-strong bg-surface px-2 py-0.5 text-[11px] font-bold text-ink-muted">Sample data</span>
        </div>
        {children}
      </div>
      <figcaption className="mt-3 text-[14px] text-ink-muted">{caption}</figcaption>
    </figure>
  )
}

const chip = 'inline-flex h-7 items-center justify-between gap-2 rounded-md border border-hairline-strong bg-surface px-2 text-[12px] font-semibold text-ink-strong'

/** A static look at the field-type dropdown. Not interactive: the real one lives in the tool. */
function FakeSelect({ children, edited }: { children: ReactNode; edited?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`${chip} min-w-32`}>{children}<ChevronDown size={13} className="text-ink-muted" /></span>
      {edited && <span className="rounded-md bg-accent-tint px-1.5 py-0.5 text-[10px] font-bold text-accent-text">edited</span>}
    </span>
  )
}

const short = (rt: string) => rt.replace('granite/ui/components/coral/foundation/', '…/').replace('cq/gui/components/', '…/')

export function MappingBody({ rows = 6 }: { rows?: number }) {
  const c = card()
  const list = fields().slice(0, rows)
  return (
    <div className="px-4 py-3">
      <div className="grid grid-cols-[1fr_auto] gap-x-4 border-b border-hairline pb-1.5 text-[11px] font-bold text-ink-muted"><span>Property</span><span>AEM field</span></div>
      <ul>
        {list.map((f) => {
          const p = c.properties.find((x) => x.id === f.propertyId)!
          return (
            <li key={f.propertyId} className="grid grid-cols-[1fr_auto] items-center gap-x-4 border-b border-hairline py-2 last:border-b-0">
              <span className="min-w-0"><span className="block truncate text-[13px] font-bold text-ink-strong">{f.label}</span><span className="block truncate text-[11px] text-ink-muted">{p.type}</span></span>
              <span className="flex flex-col items-end gap-0.5"><FakeSelect edited={f.edited}>{FIELD_TYPES[f.fieldType].label}</FakeSelect><code className="text-[10px] text-ink-muted">{short(f.resourceType)}</code></span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function DialogBody() {
  const c = card()
  const d = buildDialog(c)
  const f = new Map(fields().map((x) => [x.propertyId, x]))
  const row = (id: string, nested = false) => {
    const x = f.get(id)!
    return (
      <li key={id} className={`flex items-center gap-1.5 rounded-md py-1.5 ${nested ? 'pl-6' : ''}`}>
        <GripVertical size={14} className="text-ink-muted" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink-strong">{x.label}</span>
        <span className="text-[11px] text-ink-muted">{FIELD_TYPES[x.fieldType].label}</span>
      </li>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-[1.2fr_1fr]">
      <div>
        {d.tabs.map((t) => (
          <section key={t.id} className="mb-3 last:mb-0">
            <p className="border-b border-hairline pb-1 text-[13px] font-extrabold text-ink-strong">{t.title}</p>
            <ul className="mt-1">
              {t.items.map((it) => it.kind === 'field' ? row(it.id) : (
                <li key={it.id} className="my-1 rounded-lg bg-sand/70 p-1.5">
                  <p className="px-1 text-[12px] font-extrabold text-ink-strong">{it.title}</p>
                  <ul>{it.fieldIds.map((id) => row(id, true))}</ul>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="rounded-lg border-l border-hairline pl-4 text-[12px]">
        <p className="text-[13px] font-extrabold text-ink-strong">Show description</p>
        <p className="text-ink-muted">Switch · Style tab</p>
        <p className="mt-3 text-[11px] font-bold text-ink-strong">Location in the dialog</p>
        <span className={`${chip} mt-1 w-full`}>Style<ChevronDown size={13} className="text-ink-muted" /></span>
        <p className="mt-3 text-[11px] font-bold text-ink-strong">Granite resource type</p>
        <code className="mt-1 block rounded bg-sand px-2 py-1.5 text-[10.5px] leading-snug text-ink-strong">granite/ui/components/coral/foundation/form/switch</code>
      </div>
    </div>
  )
}

export function XmlBody() {
  const c = card()
  const xml = generateXml({ component: c, dialog: buildDialog(c), fields: fields(), projectName: 'Sample', componentFolder: 'card' })
  // Skip the header comment and show the dialog skeleton, with its first fields.
  const body = xml.slice(xml.indexOf('<jcr:root'))
  const lines = body.split('\n').filter((l) => !l.includes('xmlns:')).slice(0, 30).join('\n')
  const ok = 'inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-bold text-success'
  return (
    <div>
      <pre className="m-0 max-h-72 overflow-hidden whitespace-pre p-4 font-mono text-[11.5px] leading-[1.55] text-ink-strong [mask-image:linear-gradient(#000_70%,transparent)]" dangerouslySetInnerHTML={{ __html: highlightXml(lines) }} />
      <div className="flex flex-wrap gap-2 border-t border-hairline bg-sand px-4 py-2.5">
        <span className={ok}><Check size={12} />XML syntax</span><span className={ok}><Check size={12} />Generator</span><span className={ok}><Check size={12} />AEM structure</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-ink-muted"><Link2 size={12} />static checks, not run in AEM</span>
      </div>
    </div>
  )
}
