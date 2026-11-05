import type { ResolvedField } from '../mapping/engine'
import { hasEmptyOption } from '../mapping/nodes'

export type Scalar = string | number | boolean
export type Item = Record<string, Scalar>
/** What a simulated field holds while someone fills it in. Numbers are kept as text, like an input. */
export type Value = string | boolean | string[] | Item[]

export const isMulti = (f: ResolvedField) => f.constraints.multiple === true

export function initialValue(f: ResolvedField): Value {
  const d = f.defaultValue
  switch (f.fieldType) {
    case 'checkbox':
    case 'switch': return d === true
    case 'numberfield': return typeof d === 'number' ? String(d) : ''
    case 'multifield': return [] as Item[]
    case 'tagfield': return []
    case 'select':
      if (isMulti(f)) return d === null ? [] : [String(d)]
      return d !== null ? String(d) : hasEmptyOption(f) ? '' : (f.allowedValues[0] ?? '')
    case 'pathfield': return isMulti(f) ? (d === null ? [] : [String(d)]) : d === null ? '' : String(d)
    case 'fileupload': return ''
    default: return d === null ? '' : String(d)
  }
}

/** Keep a stored value usable if the field type changed under it. */
export function coerceValue(f: ResolvedField, v: Value | undefined): Value {
  if (v === undefined) return initialValue(f)
  const init = initialValue(f)
  if (typeof init === 'boolean') return typeof v === 'boolean' ? v : init
  if (typeof init === 'string') return typeof v === 'string' ? v : init
  if (f.fieldType === 'multifield') return Array.isArray(v) && v.every((x) => typeof x === 'object') ? (v as Item[]) : []
  return Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : []
}

export function isEmpty(f: ResolvedField, v: Value): boolean {
  if (f.fieldType === 'checkbox' || f.fieldType === 'switch') return v !== true
  if (Array.isArray(v)) return v.length === 0
  return typeof v === 'string' ? v.trim() === '' : false
}

/** Simulated validation. It checks only what this dialog configures; AEM's own checks may differ. */
export function validateValue(f: ResolvedField, v: Value): string | null {
  if (f.fieldType === 'hidden') return null
  if (f.required && isEmpty(f, v)) {
    return f.fieldType === 'checkbox' || f.fieldType === 'switch' ? 'This must be switched on.' : 'This field is required.'
  }
  const c = f.constraints
  if (typeof v === 'string' && v !== '') {
    if ((f.fieldType === 'textfield' || f.fieldType === 'textarea') && typeof c.maxlength === 'number' && v.length > c.maxlength) return `Use at most ${c.maxlength} characters.`
    if (f.fieldType === 'numberfield') {
      const n = Number(v)
      if (!Number.isFinite(n)) return 'Enter a number.'
      if (typeof c.min === 'number' && n < c.min) return `Enter ${c.min} or more.`
      if (typeof c.max === 'number' && n > c.max) return `Enter ${c.max} or less.`
      if (typeof c.step === 'number' && c.step > 0) {
        const base = typeof c.min === 'number' ? c.min : 0
        const q = (n - base) / c.step
        if (Math.abs(q - Math.round(q)) > 1e-9) return `Use steps of ${c.step}.`
      }
    }
  }
  return null
}

const keyOf = (name: string) => name

/**
 * The values this dialog would save, keyed by field name, typed the way the dialog's
 * @TypeHint settings would store them. A simulation: no repository is involved.
 */
export function toSaved(fields: ResolvedField[], values: Map<string, Value>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    const v = coerceValue(f, values.get(f.propertyId))
    const name = keyOf(f.name)
    if (f.fieldType === 'hidden') { if (f.defaultValue !== null) out[name] = f.defaultValue; continue }
    if (f.fieldType === 'numberfield') { if (typeof v === 'string' && v !== '') out[name] = Number(v); continue }
    if (f.fieldType === 'checkbox' || f.fieldType === 'switch') { out[name] = v === true; continue }
    if (f.fieldType === 'multifield') {
      const items = v as Item[]
      if (!items.length) continue
      const mf = f.multifield
      if (mf?.composite) {
        out[name] = items.map((it) => Object.fromEntries(mf.subfields.map((sf) => {
          const raw = it[sf.key]
          return [sf.key, sf.fieldType === 'numberfield' ? (raw === '' || raw === undefined ? null : Number(raw)) : sf.fieldType === 'checkbox' ? raw === true : (raw ?? '')]
        })))
      } else {
        out[name] = items.map((it) => (mf?.itemFieldType === 'numberfield' && it.value !== '' ? Number(it.value) : String(it.value ?? '')))
      }
      continue
    }
    if (typeof v === 'string') { if (v !== '') out[name] = v; continue }
    if (Array.isArray(v) && v.length) out[name] = v
  }
  return out
}
