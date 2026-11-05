import { useId, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, CircleHelp, FolderOpen, Plus, Trash2, Upload, X } from 'lucide-react'
import type { ResolvedField } from '../../mapping/engine'
import { hasEmptyOption } from '../../mapping/nodes'
import type { Subfield } from '../../mapping/schema'
import { samplePaths } from '../samples'
import { isMulti, type Item, type Value } from '../values'

const input = 'h-9 w-full rounded-lg border border-hairline-strong bg-surface px-3 text-ink-strong aria-[invalid=true]:border-danger'
const ghostBtn = 'inline-flex h-8 items-center gap-1.5 rounded-lg border border-hairline-strong bg-surface px-2.5 text-[13px] font-semibold text-ink-strong hover:bg-sand cursor-pointer'
const iconBtn = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-ink-strong/5 hover:text-ink-strong disabled:opacity-30 disabled:pointer-events-none cursor-pointer'

interface Common { id: string; describedBy?: string; invalid: boolean; onBlur: () => void }

/** A popover of made-up paths. Labelled as sample data because no repository is behind it. */
function Picker({ paths, onPick, label }: { paths: string[]; onPick: (p: string) => void; label: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative">
      <button type="button" className={ghostBtn} aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen(!open)}><FolderOpen size={15} aria-hidden="true" />{label}</button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-hairline-strong bg-surface p-1 shadow-[0_8px_24px_-6px_#1010141f]">
          <p className="px-2 py-1 text-[11px] font-semibold text-ink-muted">Sample paths (simulated)</p>
          <ul role="listbox" aria-label="Sample paths">
            {paths.map((p) => (
              <li key={p} role="option" aria-selected="false">
                <button type="button" className="block w-full truncate rounded-md px-2 py-1.5 text-left font-mono text-[12px] text-ink-strong hover:bg-sand cursor-pointer" onClick={() => { onPick(p); setOpen(false) }}>{p}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  )
}

/** Chips with a text box: tags, and paths when several are allowed. */
function Chips({ common, value, onChange, placeholder, suggestions, browseLabel }: { common: Common; value: string[]; onChange: (v: string[]) => void; placeholder: string; suggestions: string[]; browseLabel: string }) {
  const [draft, setDraft] = useState('')
  const add = (t: string) => { const v = t.trim(); if (v && !value.includes(v)) onChange([...value, v]); setDraft('') }
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-hairline-strong bg-surface p-1.5 aria-[invalid=true]:border-danger" aria-invalid={common.invalid}>
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-md bg-sand px-2 py-1 text-[12px] font-semibold text-ink-strong">
            {t}
            <button type="button" aria-label={`Remove ${t}`} className="cursor-pointer text-ink-muted hover:text-ink-strong" onClick={() => onChange(value.filter((x) => x !== t))}><X size={12} aria-hidden="true" /></button>
          </span>
        ))}
        <input id={common.id} aria-describedby={common.describedBy} className="h-7 min-w-24 flex-1 bg-transparent px-1 text-ink-strong outline-none" value={draft} placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)} onBlur={() => { if (draft.trim()) add(draft); common.onBlur() }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft) } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1)) }} />
        <Picker paths={suggestions.filter((s) => !value.includes(s))} label={browseLabel} onPick={(p) => add(p)} />
      </div>
    </div>
  )
}

type ScalarKind = 'textfield' | 'textarea' | 'numberfield' | 'pathfield' | 'checkbox' | 'select' | 'hidden'

