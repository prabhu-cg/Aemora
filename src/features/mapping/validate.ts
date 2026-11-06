import { KEY_PATTERN } from '../components/validate'
import { FIELD_TYPES } from './fieldTypes'
import type { ResolvedField } from './engine'

export interface FieldIssue {
  level: 'error' | 'warning'
  code:
    | 'label-empty' | 'name-invalid' | 'name-duplicate' | 'select-no-items' | 'default-not-allowed' | 'default-type'
    | 'required-hidden' | 'composite-no-subfields' | 'subfield-key' | 'subfield-duplicate' | 'subfield-select-no-items'
    | 'constraint-range' | 'constraint-unknown' | 'date-format' | 'note'
    | 'show-when-missing' | 'show-when-type' | 'show-when-self' | 'show-when-value' | 'show-when-cycle'
  message: string
  propertyId: string
}

export const NAME_PATTERN = /^\.\/[A-Za-z][A-Za-z0-9_-]*(:[A-Za-z][A-Za-z0-9_-]*)?(\/[A-Za-z][A-Za-z0-9_-]*(:[A-Za-z][A-Za-z0-9_-]*)?)*$/

/** Generator-level checks for one field. These say nothing about a running AEM instance. */
export function validateField(r: ResolvedField): FieldIssue[] {
  const out: FieldIssue[] = []
  const add = (level: FieldIssue['level'], code: FieldIssue['code'], message: string) => out.push({ level, code, message, propertyId: r.propertyId })
  const c = r.constraints

  if (r.fieldType !== 'hidden' && !r.label.trim()) add('error', 'label-empty', 'The field needs a label authors can read.')
  if (!NAME_PATTERN.test(r.name)) add('error', 'name-invalid', 'The field name must look like ./myField: start with ./ then a letter, then letters, numbers, hyphens or underscores.')

  if (r.fieldType === 'select') {
    if (!r.allowedValues.length) add('error', 'select-no-items', 'A select needs at least one choice. Add allowed values.')
    else if (r.defaultValue !== null && !r.allowedValues.includes(String(r.defaultValue))) add('error', 'default-not-allowed', `The default "${r.defaultValue}" is not one of the choices.`)
  }
  if ((r.fieldType === 'checkbox' || r.fieldType === 'switch') && r.defaultValue !== null && typeof r.defaultValue !== 'boolean') add('error', 'default-type', 'The default for a checkbox or switch must be true or false.')
  if (r.fieldType === 'numberfield' && r.defaultValue !== null && typeof r.defaultValue !== 'number') add('error', 'default-type', 'The default for a number field must be a number.')
  if (r.fieldType === 'datepicker' && r.defaultValue !== null && c.type !== 'datetime' && !/^\d{4}-\d{2}-\d{2}$/.test(String(r.defaultValue))) add('error', 'date-format', 'A date default must look like 2025-01-31.')
  if (r.fieldType === 'hidden' && r.required) add('warning', 'required-hidden', 'A hidden field cannot be filled in by authors, so it should not be required.')

  const nonNeg = (k: string) => typeof c[k] === 'number' && (!Number.isInteger(c[k]) || (c[k] as number) < 1)
  if (nonNeg('maxlength')) add('error', 'constraint-range', 'Maximum length must be a whole number of 1 or more.')
  if (nonNeg('rows')) add('error', 'constraint-range', 'Visible rows must be a whole number of 1 or more.')
  if (typeof c.step === 'number' && c.step <= 0) add('error', 'constraint-range', 'Step must be greater than 0.')
  if (typeof c.min === 'number' && typeof c.max === 'number' && c.min > c.max) add('error', 'constraint-range', 'Minimum cannot be greater than the maximum.')
  if (r.fieldType === 'numberfield' && typeof r.defaultValue === 'number') {
    if (typeof c.min === 'number' && r.defaultValue < c.min) add('error', 'constraint-range', 'The default is below the minimum.')
    if (typeof c.max === 'number' && r.defaultValue > c.max) add('error', 'constraint-range', 'The default is above the maximum.')
  }

  const known = new Set(FIELD_TYPES[r.fieldType].constraints.map((x) => x.key))
  for (const k of Object.keys(c)) {
    if (!known.has(k) && !(r.fieldType === 'pathfield' && k === 'rootPath')) add('warning', 'constraint-unknown', `The setting "${k}" does not apply to a ${FIELD_TYPES[r.fieldType].label} and is ignored.`)
  }

  if (r.fieldType === 'multifield' && r.multifield?.composite) {
    const sf = r.multifield.subfields
    if (!sf.length) add('error', 'composite-no-subfields', 'A composite multifield needs at least one field per item.')
    const seen = new Set<string>()
    for (const f of sf) {
      if (!KEY_PATTERN.test(f.key)) add('error', 'subfield-key', `"${f.key || 'unnamed'}" is not a valid field name. Start with a letter and use letters, numbers, hyphens or underscores.`)
      else if (seen.has(f.key)) add('error', 'subfield-duplicate', `Two fields in each item are named "${f.key}".`)
      seen.add(f.key)
      if (f.fieldType === 'select' && !f.allowedValues.length) add('error', 'subfield-select-no-items', `The select "${f.label || f.key}" needs at least one choice.`)
    }
  }

  for (const n of r.notes) add('warning', 'note', n)
  return out
}

