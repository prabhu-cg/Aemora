import { childPath, type Layer, type LayerChanges, type VariantDiff } from '../../markup/layers'

/** What is compared between variants. Identity, roles and children are not attributes. */
const ATTRIBUTES = ['visible', 'size', 'sizing', 'layout', 'radius', 'opacity', 'fills', 'strokes', 'effects', 'text', 'instanceOf', 'propertyRefs', 'position', 'layoutPositioning', 'transform', 'clipsContent', 'blendMode', 'graphic'] as const

interface Entry { layer: Layer; parentPath: string | undefined }

/** Name paths for every layer, in document order. Same-name siblings get an index ("Icon[1]"). Layer ids differ per variant, so names tell layers apart. */
function index(root: Layer): Map<string, Entry> {
  const out = new Map<string, Entry>()
  const visit = (l: Layer, path: string, parentPath: string | undefined) => {
    out.set(path, { layer: l, parentPath })
    const kids = l.children ?? []
    kids.forEach((c) => visit(c, childPath(path, c, kids), path))
  }
  visit(root, root.name, undefined)
  return out
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function changesBetween(base: Layer, other: Layer): LayerChanges {
  const changes: Record<string, unknown> = {}
  for (const key of ATTRIBUTES) {
    const before = base[key]
    const after = other[key]
    if (after === undefined) {
      // Square corners are a value, so losing a radius is a change. Missing anything else means "does not apply here".
      if (key === 'radius' && before !== undefined) changes.radius = 0
      continue
    }
    if (!same(before, after)) changes[key] = after
  }
  return changes as LayerChanges
}

/**
 * How `variant` differs from `base`. A layer whose type changed counts as removed plus added. Only the top-most added or
 * removed layers are listed, their children come along inside them.
 */
export function diffVariant(base: Layer, variant: Layer, info: { variantId: string; variantProperties: Record<string, string> }): VariantDiff {
  const baseIndex = index(base)
  const variantIndex = index(variant)
  const layers: VariantDiff['layers'] = []
  const added: VariantDiff['added'] = []
  const removed: string[] = []
  const isMatch = (path: string) => {
    const a = baseIndex.get(path), b = variantIndex.get(path)
    return !!a && !!b && a.layer.type === b.layer.type
  }
  for (const [path, entry] of variantIndex) {
    if (isMatch(path)) {
      const changes = changesBetween(baseIndex.get(path)!.layer, entry.layer)
      if (Object.keys(changes).length) layers.push({ path, changes })
    } else if (entry.parentPath === undefined || isMatch(entry.parentPath)) {
      const siblings = variantIndex.get(entry.parentPath ?? '')?.layer.children ?? []
      added.push({ parentPath: entry.parentPath ?? '', index: siblings.indexOf(entry.layer), layer: entry.layer })
    }
  }
  for (const [path, entry] of baseIndex) {
    if (!isMatch(path) && (entry.parentPath === undefined || isMatch(entry.parentPath))) removed.push(path)
  }
  return { variantId: info.variantId, variantProperties: info.variantProperties, layers, added, removed }
}
