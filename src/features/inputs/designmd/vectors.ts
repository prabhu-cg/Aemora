import { childPath, type Graphic, type Layer } from '../../markup/layers'

/** Path data longer than this, per layer, is left as a box. The generated markup and the preview would grow too large. */
export const MAX_PATH_CHARS = 60_000

type Geometry = { d: string; rule?: 'EVENODD' | 'NONZERO' }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function paths(v: unknown): Geometry[] {
  if (!Array.isArray(v)) return []
  const out: Geometry[] = []
  for (const p of v) {
    if (!isObj(p)) continue
    const d = typeof p.data === 'string' ? p.data : typeof p.d === 'string' ? p.d : ''
    if (!d.trim()) continue
    const rule = String(p.windingRule ?? p.rule ?? '').toUpperCase()
    out.push({ d, rule: rule === 'EVENODD' ? 'EVENODD' : 'NONZERO' })
  }
  return out
}

/** `vector: { fill: [{ windingRule, data }], stroke: [...] }` (DesignMD 1.2) as the `graphic` the generators draw. */
export function graphicOfVector(vector: unknown): Graphic | undefined {
  if (!isObj(vector)) return undefined
  const fills = paths(vector.fill)
  const strokes = paths(vector.stroke)
  const chars = [...fills, ...strokes].reduce((n, p) => n + p.d.length, 0)
  if ((!fills.length && !strokes.length) || chars > MAX_PATH_CHARS) return undefined
  return strokes.length ? { fills, strokes } : { fills }
}

/** Renames `vector` to `graphic` on a layer, its children, and the layers inside a variant's changes. Changes the object in place. Returns how many shapes were too large to keep. */
export function convertVectors(layer: unknown): number {
  if (!isObj(layer)) return 0
  let dropped = 0
  if ('vector' in layer) {
    const g = graphicOfVector(layer.vector)
    if (g) layer.graphic = g
    else if (isObj(layer.vector) && (paths(layer.vector.fill).length || paths(layer.vector.stroke).length)) dropped++
    delete layer.vector
  }
  if (Array.isArray(layer.children)) for (const c of layer.children) dropped += convertVectors(c)
  return dropped
}

/** The same for a variant diff: changed layers carry the changed attributes, added layers are whole layers. */
export function convertDiffVectors(diffs: unknown[]): number {
  let dropped = 0
  for (const d of diffs) {
    if (!isObj(d)) continue
    for (const e of Array.isArray(d.layers) ? d.layers : []) if (isObj(e)) dropped += convertVectors(e.changes)
    for (const a of Array.isArray(d.added) ? d.added : []) if (isObj(a)) dropped += convertVectors(a.layer)
  }
  return dropped
}

type Box = { width: number; height: number }
const sizeOf = (l: Record<string, unknown>): Box | undefined => {
  const s = l.size
  return isObj(s) && typeof s.width === 'number' && typeof s.height === 'number' ? { width: s.width, height: s.height } : undefined
}

/**
 * The export carries no x and y. Where a frame without auto layout holds a single layer (an icon in its badge,
 * a glyph in its box) the layer is centred, and a layer as big as its frame sits at 0, 0. Anything else is left stacked.
 * Changes the layer in place and returns how many layers were placed.
 */
export function inferPositions(layer: unknown): number {
  if (!isObj(layer)) return 0
  let placed = 0
  const kids = Array.isArray(layer.children) ? layer.children.filter(isObj) : []
  const box = sizeOf(layer)
  if (box && kids.length && !layer.layout && ['FRAME', 'INSTANCE', 'COMPONENT'].includes(String(layer.type))) {
    for (const k of kids) {
      const s = sizeOf(k)
      if (!s || k.position || k.layoutPositioning || k.type === 'GROUP') continue
      const same = Math.abs(s.width - box.width) < 0.5 && Math.abs(s.height - box.height) < 0.5
      if (same) { k.position = { x: 0, y: 0 }; placed++ }
      else if (kids.length === 1) { k.position = { x: Math.round(((box.width - s.width) / 2) * 100) / 100, y: Math.round(((box.height - s.height) / 2) * 100) / 100 }; placed++ }
    }
  }
  for (const c of kids) placed += inferPositions(c)
  return placed
}

const SIZING = new Set(['FIXED', 'HUG', 'FILL'])

/**
 * DesignMD 1.2 writes how a layer sits in its parent as `placement` ({ sizingH, sizingV, grow, align, positioning })
 * and its angle as `rotation`. The generators read `sizing`, `layoutPositioning` and `transform`.
 * Changes the layer in place; `parentMode` is the auto layout direction of the parent, when it has one.
 */
