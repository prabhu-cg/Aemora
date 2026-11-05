import { useEffect, useId, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { SidePanel } from '../../../components/ui/SidePanel'
import { Button } from '../../../components/ui/Button'
import { toKey } from '../detect'
import { PROPERTY_TYPE_LABELS, parseDefaultInput, type PropertyPatch } from '../ops'
import { PROPERTY_TYPES, type ComponentDef, type Property } from '../schema'
import type { Issue } from '../validate'

const input = 'h-9 w-full rounded-lg border border-hairline-strong bg-surface px-3 text-ink-strong aria-[invalid=true]:border-danger'
const area = 'w-full rounded-lg border border-hairline-strong bg-surface px-3 py-2 text-ink-strong'
const originLabel: Record<Property['origin']['kind'], string> = {
  json: 'JSON import', clipboard: 'Clipboard', 'figma-rest': 'Figma API', 'figma-plugin': 'Figma plugin', screenshot: 'Screenshot (entered by hand)', manual: 'Added by hand', template: 'Standard property suggestion',
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: (id: string, describedBy: string) => React.ReactNode }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[13px] font-bold text-ink-strong">{label}</label>
      {children(id, `${id}-d`)}
      <p id={`${id}-d`} role={error ? 'alert' : undefined} className={`mt-1 text-[12px] ${error ? 'text-danger' : 'text-ink-muted'}`}>{error ?? hint}</p>
    </div>
  )
}

type PanelProps = {
  component: ComponentDef
  property: Property
  issues: Issue[]
  onChange: (patch: PropertyPatch) => void
  onRemove: () => void
  onClose: () => void
}

/**
 * The shell stays mounted so it can slide out. Only the form is keyed to the property,
 * so switching rows swaps the content without replaying the slide.
 */
export function PropertyPanel({ open, ...p }: PanelProps & { open: boolean }) {
  return (
    <SidePanel open={open} title={`Property: ${p.property.label || p.property.key}`} onClose={p.onClose}>
      <PropertyForm key={p.property.id} {...p} />
    </SidePanel>
  )
}

