import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, CircleAlert, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { SidePanel } from '../../../components/ui/SidePanel'
import { Button } from '../../../components/ui/Button'
import { parseDefaultInput } from '../../components/ops'
import type { Property } from '../../components/schema'
import { fieldTypeWarning, suggestFieldType, type ResolvedField } from '../engine'
import { FIELD_TYPES, fieldTypeList, type ConstraintSpec } from '../fieldTypes'
import type { FieldTypeId, MappingOverrides, Subfield } from '../schema'
import type { FieldIssue } from '../validate'

const input = 'h-9 w-full rounded-lg border border-hairline-strong bg-surface px-3 text-ink-strong aria-[invalid=true]:border-danger'
const area = 'w-full rounded-lg border border-hairline-strong bg-surface px-3 py-2 text-ink-strong'

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: ReactNode; children: (id: string, by: string) => ReactNode }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[13px] font-bold text-ink-strong">{label}</label>
      {children(id, `${id}-d`)}
      <p id={`${id}-d`} role={error ? 'alert' : undefined} className={`mt-1 text-[12px] ${error ? 'text-danger' : 'text-ink-muted'}`}>{error ?? hint}</p>
    </div>
  )
}

export interface FieldActions {
  /** Resolves with the names of settings that no longer applied and were removed. */
  setFieldType: (t: FieldTypeId) => Promise<string[]>
  setOverrides: (patch: Partial<{ [K in keyof MappingOverrides]: MappingOverrides[K] | undefined }>) => void
  setConstraint: (key: string, value: string | number | boolean | undefined) => void
  setMultifield: (patch: { composite?: boolean; itemFieldType?: 'textfield' | 'textarea' | 'numberfield' | 'pathfield' }) => void
  addSubfield: () => void
  patchSubfield: (id: string, patch: Partial<Omit<Subfield, 'id'>>) => void
  removeSubfield: (id: string) => void
  reset: () => void
}

export function FieldPanel({ open, property, field, issues, groups, actions, onClose }: {
  open: boolean; property: Property; field: ResolvedField; issues: FieldIssue[]; groups: string[]; actions: FieldActions; onClose: () => void
}) {
  return (
    <SidePanel open={open} title={`Field: ${property.label || property.key}`} onClose={onClose}>
      <FieldForm key={property.id} property={property} field={field} issues={issues} groups={groups} actions={actions} />
    </SidePanel>
  )
}

