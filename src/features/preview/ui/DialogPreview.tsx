import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { CheckCircle2, Info, RotateCcw } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import type { ComponentDef } from '../../components/schema'
import type { ComponentDialog } from '../../dialog/schema'
import type { ResolvedField } from '../../mapping/engine'
import { coerceValue, toSaved, validateValue, type Value } from '../values'
import { PreviewField } from './widgets'

interface Props { component: ComponentDef; dialog: ComponentDialog; fields: ResolvedField[] }

export function DialogPreview({ component, dialog, fields }: Props) {
  const [values, setValues] = useState<Map<string, Value>>(new Map())
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [activeId, setActiveId] = useState('')
  const [saved, setSaved] = useState<Record<string, unknown> | null>(null)
  const body = useRef<HTMLDivElement>(null)

  const byId = useMemo(() => new Map(fields.map((f) => [f.propertyId, f])), [fields])
  const valueOf = (f: ResolvedField) => coerceValue(f, values.get(f.propertyId))
  const tab = dialog.tabs.find((t) => t.id === activeId) ?? dialog.tabs[0]

  const idsOfTab = (t: ComponentDialog['tabs'][number]) => t.items.flatMap((i) => (i.kind === 'field' ? [i.id] : i.fieldIds))
  const placed = dialog.tabs.flatMap(idsOfTab).map((id) => byId.get(id)).filter((f): f is ResolvedField => !!f)
  const hidden = placed.filter((f) => f.fieldType === 'hidden')

  const errors = new Map<string, string>()
  for (const f of placed) { const e = validateValue(f, valueOf(f)); if (e) errors.set(f.propertyId, e) }
  const shown = (id: string) => (submitted || touched.has(id) ? errors.get(id) ?? null : null)
  const tabErrors = (t: ComponentDialog['tabs'][number]) => idsOfTab(t).filter((id) => shown(id)).length

  const set = (f: ResolvedField, v: Value) => { setSaved(null); setValues((m) => new Map(m).set(f.propertyId, v)) }
  const touch = (id: string) => setTouched((s) => (s.has(id) ? s : new Set(s).add(id)))

  const done = () => {
    setSubmitted(true)
    if (errors.size) {
      setSaved(null)
      const firstBad = dialog.tabs.find((t) => idsOfTab(t).some((id) => errors.has(id)))
      if (firstBad) setActiveId(firstBad.id)
      // Wait for the right tab to render, then focus the first invalid control.
      requestAnimationFrame(() => body.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    setSaved(toSaved(placed, values))
  }
  const cancel = () => { setValues(new Map()); setTouched(new Set()); setSubmitted(false); setSaved(null) }

  const onTabKey = (e: KeyboardEvent, i: number) => {
    const n = dialog.tabs.length
    const j = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1
    if (j < 0) return
    e.preventDefault()
    setActiveId(dialog.tabs[j].id)
    document.getElementById(`ptab-${dialog.tabs[j].id}`)?.focus()
  }

  const renderField = (id: string) => {
    const f = byId.get(id)
    if (!f || f.fieldType === 'hidden') return null
    return <PreviewField key={id} field={f} value={valueOf(f)} onChange={(v) => set(f, v)} error={shown(id)} onBlur={() => touch(id)} />
  }

  const excludedCount = dialog.excluded.length

  return (
    <section aria-label="Simulated dialog preview">
      <p role="note" className="mb-4 flex items-start gap-2 rounded-lg bg-info-soft p-3 text-[13px] text-info">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span><strong>Simulated authoring preview.</strong> This is not a running AEM instance. Spacing, styling and some behaviour will differ in AEM. Nothing you enter here is saved.</span>
      </p>

      <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-hairline-strong bg-surface shadow-[0_2px_4px_-1px_#1010140f,0_18px_40px_-14px_#10101433]">
        <div className="flex items-center justify-between gap-3 border-b border-hairline bg-sand px-5 py-3">
          <h3 className="text-base">{dialog.title || component.name}</h3>
          <span className="rounded-full border border-hairline-strong bg-surface px-2.5 py-0.5 text-[11px] font-bold text-ink-muted">Simulated</span>
        </div>

        <div role="tablist" aria-label="Dialog tabs" className="flex flex-wrap gap-1 border-b border-hairline px-3">
          {dialog.tabs.map((t, i) => {
            const n = tabErrors(t)
            const selected = t.id === tab.id
            return (
              <button key={t.id} id={`ptab-${t.id}`} role="tab" type="button" aria-selected={selected} aria-controls={`ppanel-${t.id}`} tabIndex={selected ? 0 : -1}
                onClick={() => setActiveId(t.id)} onKeyDown={(e) => onTabKey(e, i)}
                className={`-mb-px flex h-10 cursor-pointer items-center gap-2 border-b-2 px-3 text-[14px] font-bold ${selected ? 'border-accent text-accent-text' : 'border-transparent text-ink hover:text-ink-strong'}`}>
                {t.title || 'Untitled'}
                {n > 0 && <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-bg" aria-label={`${n} ${n === 1 ? 'problem' : 'problems'}`}>{n}</span>}
              </button>
            )
          })}
        </div>

        <div ref={body} role="tabpanel" id={`ppanel-${tab.id}`} aria-labelledby={`ptab-${tab.id}`} className="space-y-5 px-5 py-5">
          {tab.items.length === 0 && <p className="text-[13px] text-ink-muted">This tab has no fields.</p>}
          {tab.items.map((it) => it.kind === 'field' ? renderField(it.id) : (
            <fieldset key={it.id} className="space-y-4 rounded-lg border border-hairline p-4">
              <legend className="px-1 text-[13px] font-extrabold text-ink-strong">{it.title}</legend>
              {it.fieldIds.map(renderField)}
            </fieldset>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline bg-sand px-5 py-3">
          <p role="status" className="min-h-5 text-[13px] font-semibold">
            {submitted && errors.size > 0 && <span className="text-danger">Fix {errors.size} {errors.size === 1 ? 'field' : 'fields'} before Done will work.</span>}
            {saved && <span className="flex items-center gap-1.5 text-success"><CheckCircle2 size={15} aria-hidden="true" />Valid. In AEM the dialog would close and save these values.</span>}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={cancel} title="Clears what you typed in this preview"><RotateCcw size={15} aria-hidden="true" />Cancel</Button>
            <Button onClick={done}>Done</Button>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-4 max-w-3xl space-y-3 text-[13px]">
        {(hidden.length > 0 || excludedCount > 0) && (
          <p className="text-ink-muted">
            {hidden.length > 0 && <>{hidden.length} hidden {hidden.length === 1 ? 'field is' : 'fields are'} not shown to authors{hidden.some((h) => h.defaultValue !== null) ? ': ' + hidden.map((h) => `${h.name} = ${String(h.defaultValue)}`).join(', ') : ''}. </>}
            {excludedCount > 0 && <>{excludedCount} {excludedCount === 1 ? 'property is' : 'properties are'} left out of the dialog.</>}
          </p>
        )}
        {saved && (
          <details open className="rounded-lg border border-hairline p-3">
            <summary className="cursor-pointer font-bold text-ink-strong">Values this dialog would save (simulated)</summary>
            <pre aria-label="Saved values" className="mt-2 overflow-x-auto rounded-md bg-sand p-3 font-mono text-[12px] text-ink-strong">{JSON.stringify(saved, null, 2)}</pre>
            <p className="mt-1 text-ink-muted">Property names and JCR types come from each field's name and type hint.</p>
          </details>
        )}
        <details className="rounded-lg border border-hairline p-3">
          <summary className="cursor-pointer font-bold text-ink-strong">What authors will see in AEM</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-ink">
            <li>Authors select the component in the page editor and choose the configure (wrench) icon. The dialog opens over the page.</li>
            <li>Each tab here becomes a tab in the dialog; each section becomes a titled group of fields.</li>
            <li>Required fields are marked and the dialog cannot be saved until they are filled in correctly.</li>
            <li>Done saves the values to the component and closes the dialog. Cancel closes it and keeps what was saved before.</li>
            <li>Path, tag and file fields open AEM's own pickers. Here they show made-up sample paths.</li>
          </ul>
        </details>
      </div>
    </section>
  )
}
