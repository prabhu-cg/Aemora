import { toKey } from '../components/detect'
import { COMPATIBLE, FIELD_TYPES } from './fieldTypes'
import type { ComponentDef, Property } from '../components/schema'
import type { FieldTypeId, Mapping, MultifieldConfig } from './schema'

type Scalar = string | number | boolean

/** Deterministic: the same property always gets the same suggestion. */
export function suggestFieldType(p: Pick<Property, 'type'>): FieldTypeId {
  return COMPATIBLE[p.type][0]
}

export function fieldTypeWarning(p: Pick<Property, 'type'>, fieldType: FieldTypeId): string | null {
  if (COMPATIBLE[p.type].includes(fieldType)) return null
  const usual = COMPATIBLE[p.type].slice(0, 2).map((f) => FIELD_TYPES[f].label).join(' or ')
  return `A ${p.type} property is usually edited with a ${usual}. ${FIELD_TYPES[fieldType].label} may not fit.`
}

/** Convert a design default to what this field type can hold. Returns null when it cannot. */
export function defaultForField(fieldType: FieldTypeId, value: Scalar | null): Scalar | null {
  if (value === null) return null
  switch (fieldType) {
    case 'checkbox':
    case 'switch':
      if (typeof value === 'boolean') return value
      return /^(true|false)$/i.test(String(value)) ? String(value).toLowerCase() === 'true' : null
    case 'numberfield': {
      const n = typeof value === 'number' ? value : Number(String(value).trim())
      return String(value).trim() !== '' && Number.isFinite(n) ? n : null
    }
    case 'multifield':
    case 'fileupload':
      return null // defaults do not apply to these fields
    default:
      return typeof value === 'string' ? value : String(value)
  }
}

export function defaultConstraints(p: Pick<Property, 'type'>, fieldType: FieldTypeId): Record<string, Scalar> {
  const out: Record<string, Scalar> = {}
  for (const c of FIELD_TYPES[fieldType].constraints) if (c.default !== undefined) out[c.key] = c.default
  if (fieldType === 'pathfield') out.rootPath = p.type === 'image' ? '/content/dam' : '/content'
  return out
}

export function defaultMultifield(p: Pick<Property, 'key' | 'label'>): MultifieldConfig {
  const link = /link|url|path/i.test(`${p.key} ${p.label}`)
  return { composite: false, itemFieldType: link ? 'pathfield' : 'textfield', subfields: [] }
}

export interface ResolvedField {
  componentId: string
  propertyId: string
  key: string
  fieldType: FieldTypeId
  resourceType: string
  label: string
  /** JCR property the author's value is stored in, e.g. ./label */
  name: string
  defaultValue: Scalar | null
  required: boolean
  description: string
  allowedValues: string[]
  constraints: Record<string, Scalar>
  /** Dialog grouping: a tab name, or "Tab › Section". */
  group: string
  /** Only shown when another field is checked, or has this value. */
  showWhen?: { propertyId: string; value?: string }
  multifield?: MultifieldConfig
  /** The user chose this field type. */
  manual: boolean
  /** The user changed anything about this field. */
  edited: boolean
  /** Things the engine had to change or could not carry over, so nothing disappears silently. */
  notes: string[]
}

export function resolveField(component: Pick<ComponentDef, 'id'>, p: Property, m?: Mapping): ResolvedField {
  const fieldType = m?.fieldType ?? suggestFieldType(p)
  const o = m?.overrides ?? {}
  const notes: string[] = []

  let defaultValue: Scalar | null
  if (o.defaultValue !== undefined) defaultValue = o.defaultValue
  else {
    defaultValue = defaultForField(fieldType, p.defaultValue)
    if (p.defaultValue !== null && defaultValue === null) {
      notes.push(`The design default "${String(p.defaultValue)}" was not carried over: a ${FIELD_TYPES[fieldType].label} cannot hold it.`)
    }
  }

  const warn = fieldTypeWarning(p, fieldType)
  if (warn) notes.push(warn)

  const multifield = fieldType === 'multifield' ? (m?.multifield ?? defaultMultifield(p)) : undefined
  return {
    componentId: component.id,
    propertyId: p.id,
    key: p.key,
    fieldType,
    resourceType: FIELD_TYPES[fieldType].resourceType,
    label: o.label ?? p.label,
    name: o.name ?? `./${p.key || toKey(p.label)}`,
    defaultValue,
    required: o.required ?? p.required,
    description: o.description ?? p.description,
    allowedValues: o.allowedValues ?? p.allowedValues,
    constraints: { ...defaultConstraints(p, fieldType), ...(m?.constraints ?? {}) },
    group: o.group ?? p.group,
    showWhen: o.showWhen,
    multifield,
    manual: m?.manual ?? false,
    edited: !!m && (m.manual || Object.keys(o).length > 0 || Object.keys(m.constraints).length > 0 || !!m.multifield),
    notes,
  }
}

export function resolveComponent(component: ComponentDef, mappings: Mapping[]): ResolvedField[] {
  const byProp = new Map(mappings.filter((m) => m.componentId === component.id).map((m) => [m.propertyId, m]))
  return component.properties.map((p) => resolveField(component, p, byProp.get(p.id)))
}
