import { childPath, type Layer, type LayerChanges, type VariantDiff } from '../../markup/layers'
import type { DmComponent } from './schema'

/** Finds a component of the same file by the id of a component or variant. */
export type Library = (id: string) => { comp: DmComponent; variantId: string } | undefined

const MAX_DEPTH = 3
/** Layers one component may gain from the library. Keeps a card full of badges from growing without end. */
const MAX_ADDED_LAYERS = 400
const SHAPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'LINE'])

const clone = <T,>(v: T): T => structuredClone(v)

function countLayers(l: Layer): number {
  return 1 + (l.children ?? []).reduce((n, c) => n + countLayers(c), 0)
}

/** True when the tree is only shapes that have no drawing: an icon from an export without shape data, which would only be a box. */
function onlyShapes(l: Layer): boolean {
  const kids = l.children ?? []
  if (!kids.length) return !l.graphic && (SHAPES.has(l.type) || l.type === 'ELLIPSE' || l.type === 'RECTANGLE')
  return kids.every(onlyShapes) && !l.fills?.length
}
const hasText = (l: Layer): boolean => l.type === 'TEXT' || (l.children ?? []).some(hasText)

/** The tree of one variant: the default tree with that variant's differences applied. */
export function treeOfVariant(comp: DmComponent, variantId: string): Layer | undefined {
  const base = comp.tree as Layer | undefined
  if (!base || typeof base !== 'object') return undefined
  const tree = clone(base)
  if (!variantId || variantId === comp.defaultVariantId) return tree
  const diff = (comp.variantDiffs as VariantDiff[]).find((d) => d?.variantId === variantId)
  if (!diff) return tree

  const index = new Map<string, { layer: Layer; parent: Layer | null }>()
  const walk = (l: Layer, path: string, parent: Layer | null) => {
    index.set(path, { layer: l, parent })
    const kids = l.children ?? []
    kids.forEach((c) => walk(c, childPath(path, c, kids), l))
  }
  walk(tree, tree.name, null)
  for (const entry of diff.layers ?? []) {
    const hit = index.get(entry.path)
    if (hit) Object.assign(hit.layer, entry.changes as LayerChanges)
  }
  for (const path of diff.removed ?? []) {
    const hit = index.get(path)
    if (hit?.parent) hit.parent.children = (hit.parent.children ?? []).filter((c) => c !== hit.layer)
  }
  for (const a of diff.added ?? []) {
    const parent = index.get(a.parentPath)?.layer
    if (!parent) continue
    parent.children = parent.children ?? []
    parent.children.splice(typeof a.index === 'number' ? Math.min(a.index, parent.children.length) : parent.children.length, 0, clone(a.layer))
  }
  return tree
}

export interface Resolution {
  /** Instances that were filled in, by the name of the component they came from. */
  filled: string[]
  /** Instances left empty because they are icons (shapes only). */
  icons: number
  /** Instances left empty because the library does not hold them, or a limit was reached. */
  missing: number
}

/**
 * Fills in nested components the export left empty, from the same file. The export of one use of a component
 * does not carry what that use changed (an overridden label, say), so this shows the library version.
 * The tree is changed in place: pass a copy.
 */
export function resolveInstances(tree: Layer, library: Library): Resolution {
  const out: Resolution = { filled: [], icons: 0, missing: 0 }
  let added = 0

  const visit = (layer: Layer, depth: number, stack: string[]): void => {
    for (const child of layer.children ?? []) {
      if (child.type === 'INSTANCE' && !(child.children ?? []).length) {
        const found = child.instanceOf?.componentId ? library(child.instanceOf.componentId) : undefined
        const ref = found ? treeOfVariant(found.comp, found.variantId) : undefined
        if (!found || !ref || !(ref.children ?? []).length && !hasText(ref)) { out.missing++ }
        else if (depth >= MAX_DEPTH || stack.includes(found.comp.id)) out.missing++
        else if (!hasText(ref) && onlyShapes(ref)) out.icons++
        else if (added + countLayers(ref) > MAX_ADDED_LAYERS) out.missing++
        else {
          child.children = ref.children ?? []
          // The same library component can be used many times in one tree, and ids must stay unique: fields are matched to layers by id.
          const reId = (l: Layer) => { l.id = `${child.id}>${l.id}`; (l.children ?? []).forEach(reId) }
          child.children.forEach(reId)
          // The library root carries the look of the component; the instance keeps its own size and place.
          for (const key of ['layout', 'fills', 'strokes', 'radius', 'effects'] as const) if (child[key] === undefined && ref[key] !== undefined) (child as unknown as Record<string, unknown>)[key] = ref[key]
          added += countLayers(ref) - 1
          out.filled.push(found.comp.name)
          visit(child, depth + 1, [...stack, found.comp.id])
          continue
        }
      }
      visit(child, depth, stack)
    }
  }
  visit(tree, 0, [])
  return out
}