/** One simple control, used for items of a multifield and for the fields inside a composite item. */
function Simple({ kind, label, value, onChange, id, options, rootPath }: { kind: ScalarKind; label: string; value: string | number | boolean | undefined; onChange: (v: string | boolean) => void; id: string; options?: string[]; rootPath?: string }) {
  if (kind === 'checkbox') return <label className="flex items-center gap-2 text-[14px] font-semibold text-ink-strong"><input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />{label}</label>
  if (kind === 'select') return (
    <select id={id} aria-label={label} className={input} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
      <option value="">{`Select ${label.toLowerCase()}`}</option>{(options ?? []).map((o) => <option key={o}>{o}</option>)}
    </select>
  )
  if (kind === 'textarea') return <textarea id={id} aria-label={label} className="w-full rounded-lg border border-hairline-strong bg-surface px-3 py-2 text-ink-strong" rows={2} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
  if (kind === 'pathfield') return (
    <span className="flex gap-1.5">
      <input id={id} aria-label={label} className={`${input} font-mono text-[13px]`} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} placeholder={rootPath ?? '/content'} />
      <Picker paths={samplePaths(rootPath ?? '/content')} label="Browse" onPick={(p) => onChange(p)} />
    </span>
  )
  return <input id={id} aria-label={label} className={input} type={kind === 'numberfield' ? 'number' : 'text'} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
}

