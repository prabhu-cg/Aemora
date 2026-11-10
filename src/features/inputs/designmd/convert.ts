import { newId } from '../../../lib/id'
import { classifyComponent, inferPropertyType, toKey, toLabel } from '../../components/detect'
import type { ComponentDef, Origin, Property, PropertyType, Unsupported } from '../../components/schema'
import type { Warning } from '../types'
import { DESIGNMD_SCHEMA, type DmComponent, type DmLayer, type DmProperty, type DmWarning } from './schema'

/** Interaction words. A "state" property made only of these is styled in CSS, not chosen by authors. */
const INTERACTIVE = new Set(['default', 'hover', 'hovered', 'focus', 'focused', 'pressed', 'active', 'disabled', 'de-activated', 'deactivated', 'inactive', 'enabled'])
const MAX_SUGGESTED_TEXT = 8
/** Aemora keeps at most this many allowed values per field. */
const MAX_ALLOWED_VALUES = 200

export function isInteractionState(p: DmProperty): boolean {
  return /\b(states?|interaction)\b/i.test(p.name) && (p.variantOptions ?? []).some((o) => INTERACTIVE.has(o.toLowerCase()))
}

function uniqueKey(base: string, taken: Set<string>): string {
  let key = base
  for (let i = 2; taken.has(key); i++) key = `${base}${i}`
  taken.add(key)
  return key
}

export function walkLayers(layer: DmLayer | undefined, visit: (l: DmLayer) => void): void {
  if (!layer || typeof layer !== 'object') return
  visit(layer)
  for (const c of layer.children ?? []) walkLayers(c, visit)
}

/** Every token id referenced anywhere in the value. */
function tokenIdsIn(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) tokenIdsIn(v, into)
  else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    const t = o.token as { variableId?: unknown } | undefined
    if (t && typeof t.variableId === 'string') into.add(t.variableId)
    for (const v of Object.values(o)) tokenIdsIn(v, into)
  }
  return into
}

function mapProperty(p: DmProperty, comp: DmComponent, taken: Set<string>, origin: Origin, warnings: Warning[], unsupported: Unsupported[], notes: { states: string[] }): Property | null {
  const where = `${comp.name} › ${p.name}`
  const base = { id: newId(), key: uniqueKey(toKey(p.name), taken), label: toLabel(p.name), required: false, description: '', group: '', origin }
  const dflt = p.defaultValue
  switch (p.type) {
    case 'TEXT': {
      const inferred = inferPropertyType(p.name)
      const type: PropertyType = inferred === 'text' || inferred === 'richtext' || inferred === 'link' ? inferred : 'string'
      return { ...base, type, defaultValue: typeof dflt === 'string' ? dflt : null, allowedValues: [] }
    }
    case 'BOOLEAN':
      return { ...base, type: 'boolean', defaultValue: String(dflt) === 'true', allowedValues: [] }
    case 'INSTANCE_SWAP': {
      const which = p.defaultResolved?.name ?? p.defaultResolved?.id
      warnings.push({ level: 'info', where, message: 'An instance swap (usually an icon) became a text field for the icon name or path. Change its type in the inspector if authors should pick an image.' })
      return { ...base, type: 'string', defaultValue: null, allowedValues: [], description: which ? `Swaps the component. Default in the design: ${which}.` : 'Swaps the component.' }
    }
    case 'VARIANT': {
      if (isInteractionState(p)) {
        taken.delete(base.key)
        notes.states.push(p.name)
        return null
      }
      const all = p.variantOptions ?? []
      const values = all.slice(0, MAX_ALLOWED_VALUES)
      if (all.length > values.length) {
        warnings.push({ level: 'warning', where, message: `This property has ${all.length} options. Only the first ${values.length} were kept as allowed values. The full list stays in the design data.` })
      }
      const def = typeof dflt === 'string' && values.includes(dflt) ? dflt : (values[0] ?? null)
      return { ...base, type: 'enum', defaultValue: def, allowedValues: values }
    }
    default: {
      const type = inferPropertyType(p.name, dflt)
      warnings.push({ level: 'warning', where, message: `Property type "${p.type}" is not supported. Treated as "${type}" based on the name.` })
      unsupported.push({ id: newId(), name: p.name, rawType: p.type, reason: `Unsupported Figma property type "${p.type}"; a "${type}" property was created instead.`, origin })
      return { ...base, type, defaultValue: typeof dflt === 'string' || typeof dflt === 'number' || typeof dflt === 'boolean' ? dflt : null, allowedValues: [] }
    }
  }
}