/** The form for one field. Used in the side panel and, with `inline`, in the dialog editor's right-hand panel. */
export function FieldForm({ property, field, issues, groups, actions, inline = false }: { property: Property; field: ResolvedField; issues: FieldIssue[]; groups: string[]; actions: FieldActions; inline?: boolean }) {
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => { if (!inline) ref.current?.querySelector<HTMLElement>('select,input,textarea')?.focus({ preventScroll: true }) }, [inline])
  const def = FIELD_TYPES[field.fieldType]
  const [label, setLabel] = useState(field.label)
  const [name, setName] = useState(field.name)
  const [desc, setDesc] = useState(field.description)
  const [valuesText, setValuesText] = useState(field.allowedValues.join('\n'))
  const [defText, setDefText] = useState(field.defaultValue === null ? '' : String(field.defaultValue))
  const [defError, setDefError] = useState('')
  const [dropped, setDropped] = useState<string[]>([])
  const err = (...codes: FieldIssue['code'][]) => issues.find((i) => codes.includes(i.code))?.message
  const warn = fieldTypeWarning(property, field.fieldType)
  const suggested = suggestFieldType(property)

  const changeType = (t: FieldTypeId) => {
    setDefError('')
    void actions.setFieldType(t).then(setDropped)
  }
  const onDefault = (text: string) => {
    setDefText(text)
    const kind = field.fieldType === 'numberfield' ? 'number' : field.fieldType === 'checkbox' || field.fieldType === 'switch' ? 'boolean' : 'string'
    const parsed = parseDefaultInput(kind, text)
    setDefError(parsed.error ?? '')
    if (!parsed.error) actions.setOverrides({ defaultValue: parsed.value })
  }
  const defaultless = field.fieldType === 'multifield' || field.fieldType === 'fileupload'

  return (
    <form ref={ref} onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-4">
      <Field label="AEM field type" hint={<>{def.description}{field.fieldType !== suggested && <> Suggested for this property: {FIELD_TYPES[suggested].label}.</>}</>}>
        {(id, by) => (
          <select id={id} aria-describedby={by} className={input} value={field.fieldType} onChange={(e) => changeType(e.target.value as FieldTypeId)}>
            {fieldTypeList.map((f) => <option key={f.id} value={f.id}>{f.label}{f.id === suggested ? ' (suggested)' : ''}</option>)}
          </select>
        )}
      </Field>
      {warn && <p role="status" className="-mt-2 rounded-lg bg-warning-soft p-2.5 text-[12px] text-warning">{warn}</p>}
      {dropped.length > 0 && <p role="status" className="-mt-2 rounded-lg bg-info-soft p-2.5 text-[12px] text-info">Settings that do not apply to a {def.label} were removed: {dropped.join(', ')}.</p>}

      <div>
        <p className="mb-1 text-[13px] font-bold text-ink-strong">Granite resource type</p>
        <code className="block break-all rounded-lg bg-sand px-3 py-2 text-[12px] text-ink-strong">{field.resourceType}</code>
      </div>

      {field.fieldType !== 'hidden' && (
        <Field label="Field label" error={err('label-empty')} hint={field.fieldType === 'checkbox' || field.fieldType === 'switch' ? 'Shown next to the control.' : 'What authors see above the field.'}>
          {(id, by) => <input id={id} aria-describedby={by} aria-invalid={!!err('label-empty')} className={input} value={label} onChange={(e) => { setLabel(e.target.value); actions.setOverrides({ label: e.target.value }) }} />}
        </Field>
      )}
      <Field label="Field name" error={err('name-invalid', 'name-duplicate')} hint="Where the value is saved, e.g. ./title. Use ./group/title to save under a child node.">
        {(id, by) => <input id={id} aria-describedby={by} aria-invalid={!!err('name-invalid', 'name-duplicate')} className={`${input} font-mono text-[13px]`} spellCheck={false} value={name} onChange={(e) => { setName(e.target.value); actions.setOverrides({ name: e.target.value }) }} />}
      </Field>

      {!defaultless && (
        <Field label="Default value" error={defError || err('default-not-allowed', 'default-type', 'date-format')} hint="Leave empty for no default.">
          {(id, by) => field.fieldType === 'checkbox' || field.fieldType === 'switch' ? (
            <select id={id} aria-describedby={by} className={input} value={field.defaultValue === null ? '' : String(field.defaultValue)} onChange={(e) => onDefault(e.target.value)}>
              <option value="">No default</option><option value="true">On (true)</option><option value="false">Off (false)</option>
            </select>
          ) : field.fieldType === 'select' && field.allowedValues.length ? (
            <select id={id} aria-describedby={by} className={input} value={field.defaultValue === null ? '' : String(field.defaultValue)} onChange={(e) => onDefault(e.target.value)}>
              <option value="">No default</option>
              {field.defaultValue !== null && !field.allowedValues.includes(String(field.defaultValue)) && <option value={String(field.defaultValue)}>{String(field.defaultValue)} (not a choice)</option>}
              {field.allowedValues.map((v) => <option key={v}>{v}</option>)}
            </select>
          ) : field.fieldType === 'textarea' || field.fieldType === 'richtext' ? (
            <textarea id={id} aria-describedby={by} className={area} rows={3} value={defText} onChange={(e) => onDefault(e.target.value)} />
          ) : (
            <input id={id} aria-describedby={by} aria-invalid={!!defError} className={input} type={field.fieldType === 'numberfield' ? 'number' : 'text'} value={defText} onChange={(e) => onDefault(e.target.value)} />
          )}
        </Field>
      )}
      {defaultless && <p className="text-[12px] text-ink-muted">A {def.label} has no default value.</p>}

      <label className="flex items-center gap-2 text-[14px] font-semibold text-ink-strong">
        <input type="checkbox" checked={field.required} onChange={(e) => actions.setOverrides({ required: e.target.checked })} />Required
      </label>

      <Field label="Description" hint="Helper text shown under the field.">
        {(id, by) => <textarea id={id} aria-describedby={by} className={area} rows={2} value={desc} onChange={(e) => { setDesc(e.target.value); actions.setOverrides({ description: e.target.value }) }} />}
      </Field>

      {field.fieldType === 'select' && (
        <Field label="Allowed values" error={err('select-no-items')} hint="One choice per line. These become the select's items.">
          {(id, by) => <textarea id={id} aria-describedby={by} className={`${area} font-mono text-[13px]`} rows={4} spellCheck={false} value={valuesText}
            onChange={(e) => { setValuesText(e.target.value); actions.setOverrides({ allowedValues: e.target.value.split('\n').map((v) => v.trim()).filter(Boolean) }) }} />}
        </Field>
      )}

      {!inline && <Field label="Starting group" hint="Used when the dialog is built or rebuilt from groups: “Tab” or “Tab › Section”. Move fields between tabs in the Dialog view.">
        {(id, by) => (
          <>
            <input id={id} aria-describedby={by} className={input} list={`${id}-g`} defaultValue={field.group} placeholder="No group" onChange={(e) => actions.setOverrides({ group: e.target.value })} />
            <datalist id={`${id}-g`}>{groups.map((g) => <option key={g} value={g} />)}</datalist>
          </>
        )}
      </Field>}

      {def.constraints.length > 0 && (
        <fieldset key={field.fieldType} className="rounded-lg border border-hairline p-3">
          <legend className="px-1 text-[13px] font-bold text-ink-strong">Validation and options</legend>
          <div className="flex flex-col gap-3">
            {def.constraints.map((c) => <Constraint key={c.key} spec={c} value={field.constraints[c.key]} error={constraintError(c.key, issues)} onChange={(v) => actions.setConstraint(c.key, v)} />)}
          </div>
        </fieldset>
      )}

      {field.fieldType === 'multifield' && field.multifield && (
        <fieldset className="rounded-lg border border-hairline p-3">
          <legend className="px-1 text-[13px] font-bold text-ink-strong">Items</legend>
          <label className="flex items-center gap-2 text-[14px] font-semibold text-ink-strong">
            <input type="checkbox" checked={field.multifield.composite} onChange={(e) => actions.setMultifield({ composite: e.target.checked })} />Each item has several fields
          </label>
          {!field.multifield.composite ? (
            <Field label="Each item is a" hint="A simple list of single values.">
              {(id, by) => (
                <select id={id} aria-describedby={by} className={input} value={field.multifield!.itemFieldType} onChange={(e) => actions.setMultifield({ itemFieldType: e.target.value as 'textfield' })}>
                  <option value="textfield">Textfield</option><option value="textarea">Textarea</option><option value="numberfield">Numberfield</option><option value="pathfield">Pathfield</option>
                </select>
              )}
            </Field>
          ) : (
            <div className="mt-3">
              {err('composite-no-subfields') && <p role="alert" className="mb-2 text-[12px] text-danger">{err('composite-no-subfields')}</p>}
              <ul aria-label="Fields in each item" className="space-y-2">
                {field.multifield.subfields.map((sf, i) => (
                  <li key={sf.id} className="rounded-lg bg-sand p-2.5">
                    <div className="flex gap-2">
                      <input aria-label={`Item field ${i + 1} name`} className={`${input} h-8 font-mono text-[12px]`} defaultValue={sf.key} spellCheck={false} onChange={(e) => actions.patchSubfield(sf.id, { key: e.target.value })} />
                      <input aria-label={`Item field ${i + 1} label`} className={`${input} h-8 text-[13px]`} defaultValue={sf.label} onChange={(e) => actions.patchSubfield(sf.id, { label: e.target.value })} />
                      <button type="button" aria-label={`Remove item field ${i + 1}`} className="rounded-lg p-1.5 text-ink-muted hover:bg-hairline/60 cursor-pointer" onClick={() => actions.removeSubfield(sf.id)}><Trash2 size={15} aria-hidden="true" /></button>
                    </div>
                    <select aria-label={`Item field ${i + 1} type`} className={`${input} mt-2 h-8 text-[13px]`} value={sf.fieldType} onChange={(e) => actions.patchSubfield(sf.id, { fieldType: e.target.value as Subfield['fieldType'] })}>
                      {(['textfield', 'textarea', 'numberfield', 'checkbox', 'pathfield', 'select', 'hidden'] as const).map((t) => <option key={t} value={t}>{FIELD_TYPES[t].label}</option>)}
                    </select>
                    {sf.fieldType === 'select' && (
                      <textarea aria-label={`Item field ${i + 1} allowed values`} placeholder="One choice per line" className={`${area} mt-2 text-[13px]`} rows={2} defaultValue={sf.allowedValues.join('\n')}
                        onChange={(e) => actions.patchSubfield(sf.id, { allowedValues: e.target.value.split('\n').map((v) => v.trim()).filter(Boolean) })} />
                    )}
                  </li>
                ))}
              </ul>
              <Button type="button" size="sm" variant="outline" className="mt-2" onClick={actions.addSubfield}><Plus size={14} aria-hidden="true" />Add field to each item</Button>
            </div>
          )}
        </fieldset>
      )}

      <section aria-label="Validation" className="border-t border-hairline pt-4">
        <h3 className="text-[13px] font-extrabold text-ink-strong">Validation</h3>
        {issues.length === 0 ? (
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-success"><CheckCircle2 size={15} aria-hidden="true" />No problems found by the generator checks. This does not test against AEM.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {issues.map((i, k) => (
              <li key={k} className={`flex items-start gap-1.5 text-[13px] ${i.level === 'error' ? 'text-danger' : 'text-warning'}`}>
                {i.level === 'error' ? <CircleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />}
                <span><span className="sr-only">{i.level}: </span>{i.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div>
        <Button type="button" variant="outline" size="sm" disabled={!field.edited} onClick={actions.reset}><RotateCcw size={14} aria-hidden="true" />Reset to suggestion</Button>
      </div>
    </form>
  )
}

const constraintError = (key: string, issues: FieldIssue[]) =>
  issues.find((i) => (i.code === 'constraint-range' || i.code === 'constraint-unknown') && (
    (key === 'maxlength' && /Maximum length/.test(i.message)) || (key === 'rows' && /rows/.test(i.message)) || (key === 'step' && /Step/.test(i.message)) ||
    ((key === 'min' || key === 'max') && /Minimum|minimum|maximum/.test(i.message))
  ))?.message

function Constraint({ spec, value, error, onChange }: { spec: ConstraintSpec; value: string | number | boolean | undefined; error?: string; onChange: (v: string | number | boolean | undefined) => void }) {
  const id = useId()
  if (spec.kind === 'boolean') {
    const checked = typeof value === 'boolean' ? value : false
    return (
      <div>
        <label className="flex items-center gap-2 text-[13px] font-semibold text-ink-strong"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{spec.label}</label>
        {spec.hint && <p className="ml-6 text-[12px] text-ink-muted">{spec.hint}</p>}
      </div>
    )
  }
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[13px] font-bold text-ink-strong">{spec.label}</label>
      {spec.kind === 'choice' ? (
        <select id={id} className={input} value={String(value ?? spec.default ?? '')} onChange={(e) => onChange(e.target.value)}>{spec.choices!.map((c) => <option key={c}>{c}</option>)}</select>
      ) : spec.kind === 'number' ? (
        <input id={id} type="number" aria-invalid={!!error} className={input} defaultValue={typeof value === 'number' ? value : ''} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />
      ) : (
        <input id={id} aria-invalid={!!error} className={input} defaultValue={typeof value === 'string' ? value : ''} placeholder={typeof spec.default === 'string' ? spec.default : undefined} onChange={(e) => onChange(e.target.value)} />
      )}
      {(error || spec.hint) && <p role={error ? 'alert' : undefined} className={`mt-1 text-[12px] ${error ? 'text-danger' : 'text-ink-muted'}`}>{error ?? spec.hint}</p>}
    </div>
  )
}
