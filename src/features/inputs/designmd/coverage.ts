/**
 * What the export holds that Aemora does not draw. Checked on every import, so a design feature that is dropped is said,
 * and so is a field a newer plugin has added that Aemora has never heard of.
 */

/** Layer fields Aemora reads (after the adapter has renamed placement, rotation and vector). */
const LAYER_KEYS = new Set(['id', 'name', 'type', 'visible', 'children', 'size', 'opacity', 'effects', 'role', 'roleSource', 'strokes', 'fills', 'clipsContent', 'position', 'layout', 'instanceOf', 'text', 'radius', 'propertyRefs', 'blendMode', 'graphic', 'transform', 'sizing', 'layoutPositioning', 'constraints', 'box', 'sizeLimits', 'effectiveOpacity'])
const TEXT_KEYS = new Set(['fontFamily', 'fontWeight', 'fontSize', 'lineHeight', 'letterSpacing', 'textCase', 'textDecoration', 'align', 'autoResize', 'characters', 'styleId', 'token', 'mixed', 'runs', 'italic', 'alignVertical', 'truncation', 'maxLines', 'leadingTrim'])
const STROKE_KEYS = new Set(['paints', 'weight', 'align', 'sides', 'dash'])

/** Fields the export has that are known, and not applied. Said in the words of a designer. */
const NOT_APPLIED: Record<string, string> = {
  'layer.cornerSmoothing': 'smooth (squircle) corners are drawn as plain rounded corners',
  'layer.layoutGrids': 'layout grids are not used',
  'text.paragraphSpacing': 'paragraph spacing is not applied',
  'text.hyperlink': 'links inside text are not applied',
  'stroke.cap': 'line ends of strokes are not applied',
  'stroke.join': 'corner joins of strokes are not applied',
  'stroke.miterLimit': 'the miter limit of strokes is not applied',
  'fill.IMAGE': 'pictures (image fills) are not drawn yet, so they are shown as plain boxes',
  'fill.GRADIENT': 'gradients without colour stops, and angular or diamond gradients, are drawn flat or not at all',
}

export interface Coverage {
  /** Known features of the design that are not applied, with how many layers have them. */
  notApplied: { feature: string; layers: number }[]
  /** Fields this version of Aemora has never heard of, with how many layers have them. */
  unknown: { field: string; layers: number }[]
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function scanCoverage(trees: unknown[]): Coverage {
  const counts = new Map<string, number>()
  const bump = (k: string, seen: Set<string>) => { if (!seen.has(k)) { seen.add(k); counts.set(k, (counts.get(k) ?? 0) + 1) } }
  const visit = (l: unknown) => {
    if (!isObj(l)) return
    const seen = new Set<string>()
    for (const k of Object.keys(l)) if (!LAYER_KEYS.has(k)) bump(`layer.${k}`, seen)
    if (isObj(l.text)) for (const k of Object.keys(l.text)) if (!TEXT_KEYS.has(k)) bump(`text.${k}`, seen)
    if (isObj(l.strokes)) for (const k of Object.keys(l.strokes)) if (!STROKE_KEYS.has(k)) bump(`stroke.${k}`, seen)
    for (const f of Array.isArray(l.fills) ? l.fills : []) {
      if (!isObj(f) || f.visible === false || typeof f.type !== 'string' || f.type === 'SOLID') continue
      // A linear or radial gradient with its stops is drawn.
      if (f.type.startsWith('GRADIENT_')) { if (!((f.type === 'GRADIENT_LINEAR' || f.type === 'GRADIENT_RADIAL') && (f.gradient || Array.isArray(f.stops)))) bump('fill.GRADIENT', seen) }
      else bump(`fill.${f.type}`, seen)
    }
    if (Array.isArray(l.children)) l.children.forEach(visit)
  }
  trees.forEach(visit)
  const out: Coverage = { notApplied: [], unknown: [] }
  for (const [k, layers] of counts) {
    if (NOT_APPLIED[k]) out.notApplied.push({ feature: NOT_APPLIED[k], layers })
    else out.unknown.push({ field: k.replace(/^(layer|text|stroke|fill)\./, (_, p) => `${p === 'layer' ? '' : `${p}.`}`), layers })
  }
  // The same sentence can come from several fields (every gradient kind).
  const merged = new Map<string, number>()
  for (const n of out.notApplied) merged.set(n.feature, (merged.get(n.feature) ?? 0) + n.layers)
  out.notApplied = [...merged].map(([feature, layers]) => ({ feature, layers })).sort((a, b) => b.layers - a.layers)
  out.unknown.sort((a, b) => b.layers - a.layers)
  return out
}
