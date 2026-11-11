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
  /** Made from a layer that only some looks of the component have (the pill version of a tab), with everything inside it. */
  look?: boolean
  /** When the layer shows. Absent means always. */
  presence?: Presence
  /** The layer exists only in these interaction states of the design (a focus icon, a selected check). Hidden until then. */
  showIn?: { factor: Factor; value: string; /** Also needs one of these combinations of the other options (the Last Day position, say). Absent means any. */ when?: Term[][] }[]
  /** The layer is in the markup, but the design removes it in these interaction states (a chevron the selected look does not have). Hidden there. */
  hideIn?: { factor: Factor; value: string; when?: Term[][] }[]
}

const markLook = (n: Node): void => { n.look = true; n.children.forEach(markLook) }

export interface Term { factor: Factor; value: string }
/** Shows when any term holds (a term holds when each of its options has the given value), or when none holds if negated. */
export interface Presence { terms: Term[][]; negate: boolean }

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
  /** Diffs that differ from the default in two or more options (size and icon style together), or in one state and some options (the active pill). */
  multi: { combo: { factor: Factor; value: string }[]; diff: VariantDiff }[]
}

const BEFORE = /lead|left|start|before|prefix|front/i
const AFTER = /trail|right|end|after|suffix|back/i
const DEFAULT_WORDS = ['default', 'enabled', 'rest', 'normal']

function sameJson(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b) }

/**
 * A component can spell its resting state two ways ("default" and "Default"). They are one state, so the others are
 * read as the spelling the design declares as its default. Otherwise the second spelling would count as a state of its own.
 */
function mergeRestingSpellings(design: DesignData): DesignData {
  const values = new Map<string, Set<string>>()
  const note = (k: string, v: string) => values.set(k, (values.get(k) ?? new Set()).add(v))
  for (const [k, v] of Object.entries(design.defaultVariantProperties ?? {})) note(k, v)
  for (const d of design.variantDiffs) for (const [k, v] of Object.entries(d.variantProperties)) note(k, v)
  const canon = new Map<string, Map<string, string>>()
  for (const [name, vs] of values) {
    const declared = design.defaultVariantProperties?.[name]
    if (!declared || !DEFAULT_WORDS.includes(declared.toLowerCase()) || !isInteractionState({ name, variantOptions: [...vs] })) continue
    const alias = [...vs].filter((v) => v !== declared && v.toLowerCase() === declared.toLowerCase())
    if (alias.length) canon.set(name, new Map(alias.map((v) => [v, declared])))
  }
  if (!canon.size) return design
  const fix = (vp: Record<string, string>) => Object.fromEntries(Object.entries(vp).map(([k, v]) => [k, canon.get(k)?.get(v) ?? v]))
  return { ...design, variantDiffs: design.variantDiffs.map((d) => ({ ...d, variantProperties: fix(d.variantProperties) })) }
}

