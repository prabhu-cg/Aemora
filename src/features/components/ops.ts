import { arrayMove } from '@dnd-kit/sortable'
import { newId } from '../../lib/id'
import { inferPropertyType, normalizeTypeAlias, toKey, toLabel } from './detect'
import type { ChildLink, ComponentDef, ComponentType, Property, PropertyType, Unsupported } from './schema'

export type PropertyPatch = Partial<Pick<Property, 'key' | 'label' | 'type' | 'required' | 'defaultValue' | 'allowedValues' | 'description' | 'group'>>

type Scalar = string | number | boolean

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  string: 'string · single-line text',
  text: 'text · multi-line text',
  richtext: 'richtext · formatted text',
  number: 'number',
  boolean: 'boolean · on or off',
  enum: 'enum · choose from a list',
  image: 'image · asset reference',
  link: 'link · page or URL',
  color: 'color',
  date: 'date',
  list: 'list · repeated items',
  tags: 'tags',
  hidden: 'hidden · not shown to authors',
}

/** Keep a default valid for a new type, without inventing one. */
export function coerceDefault(type: PropertyType, value: Scalar | null): Scalar | null {
  if (value === null) return null
  if (type === 'boolean') return typeof value === 'boolean' ? value : /^(true|false)$/i.test(String(value)) ? String(value).toLowerCase() === 'true' : null
  if (type === 'number') {
    const n = typeof value === 'number' ? value : Number(String(value).trim())
    return String(value).trim() !== '' && Number.isFinite(n) ? n : null
  }
  return typeof value === 'string' ? value : String(value)
}

/** Parse what the user typed into the default field for this type. */
export function parseDefaultInput(type: PropertyType, raw: string): { value: Scalar | null; error?: string } {
  const t = raw.trim()
  if (t === '') return { value: null }
  if (type === 'number') {
    const n = Number(t)
    return Number.isFinite(n) ? { value: n } : { value: null, error: 'Enter a number, or clear the field for no default.' }
  }
  if (type === 'boolean') {
    if (/^(true|false)$/i.test(t)) return { value: t.toLowerCase() === 'true' }
    return { value: null, error: 'Use true or false.' }
  }
  return { value: raw }
}

const mapProps = (c: ComponentDef, fn: (p: Property, i: number) => Property): ComponentDef => ({ ...c, properties: c.properties.map(fn) })

export function uniqueKey(c: ComponentDef, base: string, exceptId?: string): string {
  const taken = new Set(c.properties.filter((p) => p.id !== exceptId).map((p) => p.key))
  let key = base || 'property'
  for (let i = 2; taken.has(key); i++) key = `${base}${i}`
  return key
}

export function patchProperty(c: ComponentDef, id: string, patch: PropertyPatch): ComponentDef {
  return mapProps(c, (p) => {
    if (p.id !== id) return p
    const next = { ...p, ...patch }
    if (patch.type && patch.type !== p.type && patch.defaultValue === undefined) next.defaultValue = coerceDefault(patch.type, p.defaultValue)
    // Editing a suggested property is a decision to keep it.
    return { ...next, origin: { ...p.origin, suggested: false } }
  })
}

export function addProperty(c: ComponentDef, partial: Partial<Property> = {}): { component: ComponentDef; property: Property } {
  const label = partial.label ?? 'New property'
  const property: Property = {
    id: newId(), key: uniqueKey(c, partial.key ?? toKey(label)), label, type: 'string', required: false, defaultValue: null,
    allowedValues: [], description: '', group: '', origin: { kind: 'manual', suggested: false }, ...partial,
  }
  property.key = uniqueKey(c, property.key)
  return { component: { ...c, properties: [...c.properties, property] }, property }
}

export function removeProperty(c: ComponentDef, id: string): { component: ComponentDef; removed: Property; index: number } | null {
  const index = c.properties.findIndex((p) => p.id === id)
  if (index < 0) return null
  return { component: { ...c, properties: c.properties.filter((p) => p.id !== id) }, removed: c.properties[index], index }
}

export function insertProperty(c: ComponentDef, p: Property, index: number): ComponentDef {
  const props = [...c.properties]
  props.splice(Math.min(Math.max(index, 0), props.length), 0, { ...p, key: uniqueKey(c, p.key, p.id) })
  return { ...c, properties: props }
}

export function moveProperty(c: ComponentDef, from: number, to: number): ComponentDef {
  if (from === to || from < 0 || to < 0 || from >= c.properties.length || to >= c.properties.length) return c
  return { ...c, properties: arrayMove(c.properties, from, to) }
}

export function movePropertyById(c: ComponentDef, id: string, dir: -1 | 1): ComponentDef {
  const i = c.properties.findIndex((p) => p.id === id)
  return moveProperty(c, i, i + dir)
}

/** Add template or other suggested properties after the user picked them. They are confirmed by being chosen. */
export function addSuggested(c: ComponentDef, props: Property[]): ComponentDef {
  let out = c
  for (const p of props) out = addProperty(out, { ...p, id: newId(), origin: { ...p.origin, suggested: false } }).component
  return out
}

export function confirmSuggested(c: ComponentDef, ids?: string[]): ComponentDef {
  return mapProps(c, (p) => (p.origin.suggested && (!ids || ids.includes(p.id)) ? { ...p, origin: { ...p.origin, suggested: false } } : p))
}

export function removeSuggested(c: ComponentDef): ComponentDef {
  return { ...c, properties: c.properties.filter((p) => !p.origin.suggested) }
}

/** Turn an unsupported item into a real property the user can then edit. */
export function promoteUnsupported(c: ComponentDef, unsupportedId: string): { component: ComponentDef; property: Property } | null {
  const u = c.unsupported.find((x) => x.id === unsupportedId)
  if (!u) return null
  const name = u.name.split('.').pop() || u.name
  const raw = u.rawValue
  const type = normalizeTypeAlias(u.rawType) ?? inferPropertyType(name, raw)
  const def = typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean' ? coerceDefault(type, raw) : null
  const added = addProperty(c, { label: toLabel(name), key: toKey(name), type, defaultValue: def, origin: { ...u.origin, suggested: false } })
  return { component: { ...added.component, unsupported: c.unsupported.filter((x) => x.id !== unsupportedId) }, property: added.property }
}

export function dismissUnsupported(c: ComponentDef, unsupportedId: string): ComponentDef {
  return { ...c, unsupported: c.unsupported.filter((x) => x.id !== unsupportedId) }
}

export function restoreUnsupported(c: ComponentDef, u: Unsupported): ComponentDef {
  return { ...c, unsupported: [...c.unsupported, u] }
}

export function patchComponent(c: ComponentDef, patch: Partial<Pick<ComponentDef, 'name' | 'type' | 'description'>>): ComponentDef {
  return { ...c, ...patch }
}

export function setComponentType(c: ComponentDef, type: ComponentType): ComponentDef {
  return { ...c, type }
}

export function patchChild(c: ComponentDef, index: number, patch: Partial<ChildLink>): ComponentDef {
  return { ...c, children: c.children.map((ch, i) => (i === index ? { ...ch, ...patch } : ch)) }
}

/** Groups in the order they first appear. A group is a tab name, or "Tab › Section". */
export function groupsOf(c: ComponentDef): string[] {
  return [...new Set(c.properties.map((p) => p.group.trim()).filter(Boolean))]
}

export function renameGroup(c: ComponentDef, from: string, to: string): ComponentDef {
  return mapProps(c, (p) => (p.group.trim() === from ? { ...p, group: to.trim() } : p))
}
