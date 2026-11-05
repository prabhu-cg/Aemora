import { newId } from '../../../lib/id'
import { classifyComponent, inferPropertyType, toKey, toLabel } from '../../components/detect'
import type { ComponentDef, Origin, Property, PropertyType, Unsupported } from '../../components/schema'
import type { ImportResult, Warning } from '../types'

type Json = Record<string, unknown>
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')

interface PropDef { type?: string; defaultValue?: unknown; variantOptions?: unknown[] }

const BOOLEAN_WORDS = new Set(['true', 'false', 'on', 'off', 'yes', 'no'])

/**
 * Turns a Figma REST response (file, or the nodes endpoint) into component definitions.
 * Extracts component and variant properties, text layers, visibility and dimensions.
 * Visual design properties (fills, spacing, radii) are reported as not mapped because they
 * are not authoring fields.
 */
export function parseFigmaResponse(json: unknown, opts: { fileKey?: string; requestedNodeId?: string } = {}): ImportResult {
  const warnings: Warning[] = []
  const roots: Json[] = []
  const fileName = isObj(json) ? str(json.name) : ''

  if (isObj(json) && isObj(json.document)) {
    roots.push(json.document)
  } else if (isObj(json) && isObj(json.nodes)) {
    for (const [id, entry] of Object.entries(json.nodes)) {
      if (isObj(entry) && isObj(entry.document)) roots.push(entry.document)
      else warnings.push({ level: 'warning', where: id, message: `Figma did not return node ${id}. It may have been deleted, or the link points to a different file.` })
    }
  } else {
    warnings.push({ level: 'warning', message: 'The response did not look like a Figma file or node response.' })
  }

  const components: ComponentDef[] = []
  const walk = (node: Json, parent: Json | null) => {
    const type = str(node.type)
    if (type === 'COMPONENT_SET') {
      components.push(buildComponent(node, 'set', warnings, opts.fileKey))
      return // variants are children of the set, do not list them separately
    }
    if (type === 'COMPONENT' && !(parent && str(parent.type) === 'COMPONENT_SET')) {
      components.push(buildComponent(node, 'single', warnings, opts.fileKey))
    }
    if (Array.isArray(node.children)) for (const c of node.children) if (isObj(c)) walk(c, node)
  }
  for (const r of roots) walk(r, null)

  if (!components.length && roots.length) {
    warnings.push({ level: 'warning', message: opts.requestedNodeId
      ? 'The selected node is not a component or component set, and contains none. Select a component in Figma and copy its link.'
      : 'No components were found in this file. Components must be published or defined as component sets.' })
  }
  if (components.length) {
    warnings.push({ level: 'info', message: 'Figma visual properties such as colors, spacing and corner radius were not mapped. They are not authoring fields. Add AEM fields for anything authors should control.' })
  }

  return {
    components, warnings, uncertain: [], assets: [],
    source: { kind: 'figma-rest', label: [fileName, opts.fileKey].filter(Boolean).join(' · ') || undefined, importedAt: new Date().toISOString() },
  }
}