export function buildStructure(rawDesign: DesignData, props: Property[], notes: MarkupNote[]): Structure | null {
  const design = mergeRestingSpellings(rawDesign)
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
  const multi: Structure['multi'] = []
  for (const d of design.variantDiffs) {
    const differing = Object.keys(d.variantProperties).filter((k) => d.variantProperties[k] !== defaults[k])
    const fs = differing.map(factorOf)
    // Options picked together, or one interaction state together with options (the active look of the pill style).
    if (differing.length >= 2 && fs.every((f) => f.key || f.isState) && fs.filter((f) => f.isState).length <= 1 && fs.some((f) => !f.isState)) {
      multi.push({ combo: differing.map((k) => ({ factor: factorOf(k), value: d.variantProperties[k] })), diff: d })
    }
  }

  // Which factor value decides whether a layer is there? Uniform across every known variant, and not constant.
  const allVariants: Record<string, string>[] = [defaults, ...design.variantDiffs.map((d) => ({ ...defaults, ...d.variantProperties }))]
  // Interaction states (hover, focus, disabled) are not chosen by authors, so what decides a layer is judged in the default state only.
  const stateFactors = factors.filter((f) => f.isState)
  const isBase = (v: Record<string, string>) => stateFactors.every((f) => v[f.name] === f.default)
  const usable = factors.filter((f) => f.key)
  const subsetsOf = <T,>(items: T[], size: number, from = 0): T[][] =>
    size === 0 ? [[]] : items.slice(from).flatMap((item, i) => subsetsOf(items, size - 1, from + i + 1).map((rest) => [item, ...rest]))
  /**
   * The option combinations where a layer exists, reduced to the fewest options that still tell them apart from
   * the combinations where it does not. One option often decides (icon style), sometimes two do (type and variant).
   */
  const decide = (presentIn: boolean[], inScope: (v: Record<string, string>) => boolean = isBase): { positive: Term[][]; negative: Term[][] } | null => {
    const base = allVariants.map((v, i) => ({ v, present: presentIn[i] })).filter(({ v }) => inScope(v))
    if (!base.some((b) => b.present) || base.every((b) => b.present)) return null
    for (let size = 1; size <= usable.length; size++) {
      for (const used of subsetsOf(usable, size)) {
        const key = (v: Record<string, string>) => used.map((f) => v[f.name]).join('\u0001')
        const yes = new Set(base.filter((b) => b.present).map((b) => key(b.v)))
        if (base.some((b) => !b.present && yes.has(key(b.v)))) continue
        const no = new Set(base.filter((b) => !b.present).map((b) => key(b.v)))
        const terms = (keys: Set<string>): Term[][] => [...keys].map((k) => k.split('\u0001').map((value, i) => ({ factor: used[i], value })))
        return { positive: terms(yes), negative: terms(no) }
      }
    }
    return null
  }

  // Layers that exist only in some variants.
  type Group = { parentPath: string; layer: Layer; index?: number; present: boolean[] }
  const groups = new Map<string, Group>()
  // The same layer can look different from one option to the next (an alert's banner content per state).
  // Each distinct look is its own conditional copy. Layer ids differ per variant, so they are left out of the comparison.
  const look = (l: Layer) => JSON.stringify(l, (k, v) => (k === 'id' ? undefined : v))
  const MAX_LOOKS = 12
  const looksOf = new Map<string, string[]>()
  design.variantDiffs.forEach((d, i) => {
    for (const a of d.added) {
      const name = `${a.parentPath}|${a.layer.name}`
      const l = look(a.layer)
      const known = looksOf.get(name) ?? []
      if (!known.includes(l)) {
        if (known.length >= MAX_LOOKS) {
          if (known.length === MAX_LOOKS) { known.push('overflow'); notes.push({ level: 'warning', layer: a.layer.name, message: `This layer looks different in more than ${MAX_LOOKS} options. Only the first ${MAX_LOOKS} looks are in the markup.` }) }
          continue
        }
        known.push(l)
      }
      looksOf.set(name, known)
      const key = `${name}|${known.indexOf(l)}`
      const g = groups.get(key) ?? { parentPath: a.parentPath, layer: a.layer, index: a.index, present: [false, ...design.variantDiffs.map(() => false)] }
      g.present[i + 1] = true
      groups.set(key, g)
    }
  })
  for (const [name, known] of looksOf) {
    const count = known.filter((x) => x !== 'overflow').length
    if (count > 1) notes.push({ level: 'info', layer: name.split('|')[1], message: `This layer looks different in ${count} options, so the markup has one copy for each look.` })
  }
  // Where a layer exists in any of its looks. One copy being absent from a variant only means another copy stands for it there.
  const anyLook = new Map<string, boolean[]>()
  for (const g of groups.values()) {
    const k = `${g.parentPath}|${g.layer.name}`
    const cur = anyLook.get(k) ?? g.present.map(() => false)
    anyLook.set(k, cur.map((x, i) => x || g.present[i]))
  }
  for (const g of groups.values()) {
    const parent = byPath.get(g.parentPath)
    if (!parent) { notes.push({ level: 'warning', layer: g.layer.name, message: 'This layer appears in some variants, but its parent layer was not found, so it was left out.' }); continue }

    // A layer that only exists in an interaction state (a focus icon, a selected check) cannot be chosen by authors.
    // It is in the markup but hidden, and the CSS shows it in the state where the design has it.
    if (!g.present.some((p, i) => p && isBase(allVariants[i]))) {
      const seenIn = new Set<string>()
      const showIn: NonNullable<Node['showIn']> = []
      design.variantDiffs.forEach((d, i) => {
        if (!g.present[i + 1]) return
        for (const f of stateFactors) {
          const v = d.variantProperties[f.name]
          if (v && v !== f.default && !seenIn.has(`${f.name}|${v}`)) { seenIn.add(`${f.name}|${v}`); showIn.push({ factor: f, value: v }) }
        }
      })
      // In that state, which of the other options is it for? Judged among the variants of that state only.
      for (const entry of showIn) {
        const rule = decide(g.present, (v) => v[entry.factor.name] === entry.value && stateFactors.every((o) => o === entry.factor || v[o.name] === o.default))
        if (rule) entry.when = rule.positive
      }
      const path = childPath(g.parentPath, g.layer, [...(parent.layer.children ?? []), g.layer])
      const node: Node = { layer: g.layer, path, el: elName(g.layer), parent, children: [], showIn }
      const kids = g.layer.children ?? []
      node.children = kids.map((c) => make(c, childPath(path, c, kids), node, elName(c)))
      markLook(node)
      nodes.push(node)
      if (typeof g.index === 'number') parent.children.splice(Math.min(g.index, parent.children.length), 0, node)
      else parent.children.push(node)
      notes.push({ level: 'info', layer: g.layer.name, message: `In the design this only shows in the ${showIn.map((x) => x.value).join(' and ')} state, so it is hidden until then.${typeof g.index === 'number' ? '' : ' Its position among its siblings was guessed, because the plugin did not say where it sits.'}` })
      continue
    }

    const rule = decide(g.present)
    if (!rule) { notes.push({ level: 'warning', layer: g.layer.name, message: 'This layer appears in some variants, but the options of the component do not tell when, so it was left out.' }); continue }
    // Terms that put it before or after its siblings. Without a position from the plugin, the option's words decide.
    const text = (t: Term[]) => t.map((x) => x.value).join(' ')
    const byPosition = new Map<'before' | 'after', Term[][]>()
    for (const t of rule.positive) {
      const pos: 'before' | 'after' = BEFORE.test(text(t)) && !AFTER.test(text(t)) ? 'before' : 'after'
      byPosition.set(pos, [...(byPosition.get(pos) ?? []), t])
    }
    if (typeof g.index !== 'number' && rule.positive.length > 1 && !byPosition.has('before') && byPosition.get('after')!.length === rule.positive.length) {
      // No hint at all: it goes last.
    } else if (typeof g.index !== 'number') {
      notes.push({ level: 'info', layer: g.layer.name, message: `Its position among its siblings was guessed from the option names (${rule.positive.map(text).join(', ')}). The plugin did not say where it sits.` })
    }
    // It shows wherever the options say, except in an interaction state where the design leaves it out (the disabled filter chip has no chevron).
    const hideIn: NonNullable<Node['hideIn']> = []
    const wanted = (v: Record<string, string>) => rule.positive.some((t) => t.every((x) => v[x.factor.name] === x.value))
    for (const f of stateFactors) {
      for (const val of new Set(design.variantDiffs.map((d) => d.variantProperties[f.name]).filter((x): x is string => !!x && x !== f.default))) {
        const scope = (v: Record<string, string>) => v[f.name] === val && stateFactors.every((o) => o === f || v[o.name] === o.default) && wanted(v)
        const inState = allVariants.map((v, i) => ({ v, i })).filter(({ v }) => scope(v))
        const here = anyLook.get(`${g.parentPath}|${g.layer.name}`) ?? g.present
        if (!inState.length || inState.every(({ i }) => here[i])) continue
        if (inState.every(({ i }) => !here[i])) hideIn.push({ factor: f, value: val, when: rule.positive })
        else { const r = decide(here, scope); if (r) hideIn.push({ factor: f, value: val, when: r.negative }) } // gone for only some looks (an icon on)
      }
    }
    const el = elName(g.layer)
    const single = byPosition.size === 1
    for (const [pos, terms] of byPosition) {
      const path = childPath(g.parentPath, g.layer, [...(parent.layer.children ?? []), g.layer])
      // Saying where it does not show is shorter when it shows almost everywhere. That only holds when one copy covers every place it shows.
      const presence: Presence = single && rule.negative.length < rule.positive.length ? { terms: rule.negative, negate: true } : { terms, negate: false }
      const node: Node = { layer: g.layer, path, el, parent, children: [], presence, ...(hideIn.length ? { hideIn } : {}) }
      const kids = g.layer.children ?? []
      node.children = kids.map((c) => make(c, childPath(path, c, kids), node, elName(c)))
      markLook(node)
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
    if (present.every((p, i) => p || !isBase(allVariants[i]))) {
      // Gone only in interaction states: it stays in the markup and the CSS hides it in the states where the design has no such layer.
      const hideIn: NonNullable<Node['hideIn']> = []
      const seenIn = new Set<string>()
      design.variantDiffs.forEach((d, i) => {
        if (present[i + 1]) return
        for (const f of stateFactors) {
          const v = d.variantProperties[f.name]
          if (v && v !== f.default && !seenIn.has(`${f.name}|${v}`)) { seenIn.add(`${f.name}|${v}`); hideIn.push({ factor: f, value: v }) }
        }
      })
      for (const entry of hideIn) {
        const rule = decide(present, (v) => v[entry.factor.name] === entry.value && stateFactors.every((o) => o === entry.factor || v[o.name] === o.default))
        if (rule) entry.when = rule.negative
      }
      if (node && hideIn.length) { node.hideIn = hideIn; notes.push({ level: 'info', layer: path.split('/').pop(), message: `In the design this is not there in the ${hideIn.map((x) => x.value).join(' and ')} state, so it is hidden then.` }); continue }
      notes.push({ level: 'info', layer: path.split('/').pop(), message: 'In the design this is hidden in some interaction states. The markup always includes it.' })
      continue
    }
    const rule = decide(present)
    if (node && rule) node.presence = rule.negative.length < rule.positive.length ? { terms: rule.negative, negate: true } : { terms: rule.positive, negate: false }
    else notes.push({ level: 'warning', layer: path.split('/').pop(), message: `This layer is missing in some variants, but the options of the component do not tell when, so it is always shown. (${path})` })
  }

  // Order nodes parents-first in document order, with the conditional copies in place.
  const ordered: Node[] = []
  const visit = (n: Node) => { ordered.push(n); n.children.forEach(visit) }
  visit(root)
  return { root, nodes: ordered, byPath, factors, single, multi }
}

/** The layer with a diff's changes applied, to know the effective layout and size. */
export function withChanges(layer: Layer, changes: LayerChanges): Layer {
  return { ...layer, ...changes }
}

export { sameJson }
