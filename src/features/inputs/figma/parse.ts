import { newId } from '../../../lib/id'
import { classifyComponent, inferPropertyType, toKey, toLabel } from '../../components/detect'
import type { ComponentDef, Origin, Property, PropertyType, Unsupported } from '../../components/schema'
import type { ImportResult, Warning } from '../types'
import { isInteractionState } from '../designmd/convert'
import { buildDesign, pickDefaultVariant } from './design'

type Json = Record<string, unknown>
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')

interface PropDef { type?: string; defaultValue?: unknown; variantOptions?: unknown[] }

const BOOLEAN_WORDS = new Set(['true', 'false', 'on', 'off', 'yes', 'no'])

/**
 * Turns a Figma REST response (file, or the nodes endpoint) into component definitions.
 * Extracts component and variant properties, text layers, visibility and dimensions.
 * The layer structure is read too (positions, layout, colors, vector shapes), for the markup and the preview.
 * Visual properties are not authoring fields, so no dialog field is made from them.
 */
export function parseFigmaResponse(json: unknown, opts: { fileKey?: string; requestedNodeId?: string } = {}): ImportResult {
  const warnings: Warning[] = []
  const roots: Json[] = []
  // Id -> { name } of every component the response knows, so an instance can say what it is an instance of.
  const known: Record<string, unknown> = {}
  const fileName = isObj(json) ? str(json.name) : ''

  if (isObj(json) && isObj(json.document)) {
    roots.push(json.document)
    if (isObj(json.components)) Object.assign(known, json.components)
  } else if (isObj(json) && isObj(json.nodes)) {
    for (const [id, entry] of Object.entries(json.nodes)) {
      if (isObj(entry) && isObj(entry.document)) { roots.push(entry.document); if (isObj(entry.components)) Object.assign(known, entry.components) }
      else warnings.push({ level: 'warning', where: id, message: `Figma did not return node ${id}. It may have been deleted, or the link points to a different file.` })
    }
  } else {
    warnings.push({ level: 'warning', message: 'The response did not look like a Figma file or node response.' })
  }

  const components: ComponentDef[] = []
  const walk = (node: Json, parent: Json | null) => {
    const type = str(node.type)
    if (type === 'COMPONENT_SET') {
      components.push(buildComponent(node, 'set', warnings, opts.fileKey, known))
      return // variants are children of the set, do not list them separately
    }
    if (type === 'COMPONENT' && !(parent && str(parent.type) === 'COMPONENT_SET')) {
      components.push(buildComponent(node, 'single', warnings, opts.fileKey, known))
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
    warnings.push({ level: 'info', message: 'Colors, spacing and shapes are read for the markup and preview, but they are not authoring fields. Add AEM fields for anything authors should control.' })
  }

  return {
    components, warnings, uncertain: [], assets: [],
    source: { kind: 'figma-rest', label: [fileName, opts.fileKey].filter(Boolean).join(' · ') || undefined, importedAt: new Date().toISOString() },
  }
}

function cleanName(n: string) { return n.replace(/#[\w:]+$/, '').trim() }

function buildComponent(node: Json, kind: 'set' | 'single', warnings: Warning[], fileKey?: string, known: Record<string, unknown> = {}): ComponentDef {
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
      // Hover, focus, disabled, active ...: the look of a state is CSS, and authors do not choose it.
      if (isInteractionState({ name: rawName, variantOptions: opts })) {
        warnings.push({ level: 'info', where: name, message: `"${cleanName(rawName)}" lists interaction states (${opts.slice(0, 4).join(', ')}). They are styled in CSS, so no dialog field was made.` })
        continue
      }
      const isBool = opts.length > 0 && opts.every((o) => BOOLEAN_WORDS.has(o.toLowerCase()))
      add({
        name: rawName, label, type: isBool ? 'boolean' : 'enum', required: false,
        defaultValue: isBool ? ['true', 'on', 'yes'].includes(String(def.defaultValue).toLowerCase()) : typeof def.defaultValue === 'string' ? def.defaultValue : null,
        allowedValues: isBool ? [] : opts, description: '', group: '',
      })
    } else if (def.type === 'INSTANCE_SWAP') {
      // Same as the DesignMD route: a swapped component (usually an icon) is a text field for its name or path.
      const which = isObj(known[String(def.defaultValue)]) ? str((known[String(def.defaultValue)] as Json).name) : ''
      add({ name: rawName, label, type: 'string', required: false, defaultValue: null, allowedValues: [], description: which ? `Swaps the component. Default in the design: ${which}.` : 'Swaps the component.', group: '' })
      warnings.push({ level: 'info', where: `${name} › ${cleanName(rawName)}`, message: 'An instance swap (usually an icon) became a text field for the icon name or path. Change its type in the inspector if authors should pick an image.' })
    } else {
      const reason = `Figma property type "${def.type ?? 'unknown'}" has no AEM field mapping.`
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
  const defaultVariant = pickDefaultVariant(node, kind) ?? (kind === 'set' ? children[0] : node)
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
  // The layers, their layout, colors, positions and shapes: what the markup and the preview are made from.
  const design = buildDesign(node, kind, { components: known, warn: (message, where) => warnings.push({ level: 'warning', where: where ? `${name} › ${where}` : name, message }) })
  if (design) meta.design = design

  return {
    id: newId(), name, type: classifyComponent(name, properties.map((p) => p.label)), description: str(node.description),
    properties, unsupported, children: [], meta, origin,
  }
}

export type { PropertyType }