/** Which field types can drive another field's visibility. */
export const SHOW_WHEN_CONTROLLERS = ['checkbox', 'switch', 'select'] as const

function validateShowWhen(fields: ResolvedField[]): FieldIssue[] {
  const out: FieldIssue[] = []
  const byId = new Map(fields.map((f) => [f.propertyId, f]))
  const add = (f: ResolvedField, code: FieldIssue['code'], message: string) => out.push({ level: 'error', code, message, propertyId: f.propertyId })
  for (const f of fields) {
    const w = f.showWhen
    if (!w) continue
    const c = byId.get(w.propertyId)
    if (w.propertyId === f.propertyId) { add(f, 'show-when-self', 'A field cannot decide whether it is shown itself. Pick another field.'); continue }
    if (!c) { add(f, 'show-when-missing', 'The field this one depends on no longer exists. Pick another, or remove the condition.'); continue }
    if (!(SHOW_WHEN_CONTROLLERS as readonly string[]).includes(c.fieldType)) { add(f, 'show-when-type', `“${c.label}” is a ${FIELD_TYPES[c.fieldType].label}. Only a checkbox, switch or select can decide whether another field is shown.`); continue }
    if (c.fieldType === 'select' && (!w.value || !c.allowedValues.includes(w.value))) {
      add(f, 'show-when-value', w.value ? `“${w.value}” is not one of the choices of “${c.label}”.` : `Choose which value of “${c.label}” shows this field.`)
    }
    // A chain that comes back to itself would leave every field in it hidden for good.
    const seen = new Set([f.propertyId])
    for (let cur: ResolvedField | undefined = c; cur?.showWhen; cur = byId.get(cur.showWhen.propertyId)) {
      if (seen.has(cur.propertyId)) break
      seen.add(cur.propertyId)
      if (cur.showWhen.propertyId === f.propertyId) { add(f, 'show-when-cycle', `“${f.label}” and “${c.label}” each wait for the other to be shown, so neither would ever appear.`); break }
    }
  }
  return out
}

/** All fields of a component, plus checks that span fields (names must be unique). */
export function validateFields(fields: ResolvedField[]): FieldIssue[] {
  const out = fields.flatMap(validateField)
  const byName = new Map<string, ResolvedField[]>()
  for (const f of fields) byName.set(f.name, [...(byName.get(f.name) ?? []), f])
  for (const [name, group] of byName) {
    if (group.length > 1) for (const f of group) out.push({ level: 'error', code: 'name-duplicate', message: `Another field also saves to ${name}. Field names must be unique.`, propertyId: f.propertyId })
  }
  out.push(...validateShowWhen(fields))
  return out
}
