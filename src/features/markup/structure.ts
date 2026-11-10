import { toKey } from '../components/detect'
import type { Property } from '../components/schema'
import { isInteractionState } from '../inputs/designmd/convert'
import { childPath, type DesignData, type Layer, type LayerChanges, type VariantDiff } from './layers'
import { slug } from './naming'
import type { MarkupNote } from './types'

export interface Node {
  layer: Layer
  path: string
  /** Element class suffix (BEM element), null for the root. Shared by copies of one layer. */
  el: string | null
  parent: Node | null
  children: Node[]
  /** The layer only shows when the factor has one of these values. */
  presence?: { factor: Factor; values: string[] }
}

export interface Factor {
  /** Figma variant property name, e.g. "icon-style". */
  name: string
  /** JCR/model key of the matching dialog field, e.g. iconStyle. Null for states, which authors do not choose. */
  key: string | null
  isState: boolean
  default: string
  values: string[]
}

export interface Structure {
  root: Node
  /** Every node, parents before children. */
  nodes: Node[]
  byPath: Map<string, Node>
  factors: Factor[]
  /** Diffs that differ from the default variant in exactly one factor. */
  single: { factor: Factor; value: string; diff: VariantDiff }[]
}

const BEFORE = /lead|left|start|before|prefix|front/i
const AFTER = /trail|right|end|after|suffix|back/i
const DEFAULT_WORDS = ['default', 'enabled', 'rest', 'normal']

function sameJson(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b) }