function Multifield({ field, common, value, onChange }: { field: ResolvedField; common: Common; value: Item[]; onChange: (v: Item[]) => void }) {
  const mf = field.multifield
  const composite = !!mf?.composite
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= value.length) return; const next = [...value]; [next[i], next[j]] = [next[j], next[i]]; onChange(next) }
  const blank = (): Item => composite ? Object.fromEntries((mf?.subfields ?? []).map((s) => [s.key, s.fieldType === 'checkbox' ? false : ''])) : { value: '' }
  const set = (i: number, patch: Item) => onChange(value.map((it, k) => (k === i ? { ...it, ...patch } : it)))
  return (
    <div id={common.id} aria-describedby={common.describedBy}>
      {value.length > 0 && (
        <ul aria-label={`Items of ${field.label}`} className="space-y-2">
          {value.map((it, i) => (
            <li key={i} className="flex items-start gap-1.5 rounded-lg bg-sand/70 p-2">
              <div className="min-w-0 flex-1 space-y-2">
                {composite
                  ? (mf?.subfields ?? []).map((sf: Subfield) => (
                    <div key={sf.id}>
                      {sf.fieldType !== 'checkbox' && sf.fieldType !== 'hidden' && <label htmlFor={`${common.id}-${i}-${sf.key}`} className="mb-0.5 block text-[12px] font-bold text-ink-strong">{sf.label}</label>}
                      {sf.fieldType !== 'hidden' && <Simple id={`${common.id}-${i}-${sf.key}`} kind={sf.fieldType} label={sf.label} value={it[sf.key]} options={sf.allowedValues} onChange={(v) => set(i, { [sf.key]: v })} />}
                    </div>
                  ))
                  : <Simple id={`${common.id}-${i}`} kind={mf?.itemFieldType ?? 'textfield'} label={`${field.label} ${i + 1}`} value={it.value} rootPath={String(field.constraints.rootPath ?? '/content')} onChange={(v) => set(i, { value: v })} />}
              </div>
              <button type="button" className={iconBtn} aria-label={`Move item ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={15} aria-hidden="true" /></button>
              <button type="button" className={iconBtn} aria-label={`Move item ${i + 1} down`} disabled={i === value.length - 1} onClick={() => move(i, 1)}><ArrowDown size={15} aria-hidden="true" /></button>
              <button type="button" className={iconBtn} aria-label={`Remove item ${i + 1}`} onClick={() => onChange(value.filter((_, k) => k !== i))}><Trash2 size={15} aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className={`${ghostBtn} ${value.length ? 'mt-2' : ''}`} onClick={() => onChange([...value, blank()])} onBlur={common.onBlur}><Plus size={14} aria-hidden="true" />Add</button>
    </div>
  )
}

export function FieldControl({ field, value, onChange, common }: { field: ResolvedField; value: Value; onChange: (v: Value) => void; common: Common }) {
  const c = field.constraints
  const str = typeof value === 'string' ? value : ''
  const a = { id: common.id, 'aria-describedby': common.describedBy, 'aria-invalid': common.invalid, 'aria-required': field.required || undefined, onBlur: common.onBlur }
  const fileRef = useRef<HTMLInputElement>(null)
  switch (field.fieldType) {
    case 'textfield':
      return <input {...a} className={input} value={str} placeholder={typeof c.emptyText === 'string' ? c.emptyText : undefined} onChange={(e) => onChange(e.target.value)} />
    case 'textarea':
      return <textarea {...a} className="w-full rounded-lg border border-hairline-strong bg-surface px-3 py-2 text-ink-strong aria-[invalid=true]:border-danger" rows={typeof c.rows === 'number' ? c.rows : 3} value={str} placeholder={typeof c.emptyText === 'string' ? c.emptyText : undefined} onChange={(e) => onChange(e.target.value)} />
    case 'numberfield':
      return <input {...a} className={input} type="number" value={str} min={typeof c.min === 'number' ? c.min : undefined} max={typeof c.max === 'number' ? c.max : undefined} step={typeof c.step === 'number' ? c.step : 'any'} placeholder={typeof c.emptyText === 'string' ? c.emptyText : undefined} onChange={(e) => onChange(e.target.value)} />
    case 'checkbox':
      return <label className="flex items-center gap-2 text-[14px] font-semibold text-ink-strong"><input {...a} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} /><span>{field.label}{field.required && <span aria-hidden="true" className="text-danger"> *</span>}</span></label>
    case 'switch':
      return (
        <label className="flex cursor-pointer items-center gap-2.5 text-[14px] font-semibold text-ink-strong">
          <input {...a} type="checkbox" role="switch" className="peer sr-only" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          <span aria-hidden="true" className="relative h-5 w-9 shrink-0 rounded-full bg-hairline-strong transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-text after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
          <span>{field.label}{field.required && <span aria-hidden="true" className="text-danger"> *</span>}</span>
        </label>
      )
    case 'select':
      return isMulti(field) ? (
        <select {...a} multiple size={Math.min(5, Math.max(2, field.allowedValues.length))} className="w-full rounded-lg border border-hairline-strong bg-surface px-2 py-1 text-ink-strong" value={Array.isArray(value) ? (value as string[]) : []}
          onChange={(e) => onChange([...e.target.selectedOptions].map((o) => o.value))}>{field.allowedValues.map((v) => <option key={v}>{v}</option>)}</select>
      ) : (
        <select {...a} className={input} value={str} onChange={(e) => onChange(e.target.value)}>
          {hasEmptyOption(field) && <option value="">Select</option>}
          {field.allowedValues.map((v) => <option key={v}>{v}</option>)}
        </select>
      )
    case 'multifield':
      return <Multifield field={field} common={common} value={Array.isArray(value) ? (value as Item[]) : []} onChange={onChange} />
    case 'pathfield': {
      const root = typeof c.rootPath === 'string' ? c.rootPath : '/content'
      return isMulti(field)
        ? <Chips common={common} value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} placeholder={root} suggestions={samplePaths(root)} browseLabel="Browse" />
        : (
          <span className="flex gap-1.5">
            <input {...a} className={`${input} font-mono text-[13px]`} value={str} placeholder={typeof c.emptyText === 'string' && c.emptyText ? c.emptyText : root} onChange={(e) => onChange(e.target.value)} />
            <Picker paths={samplePaths(root)} label="Browse" onPick={onChange} />
          </span>
        )
    }
    case 'tagfield': {
      const root = typeof c.rootPath === 'string' ? c.rootPath : '/content/cq:tags'
      return <Chips common={common} value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} placeholder="Add a tag" suggestions={samplePaths(root)} browseLabel="Browse tags" />
    }
    case 'fileupload':
      return (
        <div>
          <button type="button" id={common.id} aria-describedby={common.describedBy} onBlur={common.onBlur} onClick={() => fileRef.current?.click()}
            className={`flex h-24 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed bg-surface text-[13px] text-ink hover:bg-sand ${common.invalid ? 'border-danger' : 'border-hairline-strong'}`}>
            <Upload size={18} aria-hidden="true" />
            {str ? <span className="font-bold text-ink-strong">{str}</span> : <span>Drag and drop a file, or click to choose</span>}
            <span className="text-[11px] text-ink-muted">{str ? 'Chosen only for this preview. Nothing is uploaded.' : 'Nothing is uploaded in this preview.'}</span>
          </button>
          <input ref={fileRef} type="file" className="sr-only" aria-label={`Choose a file for ${field.label}`} tabIndex={-1} onChange={(e) => onChange(e.target.files?.[0]?.name ?? '')} />
        </div>
      )
    case 'colorfield':
      return (
        <span className="flex items-center gap-2">
          <input type="color" aria-label={`Pick a color for ${field.label}`} className="h-9 w-12 cursor-pointer rounded-lg border border-hairline-strong bg-surface p-1" value={/^#[0-9a-f]{6}$/i.test(str) ? str : '#000000'} onChange={(e) => onChange(e.target.value)} />
          <input {...a} className={`${input} max-w-40 font-mono text-[13px]`} value={str} placeholder="#rrggbb" onChange={(e) => onChange(e.target.value)} />
        </span>
      )
    case 'datepicker':
      return <input {...a} className={input} type={c.type === 'datetime' ? 'datetime-local' : 'date'} value={str} onChange={(e) => onChange(e.target.value)} />
    case 'richtext':
      return (
        <div className={`overflow-hidden rounded-lg border bg-surface ${common.invalid ? 'border-danger' : 'border-hairline-strong'}`}>
          {c.useFixedInlineToolbar !== false && (
            <div aria-hidden="true" title="Fixed inline toolbar (simulated)" className="flex gap-3 border-b border-hairline bg-sand px-3 py-1.5 text-[13px] text-ink-muted"><b>B</b><i>I</i><u>U</u><span>• List</span><span>Link</span></div>
          )}
          <textarea {...a} className="block w-full bg-transparent px-3 py-2 text-ink-strong outline-none" rows={4} value={str} onChange={(e) => onChange(e.target.value)} />
        </div>
      )
    case 'hidden':
      return null
  }
}

/** The (?) icon AEM puts beside a label. The description is a tooltip on hover or focus, and also the field's accessible description. */
function Hint({ id, text, label }: { id: string; text: string; label: string }) {
  return (
    <span className="group relative ml-1.5 inline-flex align-middle">
      <button type="button" aria-label={`About ${label}`} aria-describedby={id} className="inline-flex cursor-help text-ink-muted hover:text-ink-strong"><CircleHelp size={14} aria-hidden="true" /></button>
      <span id={id} role="tooltip" className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-60 rounded-md bg-ink-strong px-2.5 py-1.5 text-[12px] font-normal leading-snug text-bg shadow-lg group-focus-within:block group-hover:block">{text}</span>
    </span>
  )
}

/** Label, control, description tooltip and error, wired together for screen readers. */
export function PreviewField({ field, value, onChange, error, onBlur }: { field: ResolvedField; value: Value; onChange: (v: Value) => void; error: string | null; onBlur: () => void }) {
  const id = useId()
  const hasDesc = !!field.description
  const describedBy = [hasDesc && `${id}-d`, error && `${id}-e`].filter(Boolean).join(' ') || undefined
  const inlineLabel = field.fieldType === 'checkbox' || field.fieldType === 'switch'
  const labelFor: ReactNode = inlineLabel ? null : (
    <div className="mb-1 flex items-center">
      <label htmlFor={id} className="text-[12px] font-normal text-ink">{field.label}{field.required && <span aria-hidden="true" className="text-danger"> *</span>}{field.required && <span className="sr-only"> (required)</span>}</label>
      {hasDesc && <Hint id={`${id}-d`} text={field.description} label={field.label} />}
    </div>
  )
  return (
    <div>
      {labelFor}
      <div className="flex items-center">
        <div className="min-w-0 flex-1"><FieldControl field={field} value={value} onChange={onChange} common={{ id, describedBy, invalid: !!error, onBlur }} /></div>
        {inlineLabel && hasDesc && <Hint id={`${id}-d`} text={field.description} label={field.label} />}
      </div>
      {error && <p id={`${id}-e`} role="alert" className="mt-1 flex items-center gap-1 text-[12px] font-semibold text-danger">{error}</p>}
    </div>
  )
}
