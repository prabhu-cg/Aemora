import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Check, CheckCircle2, CircleAlert, Info, Settings2, X } from 'lucide-react'
import type { ComponentDef } from '../../components/schema'
import type { ComponentDialog } from '../../dialog/schema'
import type { ResolvedField } from '../../mapping/engine'
import { coerceValue, toSaved, validateValue, type Value } from '../values'
import { PreviewField } from './widgets'

interface Props { component: ComponentDef; dialog: ComponentDialog; fields: ResolvedField[]; /** Opens the Dialog tab, where left-out properties can be added back. */ onShowDialog?: () => void }

export function DialogPreview({ component, dialog, fields, onShowDialog }: Props) {
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

  // Conditional fields: shown while their controller is checked, or set to the chosen value. A condition that cannot work
  // (the controller is missing, or is not a checkbox, switch or select) never hides anything.
  const isShown = (f: ResolvedField): boolean => {
    const w = f.showWhen
    const c = w ? byId.get(w.propertyId) : undefined
    if (!w || !c || c.propertyId === f.propertyId) return true
    if (c.fieldType === 'checkbox' || c.fieldType === 'switch') return valueOf(c) === true
    if (c.fieldType === 'select') return !!w.value && String(valueOf(c)) === w.value
    return true
  }
  const conditional = placed.filter((f) => f.showWhen).length

  const errors = new Map<string, string>()
  for (const f of placed) { if (!isShown(f)) continue; const e = validateValue(f, valueOf(f)); if (e) errors.set(f.propertyId, e) }
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
    if (!f || f.fieldType === 'hidden' || !isShown(f)) return null
    return <PreviewField key={id} field={f} value={valueOf(f)} onChange={(v) => set(f, v)} error={shown(id)} onBlur={() => touch(id)} />
  }

  const leftOut = dialog.excluded.map((id) => component.properties.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p)
  const excludedCount = leftOut.length

  return (
    <section aria-label="Simulated dialog preview">
      <p role="note" className="mb-4 flex items-start gap-2 rounded-lg bg-info-soft p-3 text-[13px] text-info">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span><strong>Simulated authoring preview.</strong> This is not a running AEM instance. Spacing, styling and some behaviour will differ in AEM. Nothing you enter here is saved.{conditional > 0 && ' Fields with a “show only when” rule appear as their controlling field changes, the way the show/hide script would do it in AEM.'}</span>
      </p>

      {/* The stage imitates an author editing a page: a dimmed page with the component selected, and the dialog open over it. */}
      <div className="aem-skin relative overflow-hidden rounded-xl border border-hairline-strong" style={{ minHeight: '40rem' }}>
        <MockPage name={dialog.title || component.name} />
        <div className="absolute inset-0 bg-black/55" aria-hidden="true" />

        <div className="relative flex justify-center px-4 py-10">
          <div role="group" aria-label="Dialog" className="w-full max-w-[680px] overflow-hidden rounded-[6px] bg-surface shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
            <div className="flex items-center gap-3 border-b border-hairline px-5 py-3">
              <h3 className="min-w-0 flex-1 truncate text-[18px] leading-tight text-ink-strong">{dialog.title || component.name}</h3>
              <span className="rounded-full border border-hairline-strong px-2 py-0.5 text-[11px] font-bold text-ink-muted">Simulated</span>
              <p role="status" className="flex items-center gap-1.5 text-[12px] font-semibold">
                {submitted && errors.size > 0 && <span className="flex items-center gap-1 text-danger"><CircleAlert size={14} aria-hidden="true" />Fix {errors.size} {errors.size === 1 ? 'field' : 'fields'} before Done will work.</span>}
                {saved && <span className="flex items-center gap-1 text-success"><CheckCircle2 size={14} aria-hidden="true" />Valid. In AEM the dialog would close and save these values.</span>}
              </p>
              <button type="button" onClick={cancel} aria-label="Cancel" title="Cancel: clears what you typed in this preview" className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full text-ink hover:bg-sand"><X size={18} aria-hidden="true" /></button>
              <button type="button" onClick={done} aria-label="Done" title="Done" className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full bg-accent text-on-accent hover:bg-accent-hover"><Check size={18} aria-hidden="true" /></button>
            </div>

            <div role="tablist" aria-label="Dialog tabs" className="flex flex-wrap border-b border-hairline bg-sand">
              {dialog.tabs.map((t, i) => {
                const n = tabErrors(t)
                const selected = t.id === tab.id
                return (
                  <button key={t.id} id={`ptab-${t.id}`} role="tab" type="button" aria-selected={selected} aria-controls={`ppanel-${t.id}`} tabIndex={selected ? 0 : -1}
                    onClick={() => setActiveId(t.id)} onKeyDown={(e) => onTabKey(e, i)}
                    className={`-mb-px flex h-10 cursor-pointer items-center gap-2 border-b-2 px-4 text-[13px] ${selected ? 'border-accent bg-surface font-bold text-ink-strong' : 'border-transparent text-ink hover:text-ink-strong'}`}>
                    {t.title || 'Untitled'}
                    {n > 0 && <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-bg" aria-label={`${n} ${n === 1 ? 'problem' : 'problems'}`}>{n}</span>}
                  </button>
                )
              })}
            </div>

            <div ref={body} role="tabpanel" id={`ppanel-${tab.id}`} aria-labelledby={`ptab-${tab.id}`} className="max-h-[32rem] space-y-4 overflow-y-auto px-5 py-5">
              {tab.items.length === 0 && <p className="text-[13px] text-ink-muted">This tab has no fields.</p>}
              {tab.items.map((it) => it.kind === 'field' ? renderField(it.id) : (
                <fieldset key={it.id} className="space-y-4">
                  <legend className="mb-2 w-full border-b border-hairline pb-1 text-[13px] font-bold text-ink-strong">{it.title}</legend>
                  {it.fieldIds.map(renderField)}
                </fieldset>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-4 max-w-3xl space-y-3 text-[13px]">
        {hidden.length > 0 && (
          <p className="text-ink-muted">
            {hidden.length} hidden {hidden.length === 1 ? 'field is' : 'fields are'} not shown to authors{hidden.some((h) => h.defaultValue !== null) ? ': ' + hidden.map((h) => `${h.name} = ${String(h.defaultValue)}`).join(', ') : ''}.
          </p>
        )}
        {excludedCount > 0 && (
          <div role="note" aria-label="Properties left out of the dialog" className="rounded-lg border border-hairline bg-sand p-3">
            <p className="font-bold text-ink-strong">{excludedCount} {excludedCount === 1 ? 'property is' : 'properties are'} not in this dialog</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {leftOut.map((p) => <li key={p.id} className="rounded-md border border-hairline-strong bg-surface px-2 py-0.5 text-[12px] font-semibold text-ink-strong">{p.label || p.key}</li>)}
            </ul>
            <p className="mt-2 text-ink-muted">
              They stay in your project, but authors will not see them in AEM, and they are not in the generated XML.
              {onShowDialog && <> <button type="button" onClick={onShowDialog} className="cursor-pointer font-bold text-accent-text underline">Add them back in the Dialog tab</button>.</>}
            </p>
          </div>
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
            <li>Authors select the component in the page editor and choose the configure (wrench) icon. The dialog opens over the page, as above.</li>
            <li>Each tab here becomes a tab in the dialog; each section becomes a titled group of fields.</li>
            <li>The cross cancels and the tick saves (Done). Required fields are marked, and Done will not save until they are filled in correctly.</li>
            <li>Hover the (?) next to a label to read its description.</li>
            <li>Path, tag and file fields open AEM's own pickers. Here they show made-up sample paths.</li>
          </ul>
        </details>
      </div>
    </section>
  )
}

/** A made-up page behind the dialog, so it reads as an overlay. Decorative: nothing here is real content. */
function MockPage({ name }: { name: string }) {
  const bar = 'rounded bg-[#e1e1e1]'
  return (
    <div aria-hidden="true" className="absolute inset-0 bg-[#f0f0f0]">
      <div className="flex h-10 items-center gap-3 bg-[#2c2c2c] px-4"><span className="h-3 w-24 rounded bg-[#6e6e6e]" /><span className="ml-auto h-3 w-16 rounded bg-[#4b4b4b]" /></div>
      <div className="mx-auto max-w-[760px] space-y-4 px-6 py-6">
        <div className={`${bar} h-8 w-1/2`} />
        <div className="relative rounded-md border-2 border-[#2680eb] bg-white p-5">
          <span className="absolute -top-8 left-[-2px] flex items-center gap-2 rounded-t-md bg-[#2680eb] px-2.5 py-1.5 text-[12px] font-bold text-white"><Settings2 size={13} />{name}</span>
          <div className={`${bar} mb-3 h-5 w-2/3`} /><div className={`${bar} mb-2 h-3 w-full`} /><div className={`${bar} h-3 w-5/6`} />
        </div>
        <div className={`${bar} h-24 w-full`} />
        <div className="grid grid-cols-3 gap-4"><div className={`${bar} h-20`} /><div className={`${bar} h-20`} /><div className={`${bar} h-20`} /></div>
      </div>
    </div>
  )
}