export function convertPlacement(layer: unknown, parentMode?: string, base?: Record<string, unknown>): void {
  if (!isObj(layer)) return
  const pl = layer.placement
  if (isObj(pl)) {
    let h = typeof pl.sizingH === 'string' && SIZING.has(pl.sizingH) ? pl.sizingH : undefined
    let v = typeof pl.sizingV === 'string' && SIZING.has(pl.sizingV) ? pl.sizingV : undefined
    // Grow fills the way the parent lays out; stretch fills across it.
    if (parentMode === 'HORIZONTAL') { if (pl.grow === 1) h = 'FILL'; if (pl.align === 'STRETCH') v = 'FILL' }
    if (parentMode === 'VERTICAL') { if (pl.grow === 1) v = 'FILL'; if (pl.align === 'STRETCH') h = 'FILL' }
    if (pl.positioning === 'ABSOLUTE') layer.layoutPositioning = 'ABSOLUTE'
    // `base` is the layer in the default variant, when `layer` is a set of changes to it.
    const frame = isObj(layer.layout) ? layer.layout : base && isObj(base.layout) ? base.layout : undefined
    if (frame) {
      if (layer.layout) { (layer.layout as Record<string, unknown>).sizingH ??= h; (layer.layout as Record<string, unknown>).sizingV ??= v }
      else layer.layout = { ...frame, ...(h ? { sizingH: h } : {}), ...(v ? { sizingV: v } : {}) }
    } else if (!layer.sizing && (h || v) && (parentMode || base) && pl.positioning !== 'ABSOLUTE') layer.sizing = { h, v }
    delete layer.placement
  }
  const r = typeof layer.rotation === 'number' ? layer.rotation : 0
  if (Math.abs(r) > 0.01 && !layer.transform) {
    // Figma turns counter-clockwise, CSS clockwise.
    const a = (-r * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
    const f = (n: number) => Math.round(n * 10000) / 10000
    layer.transform = [f(c), f(s), f(-s), f(c)]
  }
  if ('rotation' in layer) delete layer.rotation
}

function convertPlacementTree(layer: unknown, parentMode?: string): void {
  if (!isObj(layer)) return
  convertPlacement(layer, parentMode)
  const mode = isObj(layer.layout) && typeof layer.layout.mode === 'string' ? layer.layout.mode : undefined
  if (Array.isArray(layer.children)) for (const c of layer.children) convertPlacementTree(c, mode)
}

/** Everything the adapter does to a component's layers so the generators can read them. Safe to repeat. Returns how many shapes were too large to keep. */
export function prepareLayers(tree: unknown, diffs: unknown[]): number {
  const dropped = convertVectors(tree) + convertDiffVectors(diffs)
  // The default variant's layers by name path, so a variant's changes can be read against the layer they change.
  const byPath = new Map<string, { layer: Record<string, unknown>; parentMode?: string }>()
  const index = (l: Layer, path: string, parentMode?: string) => {
    byPath.set(path, { layer: l as unknown as Record<string, unknown>, parentMode })
    const kids = l.children ?? []
    const mode = l.layout?.mode
    kids.forEach((c) => index(c, childPath(path, c, kids), mode))
  }
  if (isObj(tree)) index(tree as unknown as Layer, String(tree.name))
  convertPlacementTree(tree)
  for (const d of diffs) {
    if (!isObj(d)) continue
    for (const e of Array.isArray(d.layers) ? d.layers : []) {
      if (!isObj(e) || !isObj(e.changes)) continue
      const at = typeof e.path === 'string' ? byPath.get(e.path) : undefined
      convertPlacement(e.changes, at?.parentMode, at?.layer)
    }
    for (const a of Array.isArray(d.added) ? d.added : []) if (isObj(a)) convertPlacementTree(a.layer, undefined)
  }
  inferPositions(tree)
  inferAddedIndexes(tree, diffs)
  return dropped
}

/**
 * The export does not say where a layer that only some variants have sits among its siblings, so it would land last.
 * When the same variant takes a sibling out of that parent (the banner alert swaps "Text section" for "Alert Content"),
 * the new layer takes the place of the one that went. Changes the diffs in place.
 */
export function inferAddedIndexes(tree: unknown, diffs: unknown[]): void {
  if (!isObj(tree)) return
  const where = new Map<string, { parent: string; index: number }>()
  const walk = (l: Layer, path: string) => {
    const kids = l.children ?? []
    kids.forEach((c, i) => { const cp = childPath(path, c, kids); where.set(cp, { parent: path, index: i }); walk(c, cp) })
  }
  walk(tree as unknown as Layer, String(tree.name))
  for (const d of diffs) {
    if (!isObj(d) || !Array.isArray(d.added) || !Array.isArray(d.removed)) continue
    const gone = d.removed.filter((r): r is string => typeof r === 'string').map((r) => ({ r, at: where.get(r) })).filter((x) => x.at)
    // The layers a variant adds are listed in their order, and take the place of the siblings it takes out (the first one's place, then one after another).
    const slot = new Map<string, number>()
    for (const a of d.added) {
      if (!isObj(a) || typeof a.parentPath !== 'string') continue
      if (typeof a.index === 'number') continue
      if (!slot.has(a.parentPath)) {
        const first = gone.filter((g) => g.at!.parent === a.parentPath).map((g) => g.at!.index)
        if (!first.length) continue
        slot.set(a.parentPath, Math.min(...first))
      }
      const at = slot.get(a.parentPath)!
      a.index = at
      slot.set(a.parentPath, at + 1)
    }
  }
}
