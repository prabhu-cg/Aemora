import { newId } from '../../lib/id'
import type { ComponentDef, Property } from '../components/schema'
import { FIELD_TYPES } from './fieldTypes'
import { defaultMultifield, suggestFieldType } from './engine'
import type { FieldTypeId, Mapping, MappingOverrides, MultifieldConfig, Subfield } from './schema'

type Scalar = string | number | boolean

const blank = (c: Pick<ComponentDef, 'id'>, p: Property): Mapping => ({
  id: newId(), componentId: c.id, propertyId: p.id, fieldType: suggestFieldType(p), manual: false, overrides: {}, constraints: {},
})

const find = (ms: Mapping[], propertyId: string) => ms.find((m) => m.propertyId === propertyId)

/** Keep the store minimal: a mapping that matches the suggestion exactly is not stored. */
function tidy(ms: Mapping[], p: Property): Mapping[] {
  const m = find(ms, p.id)
  if (!m) return ms
  const empty = !m.manual && Object.keys(m.overrides).length === 0 && Object.keys(m.constraints).length === 0 && !m.multifield
  return empty ? ms.filter((x) => x !== m) : ms
}

const put = (ms: Mapping[], next: Mapping) => (ms.some((m) => m.id === next.id) ? ms.map((m) => (m.id === next.id ? next : m)) : [...ms, next])

/** Drop overrides that now equal what the property already says. */
function normalize(p: Property, o: MappingOverrides): MappingOverrides {
  const out: MappingOverrides = { ...o }
  if (out.label === p.label) delete out.label
  if (out.name === `./${p.key}`) delete out.name
  if (out.required === p.required) delete out.required
  if (out.description === p.description) delete out.description
  if (out.group === p.group) delete out.group
  if (out.allowedValues && JSON.stringify(out.allowedValues) === JSON.stringify(p.allowedValues)) delete out.allowedValues
  if ('defaultValue' in out && out.defaultValue === p.defaultValue) delete out.defaultValue
  return out
}

export interface TypeChange { mappings: Mapping[]; dropped: string[] }

/** Choose a field type. Settings that do not apply to the new type are removed and reported. */
export function setFieldType(ms: Mapping[], c: Pick<ComponentDef, 'id'>, p: Property, fieldType: FieldTypeId): TypeChange {
  const m = find(ms, p.id) ?? blank(c, p)
  const keep = new Set(FIELD_TYPES[fieldType].constraints.map((x) => x.key))
  const dropped = Object.keys(m.constraints).filter((k) => !keep.has(k))
  if (m.multifield && fieldType !== 'multifield') dropped.push('multifield items')
  const next: Mapping = {
    ...m, fieldType, manual: fieldType !== suggestFieldType(p),
    constraints: Object.fromEntries(Object.entries(m.constraints).filter(([k]) => keep.has(k))),
    multifield: fieldType === 'multifield' ? m.multifield : undefined,
  }
  return { mappings: tidy(put(ms, next), p), dropped }
}

export function setOverrides(ms: Mapping[], c: Pick<ComponentDef, 'id'>, p: Property, patch: Partial<{ [K in keyof MappingOverrides]: MappingOverrides[K] | undefined }>): Mapping[] {
  const m = find(ms, p.id) ?? blank(c, p)
  const merged = { ...m.overrides, ...patch } as MappingOverrides
  for (const k of Object.keys(merged) as (keyof MappingOverrides)[]) if (merged[k] === undefined && !(k === 'defaultValue')) delete merged[k]
  return tidy(put(ms, { ...m, overrides: normalize(p, merged) }), p)
}

export function setConstraint(ms: Mapping[], c: Pick<ComponentDef, 'id'>, p: Property, key: string, value: Scalar | undefined): Mapping[] {
  const m = find(ms, p.id) ?? blank(c, p)
  const constraints = { ...m.constraints }
  if (value === undefined || value === '') delete constraints[key]
  else constraints[key] = value
  return tidy(put(ms, { ...m, constraints }), p)
}

export function resetMapping(ms: Mapping[], propertyId: string): Mapping[] {
  return ms.filter((m) => m.propertyId !== propertyId)
}

/** Remove mappings whose component or property no longer exists. */
export function pruneMappings(ms: Mapping[], components: ComponentDef[]): Mapping[] {
  const live = new Set(components.flatMap((c) => c.properties.map((p) => `${c.id}:${p.id}`)))
  return ms.filter((m) => live.has(`${m.componentId}:${m.propertyId}`))
}

// ---- multifield ----

const withMultifield = (ms: Mapping[], c: Pick<ComponentDef, 'id'>, p: Property, fn: (mf: MultifieldConfig) => MultifieldConfig): Mapping[] => {
  const m = find(ms, p.id) ?? { ...blank(c, p), fieldType: 'multifield' as const }
  const next = fn(m.multifield ?? defaultMultifield(p))
  return put(ms, { ...m, fieldType: 'multifield', multifield: next })
}

export function setMultifield(ms: Mapping[], c: Pick<ComponentDef, 'id'>, p: Property, patch: Partial<Pick<MultifieldConfig, 'composite' | 'itemFieldType'>>): Mapping[] {
  return withMultifield(ms, c, p, (mf) => {
    const next = { ...mf, ...patch }
    // Turning composite on with nothing defined starts from a label and a link, the usual repeated link.
    if (patch.composite && !next.subfields.length) next.subfields = [newSubfield('label', 'Label', 'textfield'), newSubfield('link', 'Link', 'pathfield')]
    return next
  })
}

export const newSubfield = (key = 'field', label = 'Field', fieldType: Subfield['fieldType'] = 'textfield'): Subfield => ({ id: newId(), key, label, fieldType, allowedValues: [] })

export function addSubfield(ms: Mapping[], c: Pick<ComponentDef, 'id'>, p: Property): Mapping[] {
  return withMultifield(ms, c, p, (mf) => {
    let key = 'field'
    const taken = new Set(mf.subfields.map((s) => s.key))
    for (let i = 2; taken.has(key); i++) key = `field${i}`
    return { ...mf, subfields: [...mf.subfields, newSubfield(key, 'Field', 'textfield')] }
  })
}

export function patchSubfield(ms: Mapping[], c: Pick<ComponentDef, 'id'>, p: Property, subId: string, patch: Partial<Omit<Subfield, 'id'>>): Mapping[] {
  return withMultifield(ms, c, p, (mf) => ({ ...mf, subfields: mf.subfields.map((s) => (s.id === subId ? { ...s, ...patch } : s)) }))
}

export function removeSubfield(ms: Mapping[], c: Pick<ComponentDef, 'id'>, p: Property, subId: string): Mapping[] {
  return withMultifield(ms, c, p, (mf) => ({ ...mf, subfields: mf.subfields.filter((s) => s.id !== subId) }))
}