export function buildStructure(design: DesignData, props: Property[], notes: MarkupNote[]): Structure | null {
  if (!design.tree) return null
  const nodes: Node[] = []
  const byPath = new Map<string, Node>()
  const used = new Map<string, number>()

  const elName = (layer: Layer) => {
    const base = slug(layer.name)
    const n = (used.get(base) ?? 0) + 1
    used.set(base, n)
    return n === 1 ? base : `${base}-${n}`
  }
  const make = (layer: Layer, path: string, parent: Node | null, el: string | null): Node => {
    const node: Node = { layer, path, el, parent, children: [] }
    nodes.push(node)
    byPath.set(path, node)
    const kids = layer.children ?? []
    node.children = kids.map((c) => make(c, childPath(path, c, kids), node, elName(c)))
    return node
  }
  const root = make(design.tree, design.tree.name, null, null)

  // Factors: the variant properties that differ between variants.
  const names: string[] = []
  const valuesOf = new Map<string, string[]>()
  const note = (name: string, v: string) => {
    if (!names.includes(name)) names.push(name)
    const list = valuesOf.get(name) ?? []
    if (!list.includes(v)) list.push(v)
    valuesOf.set(name, list)
  }
  for (const [k, v] of Object.entries(design.defaultVariantProperties ?? {})) note(k, v)
  for (const d of design.variantDiffs) for (const [k, v] of Object.entries(d.variantProperties)) note(k, v)

  const enumKeys = new Set(props.filter((p) => p.type === 'enum').map((p) => p.key))
  const factors: Factor[] = names.map((name) => {
    const values = valuesOf.get(name) ?? []
    const isState = isInteractionState({ name, variantOptions: values })
    const key = toKey(name)
    const prop = props.find((p) => p.key === key)
    const declared = design.defaultVariantProperties?.[name]
    const dflt = declared ?? (isState ? (values.find((v) => DEFAULT_WORDS.includes(v.toLowerCase())) ?? values[0]) : typeof prop?.defaultValue === 'string' ? prop.defaultValue : values[0])
    return { name, key: !isState && enumKeys.has(key) ? key : null, isState, default: dflt ?? '', values }
  })
  const factorOf = (name: string) => factors.find((f) => f.name === name)!
  const defaults = Object.fromEntries(factors.map((f) => [f.name, f.default]))

  const single: Structure['single'] = []
  for (const d of design.variantDiffs) {
    const differing = Object.keys(d.variantProperties).filter((k) => d.variantProperties[k] !== defaults[k])
    if (differing.length === 1) single.push({ factor: factorOf(differing[0]), value: d.variantProperties[differing[0]], diff: d })
  }

  // Which factor value decides whether a layer is there? Uniform across every known variant, and not constant.
  const allVariants: Record<string, string>[] = [defaults, ...design.variantDiffs.map((d) => ({ ...defaults, ...d.variantProperties }))]
  const decide = (presentIn: boolean[]): { factor: Factor; values: string[] } | null => {
    for (const f of factors) {
      if (!f.key) continue
      const seen = new Map<string, Set<boolean>>()
      allVariants.forEach((v, i) => { const s = seen.get(v[f.name]) ?? new Set<boolean>(); s.add(presentIn[i]); seen.set(v[f.name], s) })
      if ([...seen.values()].some((s) => s.size > 1)) continue
      const present = [...seen.entries()].filter(([, s]) => s.has(true)).map(([v]) => v)
      if (present.length && present.length < seen.size) return { factor: f, values: present }
    }
    return null
  }

  // Layers that exist only in some variants.
  type Group = { parentPath: string; layer: Layer; index?: number; present: boolean[] }
  const groups = new Map<string, Group>()
  design.variantDiffs.forEach((d, i) => {
    for (const a of d.added) {
      const key = `${a.parentPath}|${a.layer.name}`
      const g = groups.get(key) ?? { parentPath: a.parentPath, layer: a.layer, index: a.index, present: [false, ...design.variantDiffs.map(() => false)] }
      g.present[i + 1] = true
      groups.set(key, g)
    }
  })
  for (const g of groups.values()) {
    const parent = byPath.get(g.parentPath)
    const rule = decide(g.present)
    if (!parent) { notes.push({ level: 'warning', layer: g.layer.name, message: 'This layer appears in some variants, but its parent layer was not found, so it was left out.' }); continue }
    if (!rule) { notes.push({ level: 'warning', layer: g.layer.name, message: 'This layer appears in some variants, but no single option of the component decides when, so it was left out.' }); continue }
    // Values that put it before or after its siblings. Without a position from the plugin, the option's words decide.
    const groupsByPos = new Map<'before' | 'after', string[]>()
    for (const v of rule.values) {
      const pos: 'before' | 'after' = BEFORE.test(v) && !AFTER.test(v) ? 'before' : 'after'
      groupsByPos.set(pos, [...(groupsByPos.get(pos) ?? []), v])
    }
    if (typeof g.index !== 'number' && rule.values.length > 1 && !groupsByPos.has('before') && groupsByPos.get('after')!.length === rule.values.length) {
      // No hint at all: it goes last.
    } else if (typeof g.index !== 'number') {
      notes.push({ level: 'info', layer: g.layer.name, message: `Its position among its siblings was guessed from the option names (${rule.values.join(', ')}). The plugin did not say where it sits.` })
    }
    const el = elName(g.layer)
    for (const [pos, values] of groupsByPos) {
      const path = childPath(g.parentPath, g.layer, [...(parent.layer.children ?? []), g.layer])
      const node: Node = { layer: g.layer, path, el, parent, children: [], presence: { factor: rule.factor, values } }
      const kids = g.layer.children ?? []
      node.children = kids.map((c) => make(c, childPath(path, c, kids), node, elName(c)))
      nodes.push(node)
      if (typeof g.index === 'number') parent.children.splice(Math.min(g.index, parent.children.length), 0, node)
      else if (pos === 'before') parent.children.unshift(node)
      else parent.children.push(node)
    }
  }

  // Layers that are missing in some variants.
  const removedBy = new Map<string, boolean[]>()
  design.variantDiffs.forEach((d, i) => {
    for (const p of d.removed) {
      const present = removedBy.get(p) ?? [true, ...design.variantDiffs.map(() => true)]
      present[i + 1] = false
      removedBy.set(p, present)
    }
  })
  for (const [path, present] of removedBy) {
    const node = byPath.get(path)
    const rule = decide(present)
    if (node && rule) node.presence = rule
    else notes.push({ level: 'warning', layer: path.split('/').pop(), message: `This layer is missing in some variants, but no single option of the component decides when, so it is always shown. (${path})` })
  }

  // Order nodes parents-first in document order, with the conditional copies in place.
  const ordered: Node[] = []
  const visit = (n: Node) => { ordered.push(n); n.children.forEach(visit) }
  visit(root)
  return { root, nodes: ordered, byPath, factors, single }
}

/** The layer with a diff's changes applied, to know the effective layout and size. */
export function withChanges(layer: Layer, changes: LayerChanges): Layer {
  return { ...layer, ...changes }
}

export { sameJson }
