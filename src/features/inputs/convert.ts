import { newId } from '../../lib/id'
import { classifyComponent, inferPropertyType, normalizeTypeAlias, toKey, toLabel } from '../components/detect'
import { COMPONENT_TYPES, type ComponentDef, type ComponentType, type Origin, type Property, type Unsupported } from '../components/schema'
import type { JsonComponent } from './jsonSchema'
import type { Warning } from './types'

const KNOWN_PROP_KEYS = new Set(['name', 'type', 'label', 'required', 'default', 'values', 'description', 'group'])
const KNOWN_COMP_KEYS = new Set(['name', 'type', 'description', 'properties', 'children', 'meta'])

/** Unique key within a component: label, label2, label3 ... */
function uniqueKey(base: string, taken: Set<string>): string {
  let key = base
  for (let i = 2; taken.has(key); i++) key = `${base}${i}`
  taken.add(key)
  return key
}

export function convertJsonComponent(src: JsonComponent, kind: Origin['kind'], warnings: Warning[]): ComponentDef {
  const origin: Origin = { kind, suggested: false }
  const unsupported: Unsupported[] = []
  const taken = new Set<string>()

  const properties: Property[] = src.properties.map((p) => {
    const where = `${src.name} › ${p.name}`
    let type = p.type ? normalizeTypeAlias(p.type) : null
    if (p.type && !type) {
      type = inferPropertyType(p.name, p.default)
      warnings.push({ level: 'warning', where, message: `Type "${p.type}" is not supported. Treated as "${type}" based on the name. Change it in the inspector if that is wrong.` })
      unsupported.push({ id: newId(), name: p.name, rawType: p.type, reason: `Unsupported property type "${p.type}"; a "${type}" property was created instead.`, origin })
    }
    type ??= inferPropertyType(p.name, p.default)
    if (type === 'enum' && !p.values?.length) {
      warnings.push({ level: 'info', where, message: 'Enum property without allowed values. Add them in the inspector.' })
    }
    for (const [k, v] of Object.entries(p)) {
      if (KNOWN_PROP_KEYS.has(k)) continue
      unsupported.push({ id: newId(), name: `${p.name}.${k}`, rawType: typeof v, rawValue: v, reason: `Field "${k}" is not part of the component JSON schema and has no AEM equivalent. Kept for reference.`, origin })
      warnings.push({ level: 'warning', where, message: `Unsupported field "${k}" was kept in the unsupported list.` })
    }
    return {
      id: newId(),
      key: uniqueKey(toKey(p.name), taken),
      label: p.label ?? toLabel(p.name),
      type,
      required: p.required ?? false,
      defaultValue: p.default ?? null,
      allowedValues: p.values ?? [],
      description: p.description ?? '',
      group: p.group ?? '',
      origin,
    }
  })

  let type: ComponentType
  if (src.type && (COMPONENT_TYPES as readonly string[]).includes(src.type.toLowerCase())) {
    type = src.type.toLowerCase() as ComponentType
  } else {
    type = classifyComponent(src.name, src.properties.map((p) => p.name))
    if (src.type) warnings.push({ level: 'warning', where: src.name, message: `Component type "${src.type}" is not supported. Detected "${type}" instead.` })
  }

  for (const [k, v] of Object.entries(src)) {
    if (KNOWN_COMP_KEYS.has(k)) continue
    unsupported.push({ id: newId(), name: `${src.name}.${k}`, rawType: typeof v, rawValue: v, reason: `Field "${k}" is not part of the component JSON schema. Kept for reference.`, origin })
    warnings.push({ level: 'warning', where: src.name, message: `Unsupported field "${k}" was kept in the unsupported list.` })
  }

  return {
    id: newId(),
    name: src.name,
    type,
    description: src.description ?? '',
    properties,
    unsupported,
    children: (src.children ?? []).map((c) => ({
      name: c.name,
      approach: c.approach ?? 'expose-properties',
      exposedKeys: c.expose ?? [],
    })),
    meta: (src.meta as Record<string, unknown> | undefined) ?? {},
    origin,
  }
}