function PropertyForm({ component, property, issues, onChange, onRemove }: PanelProps) {
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => { formRef.current?.querySelector<HTMLElement>('input,textarea,select')?.focus({ preventScroll: true }) }, [])
  // Local copy keeps typing smooth; each change is also saved straight away.
  const [d, setD] = useState(property)
  const [valuesText, setValuesText] = useState(property.allowedValues.join('\n'))
  const [defText, setDefText] = useState(property.defaultValue === null ? '' : String(property.defaultValue))
  const [defError, setDefError] = useState('')
  const edit = (patch: PropertyPatch) => { setD((x) => ({ ...x, ...patch })); onChange(patch) }
  const err = (...codes: Issue['code'][]) => issues.find((i) => codes.includes(i.code))?.message

  const pickType = (type: Property['type']) => {
    edit({ type })
    const parsed = parseDefaultInput(type, defText)
    setDefError(parsed.error ?? '')
    if (!parsed.error) edit({ type, defaultValue: parsed.value })
  }
  const onValues = (text: string) => {
    setValuesText(text)
    edit({ allowedValues: text.split('\n').map((v) => v.trim()).filter(Boolean) })
  }
  const onDefaultText = (text: string) => {
    setDefText(text)
    const parsed = parseDefaultInput(d.type, text)
    setDefError(parsed.error ?? '')
    if (!parsed.error) edit({ defaultValue: parsed.value })
  }

  const groups = [...new Set(component.properties.map((p) => p.group).filter(Boolean))]

  return (
      <form ref={formRef} className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        <Field label="Label" error={err('empty-label')} hint="What authors see above the field.">
          {(id, by) => <input id={id} aria-describedby={by} aria-invalid={!!err('empty-label')} className={input} value={d.label} onChange={(e) => edit({ label: e.target.value })} />}
        </Field>
        <Field label="Field name" error={err('empty-key', 'bad-key', 'duplicate-key')} hint="Becomes the property name stored in the repository.">
          {(id, by) => (
            <div className="flex gap-2">
              <input id={id} aria-describedby={by} aria-invalid={!!err('empty-key', 'bad-key', 'duplicate-key')} className={`${input} font-mono text-[13px]`} value={d.key} onChange={(e) => edit({ key: e.target.value })} spellCheck={false} />
              <Button type="button" size="sm" variant="outline" className="h-9 shrink-0" onClick={() => edit({ key: toKey(d.label) })} title="Rebuild the field name from the label">Match label</Button>
            </div>
          )}
        </Field>
        <Field label="Type" hint="Chunk 4 maps each type to an AEM field. You can change the mapping there.">
          {(id, by) => (
            <select id={id} aria-describedby={by} className={input} value={d.type} onChange={(e) => pickType(e.target.value as Property['type'])}>
              {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{PROPERTY_TYPE_LABELS[t]}</option>)}
            </select>
          )}
        </Field>
        <label className="flex items-center gap-2 text-[14px] font-semibold text-ink-strong">
          <input type="checkbox" checked={d.required} onChange={(e) => edit({ required: e.target.checked })} />Required
        </label>
        {err('required-hidden') && <p role="alert" className="-mt-2 text-[12px] text-warning">{err('required-hidden')}</p>}

        {d.type === 'enum' && (
          <Field label="Allowed values" error={err('enum-no-values', 'duplicate-values')} hint="One value per line. Authors choose from these.">
            {(id, by) => <textarea id={id} aria-describedby={by} className={`${area} font-mono text-[13px]`} rows={4} value={valuesText} onChange={(e) => onValues(e.target.value)} spellCheck={false} />}
          </Field>
        )}

        <Field label="Default value" error={defError || err('default-not-allowed')} hint="Leave empty for no default.">
          {(id, by) => d.type === 'boolean' ? (
            <select id={id} aria-describedby={by} className={input} value={d.defaultValue === null ? '' : String(d.defaultValue)} onChange={(e) => { onDefaultText(e.target.value) }}>
              <option value="">No default</option><option value="true">True</option><option value="false">False</option>
            </select>
          ) : d.type === 'enum' && d.allowedValues.length ? (
            <select id={id} aria-describedby={by} className={input} aria-invalid={!!err('default-not-allowed')} value={d.defaultValue === null ? '' : String(d.defaultValue)} onChange={(e) => onDefaultText(e.target.value)}>
              <option value="">No default</option>
              {d.defaultValue !== null && !d.allowedValues.includes(String(d.defaultValue)) && <option value={String(d.defaultValue)}>{String(d.defaultValue)} (not in the list)</option>}
              {d.allowedValues.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          ) : d.type === 'text' || d.type === 'richtext' ? (
            <textarea id={id} aria-describedby={by} className={area} rows={3} value={defText} onChange={(e) => onDefaultText(e.target.value)} />
          ) : (
            <input id={id} aria-describedby={by} aria-invalid={!!defError} className={input} type={d.type === 'number' ? 'number' : 'text'} value={defText} onChange={(e) => onDefaultText(e.target.value)} />
          )}
        </Field>

        <Field label="Description" hint="Helper text shown under the field.">
          {(id, by) => <textarea id={id} aria-describedby={by} className={area} rows={3} value={d.description} onChange={(e) => edit({ description: e.target.value })} />}
        </Field>
        <Field label="Group" hint="The tab this field appears on. Use “Tab › Section” to place it in a section.">
          {(id, by) => (
            <>
              <input id={id} aria-describedby={by} className={input} list={`${id}-groups`} value={d.group} onChange={(e) => edit({ group: e.target.value })} placeholder="No group" />
              <datalist id={`${id}-groups`}>{groups.map((g) => <option key={g} value={g} />)}</datalist>
            </>
          )}
        </Field>

        <p className="text-[12px] text-ink-muted">
          Source: {originLabel[property.origin.kind]}{property.origin.ref ? ` · ${property.origin.ref}` : ''}
          {property.origin.suggested && ' · suggested, not yet confirmed. Any edit confirms it.'}
        </p>

        <div className="border-t border-hairline pt-4">
          <Button type="button" variant="outline" className="!border-danger !text-danger" onClick={onRemove}><Trash2 size={15} aria-hidden="true" />Remove property</Button>
        </div>
      </form>
  )
}