/** Text layers that carry real copy but are not driven by a Figma text property. Suggested, never added silently. */
function suggestTextFields(tree: DmLayer | undefined, comp: DmComponent, taken: Set<string>, kind: Origin['kind'], warnings: Warning[]): Property[] {
  const out: Property[] = []
  walkLayers(tree, (l) => {
    if (out.length >= MAX_SUGGESTED_TEXT || l.type !== 'TEXT' || l.visible === false || l.propertyRefs?.characters) return
    if (l.role !== 'label' && l.role !== 'heading' && l.role !== 'text') return
    const copy = l.text?.characters?.trim()
    if (!copy) return
    const key = toKey(l.name)
    if (taken.has(key)) return
    taken.add(key)
    const type: PropertyType = copy.length > 80 || copy.includes('\n') ? 'text' : 'string'
    out.push({
      id: newId(), key, label: toLabel(l.name), type, required: false, defaultValue: copy, allowedValues: [],
      description: 'Text in the design that is not tied to a Figma property.', group: '',
      origin: { kind, ref: l.id, suggested: true },
    })
    warnings.push({ level: 'info', where: `${comp.name} › ${l.name}`, message: 'This text has no Figma property. A field was suggested for it. Keep it or remove it in the inspector.' })
  })
  return out
}

export function convertDesignMdComponent(comp: DmComponent, tokens: Record<string, unknown>, pluginWarnings: DmWarning[], source: { fileName?: string; pluginVersion?: string }, warnings: Warning[]): ComponentDef {
  const kind = 'figma-plugin' as const
  const origin: Origin = { kind, ref: comp.id, suggested: false }
  const unsupported: Unsupported[] = []
  const taken = new Set<string>()
  const notes = { states: [] as string[] }

  const properties: Property[] = []
  for (const p of comp.properties) {
    const mapped = mapProperty(p, comp, taken, origin, warnings, unsupported, notes)
    if (mapped) properties.push(mapped)
  }
  const tree = (comp.tree && typeof comp.tree === 'object' ? comp.tree : undefined) as DmLayer | undefined
  properties.push(...suggestTextFields(tree, comp, taken, kind, warnings))

  if (notes.states.length) {
    warnings.push({ level: 'info', where: comp.name, message: `"${notes.states.join('", "')}" lists interaction states (hover, focus, disabled). These are styled in CSS, so no dialog field was created.` })
  }
  if (!tree) warnings.push({ level: 'info', where: comp.name, message: 'No layer structure came with this component, so only its properties were imported.' })
  if (comp.treeTruncated) warnings.push({ level: 'warning', where: comp.name, message: 'The layer structure was cut off at the plugin\'s size limit, so the markup may be incomplete.' })
  for (const w of pluginWarnings) {
    if (w.componentId !== comp.id || w.code === 'TREE_TRUNCATED') continue
    warnings.push({ level: w.code === 'DUPLICATE_SIBLING_NAME' ? 'info' : 'warning', where: comp.name, message: w.message })
  }

  let guessed = 0
  walkLayers(tree, (l) => { if (l.roleSource === 'name') guessed++ })
  if (guessed) warnings.push({ level: 'info', where: comp.name, message: `${guessed} layer role${guessed === 1 ? ' was' : 's were'} guessed from layer names, so they are less certain.` })

  const used = tokenIdsIn([tree, comp.variantDiffs])
  if (tree && used.size === 0) warnings.push({ level: 'info', where: comp.name, message: 'No design variables are bound in this component, so its styles will use the literal values from Figma.' })
  const tokenSubset: Record<string, unknown> = {}
  for (const id of used) if (id in tokens) tokenSubset[id] = tokens[id]

  return {
    id: newId(),
    name: comp.name,
    type: classifyComponent(comp.name, properties.map((p) => p.label)),
    description: comp.description ?? '',
    properties,
    unsupported,
    children: [],
    meta: {
      design: {
        format: DESIGNMD_SCHEMA,
        source: { fileName: source.fileName, pluginVersion: source.pluginVersion },
        figma: { id: comp.id, key: comp.key, page: comp.pageName?.trim() },
        layout: comp.layout,
        states: comp.states,
        sizes: comp.sizes,
        defaultVariantId: comp.defaultVariantId,
        treeTruncated: comp.treeTruncated ?? false,
        tree: comp.tree,
        variantDiffs: comp.variantDiffs,
        tokens: tokenSubset,
      },
    },
    origin,
  }
}