function cleanName(n: string) { return n.replace(/#[\w:]+$/, '').trim() }

function buildComponent(node: Json, kind: 'set' | 'single', warnings: Warning[], fileKey?: string): ComponentDef {
  const name = str(node.name) || 'Untitled component'
  const nodeId = str(node.id)
  const origin: Origin = { kind: 'figma-rest', ref: [fileKey, nodeId].filter(Boolean).join(':'), suggested: false }
  const properties: Property[] = []
  const unsupported: Unsupported[] = []
  const taken = new Set<string>()
  const add = (p: Omit<Property, 'id' | 'key' | 'origin'> & { name: string; suggested?: boolean; ref?: string }) => {
    let base = toKey(p.name)
    for (let i = 2; taken.has(base); i++) base = `${toKey(p.name)}${i}`
    taken.add(base)
    properties.push({
      id: newId(), key: base, label: p.label, type: p.type, required: p.required, defaultValue: p.defaultValue,
      allowedValues: p.allowedValues, description: p.description, group: p.group,
      origin: { kind: 'figma-rest', ref: p.ref ?? nodeId, suggested: p.suggested ?? false },
    })
  }

  const defs = isObj(node.componentPropertyDefinitions) ? (node.componentPropertyDefinitions as Record<string, PropDef>) : {}
  for (const [rawName, def] of Object.entries(defs)) {
    const label = toLabel(rawName)
    if (def.type === 'TEXT') {
      add({ name: rawName, label, type: inferPropertyType(label, def.defaultValue) === 'text' ? 'text' : 'string', required: false, defaultValue: typeof def.defaultValue === 'string' ? def.defaultValue : null, allowedValues: [], description: '', group: '' })
    } else if (def.type === 'BOOLEAN') {
      add({ name: rawName, label, type: 'boolean', required: false, defaultValue: typeof def.defaultValue === 'boolean' ? def.defaultValue : null, allowedValues: [], description: '', group: '' })
    } else if (def.type === 'VARIANT') {
      const opts = (def.variantOptions ?? []).map(String)
      const isBool = opts.length > 0 && opts.every((o) => BOOLEAN_WORDS.has(o.toLowerCase()))
      add({
        name: rawName, label, type: isBool ? 'boolean' : 'enum', required: false,
        defaultValue: isBool ? ['true', 'on', 'yes'].includes(String(def.defaultValue).toLowerCase()) : typeof def.defaultValue === 'string' ? def.defaultValue : null,
        allowedValues: isBool ? [] : opts, description: '', group: '',
      })
    } else {
      const reason = def.type === 'INSTANCE_SWAP'
        ? 'Instance swap picks another component. There is no single AEM field for that. Reference an independently authored component, or expose selected properties of the child.'
        : `Figma property type "${def.type ?? 'unknown'}" has no AEM field mapping.`
      unsupported.push({ id: newId(), name: cleanName(rawName), rawType: String(def.type ?? ''), rawValue: def.defaultValue, reason, origin: { kind: 'figma-rest', ref: nodeId, suggested: false } })
      warnings.push({ level: 'warning', where: `${name} › ${cleanName(rawName)}`, message: reason })
    }
  }

  // Variant axes can also be read from child names ("Size=Small, State=Default") when definitions are absent.
  const children = Array.isArray(node.children) ? node.children.filter(isObj) : []
  if (kind === 'set' && !Object.values(defs).some((d) => d.type === 'VARIANT')) {
    const axes = new Map<string, Set<string>>()
    for (const c of children) for (const part of str(c.name).split(',')) {
      const m = /^\s*([^=]+?)\s*=\s*(.+?)\s*$/.exec(part)
      if (m) (axes.get(m[1]) ?? axes.set(m[1], new Set()).get(m[1])!).add(m[2])
    }
    for (const [axis, vals] of axes) add({ name: axis, label: axis, type: 'enum', required: false, defaultValue: [...vals][0] ?? null, allowedValues: [...vals], description: '', group: '', suggested: true })
  }

  // Text layers of the default variant are candidates for authored copy.
  const defaultVariant = kind === 'set' ? children[0] : node
  const hidden: string[] = []
  if (defaultVariant) {
    const visit = (n: Json) => {
      if (n.visible === false) hidden.push(str(n.name))
      if (str(n.type) === 'TEXT' && n.visible !== false) {
        const layer = str(n.name) || 'Text'
        const refs = isObj(n.componentPropertyReferences) ? n.componentPropertyReferences : {}
        if (!('characters' in refs)) {
          // Not already exposed as a component text property: propose it.
          add({
            name: layer, label: toLabel(layer), type: inferPropertyType(layer, str(n.characters)) === 'text' ? 'text' : 'string',
            required: false, defaultValue: str(n.characters) || null, allowedValues: [], description: 'Detected from a text layer in the design.',
            group: '', suggested: true, ref: str(n.id),
          })
        }
      }
      if (Array.isArray(n.children)) for (const c of n.children) if (isObj(c)) visit(c)
    }
    visit(defaultVariant)
  }

  const box = isObj(node.absoluteBoundingBox) ? node.absoluteBoundingBox : null
  const meta: Record<string, unknown> = { figmaNodeId: nodeId, figmaType: str(node.type) }
  if (box && typeof box.width === 'number' && typeof box.height === 'number') meta.size = { width: box.width, height: box.height }
  if (hidden.length) meta.hiddenLayers = hidden
  if (str(node.description)) meta.figmaDescription = str(node.description)

  return {
    id: newId(), name, type: classifyComponent(name, properties.map((p) => p.label)), description: str(node.description),
    properties, unsupported, children: [], meta, origin,
  }
}

export type { PropertyType }
