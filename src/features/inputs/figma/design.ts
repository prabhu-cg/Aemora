import { type Gradient, type Graphic, type Layer, type Layout, type Paint, type VariantDiff } from '../../markup/layers'
import { diffVariant } from './diff'
import { assignRoles } from './roles'

type Json = Record<string, unknown>
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const round = (n: number, d = 2) => { const k = 10 ** d; return Math.round(n * k) / k }

/** Most layers read from one component. A cap keeps a runaway tree from filling the browser. */
const MAX_LAYERS = 1500
/** Path data of one drawn layer above this size is left out and reported. */
const MAX_PATH_CHARS = 60_000
const VECTOR_TYPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'LINE', 'REGULAR_POLYGON'])

export interface DesignOptions {
  /** The `components` map of the response: component id -> { name }. Gives instances the name of what they are. */
  components?: Record<string, unknown>
  /** Reports what could not be carried over. */
  warn?: (message: string, where?: string) => void
}

interface Walk { count: number; truncated: boolean; opts: DesignOptions }

const hex2 = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, '0')
function color(c: unknown): { hex: string; alpha: number } | undefined {
  if (!isObj(c) || num(c.r) === undefined) return undefined
  return { hex: `#${hex2(num(c.r)!)}${hex2(num(c.g) ?? 0)}${hex2(num(c.b) ?? 0)}`, alpha: round(num(c.a) ?? 1, 3) }
}

/** Figma's gradient handles are points in the layer's box (0 to 1). CSS wants an angle and stops along its own gradient line. */
function gradientOf(p: Json, w: number, h: number): Gradient | undefined {
  const handles = Array.isArray(p.gradientHandlePositions) ? p.gradientHandlePositions.filter(isObj) : []
  const rawStops = Array.isArray(p.gradientStops) ? p.gradientStops.filter(isObj) : []
  if (handles.length < 2 || rawStops.length < 2) return undefined
  const paintAlpha = num(p.opacity) ?? 1
  const at = (i: number) => ({ x: num(handles[i].x) ?? 0, y: num(handles[i].y) ?? 0 })
  const p0 = at(0), p1 = at(1)
  const stopsAt = (position: (t: number) => number): Gradient['stops'] => rawStops.flatMap((s) => {
    const c = color(s.color)
    return c ? [{ position: round(position(num(s.position) ?? 0), 4), hex: c.hex, alpha: round(c.alpha * paintAlpha, 3) }] : []
  })
  if (str(p.type) === 'GRADIENT_RADIAL') {
    const p2 = handles[2] ? at(2) : p1
    const rx = Math.hypot((p1.x - p0.x) * w, (p1.y - p0.y) * h) / (w || 1)
    const ry = Math.hypot((p2.x - p0.x) * w, (p2.y - p0.y) * h) / (h || 1)
    return { kind: 'RADIAL', center: { x: round(p0.x, 4), y: round(p0.y, 4) }, radii: { x: round(rx, 4), y: round(ry, 4) }, stops: stopsAt((t) => t) }
  }
  const dx = (p1.x - p0.x) * w, dy = (p1.y - p0.y) * h
  const theta = Math.atan2(dx, -dy)
  const u = { x: Math.sin(theta), y: -Math.cos(theta) }
  const length = Math.abs(w * u.x) + Math.abs(h * u.y) || 1
  const start = { x: p0.x * w, y: p0.y * h }
  return {
    kind: 'LINEAR', angle: round((theta * 180) / Math.PI, 2),
    // A stop sits at t along Figma's line. On the CSS line, which spans the whole box, that is a different percentage.
    stops: stopsAt((t) => ((start.x + t * dx - w / 2) * u.x + (start.y + t * dy - h / 2) * u.y) / length + 0.5),
  }
}

function paintsOf(list: unknown, w: number, h: number): Paint[] | undefined {
  if (!Array.isArray(list)) return undefined
  const out: Paint[] = []
  for (const raw of list) {
    if (!isObj(raw)) continue
    const type = str(raw.type)
    const paint: Paint = { type, visible: raw.visible !== false }
    if (type === 'SOLID') {
      const c = color(raw.color)
      if (!c) continue
      paint.hex = c.hex
      paint.alpha = round(c.alpha * (num(raw.opacity) ?? 1), 3)
    } else if (type === 'GRADIENT_LINEAR' || type === 'GRADIENT_RADIAL') {
      const g = gradientOf(raw, w, h)
      if (g) paint.gradient = g
      else paint.description = `${type.slice(9).toLowerCase()} gradient`
    } else if (type === 'IMAGE') {
      paint.description = `image, scale mode ${str(raw.scaleMode) || 'unknown'}`
    } else paint.description = type.toLowerCase().replace(/_/g, ' ')
    out.push(paint)
  }
  return out
}

type Sizing = 'FIXED' | 'HUG' | 'FILL'

function layoutOf(n: Json, sizing: { h?: Sizing; v?: Sizing }): Layout | undefined {
  const mode = str(n.layoutMode)
  if (mode !== 'HORIZONTAL' && mode !== 'VERTICAL') return undefined
  const l: Layout = { mode }
  const gap = num(n.itemSpacing)
  if (gap) l.gap = gap
  const pad = { top: num(n.paddingTop) ?? 0, right: num(n.paddingRight) ?? 0, bottom: num(n.paddingBottom) ?? 0, left: num(n.paddingLeft) ?? 0 }
  if (pad.top || pad.right || pad.bottom || pad.left) l.padding = pad
  const pa = str(n.primaryAxisAlignItems), ca = str(n.counterAxisAlignItems)
  l.primaryAlign = (['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN'].includes(pa) ? pa : 'MIN') as Layout['primaryAlign']
  l.counterAlign = (['MIN', 'CENTER', 'MAX', 'BASELINE'].includes(ca) ? ca : 'MIN') as Layout['counterAlign']
  l.sizingH = sizing.h as Layout['sizingH']
  l.sizingV = sizing.v as Layout['sizingV']
  if (str(n.layoutWrap) === 'WRAP') l.wrap = true
  if (n.itemReverseZIndex === true) l.reverseZIndex = true
  return l
}

/** How a layer is sized: Figma says so directly, or it follows from the layer's own mode and what its parent asks of it. */
function sizingOf(n: Json, parentMode: string): { h: Sizing; v: Sizing } {
  const direct = (v: unknown): Sizing | undefined => (v === 'FIXED' || v === 'HUG' || v === 'FILL' ? v : undefined)
  const mode = str(n.layoutMode)
  const grow = num(n.layoutGrow) === 1, stretch = str(n.layoutAlign) === 'STRETCH'
  const fallback = (horizontal: boolean): Sizing => {
    if (parentMode === 'HORIZONTAL' && ((horizontal && grow) || (!horizontal && stretch))) return 'FILL'
    if (parentMode === 'VERTICAL' && ((!horizontal && grow) || (horizontal && stretch))) return 'FILL'
    if (mode === 'HORIZONTAL' || mode === 'VERTICAL') {
      const primaryIsHorizontal = mode === 'HORIZONTAL'
      const key = horizontal === primaryIsHorizontal ? 'primaryAxisSizingMode' : 'counterAxisSizingMode'
      return n[key] === 'AUTO' ? 'HUG' : 'FIXED'
    }
    return str(n.type) === 'TEXT' ? (str(isObj(n.style) ? n.style.textAutoResize : '') === 'WIDTH_AND_HEIGHT' ? 'HUG' : horizontal ? 'FIXED' : str(isObj(n.style) ? n.style.textAutoResize : '') === 'HEIGHT' ? 'HUG' : 'FIXED') : 'FIXED'
  }
  return { h: direct(n.layoutSizingHorizontal) ?? fallback(true), v: direct(n.layoutSizingVertical) ?? fallback(false) }
}

function textOf(n: Json): Layer['text'] | undefined {
  if (str(n.type) !== 'TEXT') return undefined
  const s = isObj(n.style) ? n.style : {}
  const t: NonNullable<Layer['text']> = { characters: str(n.characters) }
  if (str(s.fontFamily)) t.fontFamily = str(s.fontFamily)
  if (num(s.fontWeight)) t.fontWeight = num(s.fontWeight)
  if (num(s.fontSize)) t.fontSize = num(s.fontSize)
  const unit = str(s.lineHeightUnit)
  if (unit === 'PIXELS' && num(s.lineHeightPx)) t.lineHeight = { value: round(num(s.lineHeightPx)!), unit: 'px' }
  else if (unit === 'FONT_SIZE_%' && num(s.lineHeightPercentFontSize)) t.lineHeight = { value: round(num(s.lineHeightPercentFontSize)!), unit: 'percent' }
  else if (unit === 'INTRINSIC_%') t.lineHeight = { value: 100, unit: 'auto' }
  if (num(s.letterSpacing)) t.letterSpacing = { value: round(num(s.letterSpacing)!), unit: 'px' }
  if (str(s.textCase)) t.textCase = str(s.textCase)
  if (str(s.textDecoration)) t.textDecoration = str(s.textDecoration)
  if (str(s.textAlignHorizontal)) t.align = str(s.textAlignHorizontal)
  if (str(s.textAutoResize)) t.autoResize = str(s.textAutoResize)
  if (['TOP', 'CENTER', 'BOTTOM'].includes(str(s.textAlignVertical))) t.alignVertical = str(s.textAlignVertical) as 'TOP' | 'CENTER' | 'BOTTOM'
  if (s.italic === true) t.italic = true
  if (Array.isArray(n.characterStyleOverrides) && n.characterStyleOverrides.some((x) => x !== 0)) t.mixed = true
  return t
}

function geometry(list: unknown): { d: string; rule?: 'EVENODD' | 'NONZERO' }[] {
  if (!Array.isArray(list)) return []
  return list.filter(isObj).flatMap((g) => (str(g.path) ? [{ d: str(g.path), rule: str(g.windingRule) === 'EVENODD' ? ('EVENODD' as const) : undefined }] : []))
}

const identity = (m: number[][]) => Math.abs(m[0][0] - 1) < 1e-4 && Math.abs(m[1][1] - 1) < 1e-4 && Math.abs(m[0][1]) < 1e-4 && Math.abs(m[1][0]) < 1e-4
function matrixOf(n: Json): number[][] | undefined {
  const m = n.relativeTransform
  if (!Array.isArray(m) || m.length < 2 || !Array.isArray(m[0]) || !Array.isArray(m[1])) return undefined
  const rows = [m[0], m[1]].map((r) => (r as unknown[]).map((v) => num(v) ?? NaN))
  return rows.every((r) => r.length >= 3 && r.every((v) => Number.isFinite(v))) ? rows : undefined
}

/** A Figma node as a layer. `container` is the nearest ancestor that is not a group: what coordinates are measured from. */
function layerOf(n: Json, parent: Json | null, container: Json | null, w: Walk, rootName?: string): Layer | null {
  if (w.count >= MAX_LAYERS) { w.truncated = true; return null }
  w.count++
  const type = str(n.type)
  const size = isObj(n.size) && num(n.size.x) !== undefined ? { width: round(num(n.size.x)!), height: round(num(n.size.y) ?? 0) }
    : isObj(n.absoluteBoundingBox) && num(n.absoluteBoundingBox.width) !== undefined ? { width: round(num(n.absoluteBoundingBox.width)!), height: round(num(n.absoluteBoundingBox.height) ?? 0) } : undefined
  const layer: Layer = { id: str(n.id), name: rootName ?? (str(n.name) || type), type, visible: n.visible !== false }
  if (size) layer.size = size
  const w0 = size?.width ?? 0, h0 = size?.height ?? 0

  const parentMode = parent ? str(parent.layoutMode) : ''
  const inAutoLayout = parentMode === 'HORIZONTAL' || parentMode === 'VERTICAL'
  const absolute = str(n.layoutPositioning) === 'ABSOLUTE'
  const sz = sizingOf(n, absolute ? '' : parentMode)
  const layout = layoutOf(n, sz)
  if (layout) layer.layout = layout
  else if (parent && inAutoLayout && !absolute && type !== 'GROUP') layer.sizing = sz
  if (absolute) layer.layoutPositioning = 'ABSOLUTE'

  // Where it goes, when auto layout does not decide that: children of a frame without auto layout, and absolute children.
  const containerMode = container ? str(container.layoutMode) : ''
  const placedByCoordinates = !!container && (containerMode !== 'HORIZONTAL' && containerMode !== 'VERTICAL' || absolute)
  if (placedByCoordinates && type !== 'GROUP') {
    const m = matrixOf(n)
    const grouped = parent !== container
    const box = isObj(n.absoluteBoundingBox) ? n.absoluteBoundingBox : undefined
    const cbox = container && isObj(container.absoluteBoundingBox) ? container.absoluteBoundingBox : undefined
    if (grouped && box && cbox && num(box.x) !== undefined && num(cbox.x) !== undefined) layer.position = { x: round(num(box.x)! - num(cbox.x)!), y: round(num(box.y)! - num(cbox.y)!) }
    else if (m) layer.position = { x: round(m[0][2]), y: round(m[1][2]) }
    else if (box && cbox && num(box.x) !== undefined && num(cbox.x) !== undefined) layer.position = { x: round(num(box.x)! - num(cbox.x)!), y: round(num(box.y)! - num(cbox.y)!) }
    if (m && !grouped && !identity(m)) layer.transform = [round(m[0][0], 4), round(m[1][0], 4), round(m[0][1], 4), round(m[1][1], 4)]
  }

  if (n.clipsContent === true) layer.clipsContent = true
  const limits: NonNullable<Layer['sizeLimits']> = {}
  for (const k of ['minWidth', 'maxWidth', 'minHeight', 'maxHeight'] as const) { const v = num(n[k]); if (v !== undefined && v > 0) limits[k] = round(v) }
  if (Object.keys(limits).length) layer.sizeLimits = limits
  const opacity = num(n.opacity)
  if (opacity !== undefined && opacity < 1) layer.opacity = round(opacity, 3)
  const blend = str(n.blendMode)
  if (blend && blend !== 'PASS_THROUGH' && blend !== 'NORMAL') layer.blendMode = blend

  const fills = paintsOf(n.fills, w0, h0)
  if (fills?.length) layer.fills = fills
  const strokePaints = paintsOf(n.strokes, w0, h0)
  if (strokePaints?.length) {
    const ind = isObj(n.individualStrokeWeights) ? n.individualStrokeWeights : undefined
    const weights = ind ? { top: num(ind.top) ?? 0, right: num(ind.right) ?? 0, bottom: num(ind.bottom) ?? 0, left: num(ind.left) ?? 0 } : undefined
    const align = str(n.strokeAlign)
    layer.strokes = {
      paints: strokePaints,
      weight: round(num(n.strokeWeight) ?? (weights ? Math.max(weights.top, weights.right, weights.bottom, weights.left) : 0)),
      align: align === 'OUTSIDE' || align === 'CENTER' ? align : 'INSIDE',
      ...(weights ? { sides: weights } : {}),
      ...(Array.isArray(n.strokeDashes) && n.strokeDashes.length ? { dash: (n.strokeDashes as unknown[]).map((v) => num(v) ?? 0) } : {}),
    }
  }
  const corners = Array.isArray(n.rectangleCornerRadii) ? (n.rectangleCornerRadii as unknown[]).map((v) => num(v) ?? 0) : undefined
  if (corners?.length === 4 && new Set(corners).size > 1) layer.radius = { tl: corners[0], tr: corners[1], br: corners[2], bl: corners[3] }
  else if (num(n.cornerRadius)) layer.radius = round(num(n.cornerRadius)!)
  const effects = Array.isArray(n.effects) ? n.effects.filter(isObj).flatMap((e) => {
    const c = color(e.color)
    const t = str(e.type)
    if (!['DROP_SHADOW', 'INNER_SHADOW', 'LAYER_BLUR', 'BACKGROUND_BLUR'].includes(t)) return []
    const o = isObj(e.offset) ? e.offset : {}
    return [{ type: t, visible: e.visible !== false, ...(c ? { color: { hex: c.hex, alpha: c.alpha } } : {}), offsetX: num(o.x) ?? 0, offsetY: num(o.y) ?? 0, radius: num(e.radius) ?? 0, spread: num(e.spread) ?? 0 }]
  }) : []
  if (effects.length) layer.effects = effects

  const text = textOf(n)
  if (text) layer.text = text
  if (type === 'INSTANCE') {
    const id = str(n.componentId)
    const comp = id ? w.opts.components?.[id] : undefined
    layer.instanceOf = { componentId: id || undefined, componentName: isObj(comp) && str(comp.name) ? str(comp.name) : undefined }
  }
  const refs = isObj(n.componentPropertyReferences) ? n.componentPropertyReferences : undefined
  if (refs) {
    const pr: NonNullable<Layer['propertyRefs']> = {}
    if (str(refs.characters)) pr.characters = str(refs.characters)
    if (str(refs.visible)) pr.visible = str(refs.visible)
    if (str(refs.mainComponent)) pr.mainComponent = str(refs.mainComponent)
    if (Object.keys(pr).length) layer.propertyRefs = pr
  }

  if (VECTOR_TYPES.has(type)) {
    const g: Graphic = { fills: geometry(n.fillGeometry) }
    const strokes = geometry(n.strokeGeometry)
    if (strokes.length) g.strokes = strokes
    const chars = g.fills.reduce((a, p) => a + p.d.length, 0) + (g.strokes ?? []).reduce((a, p) => a + p.d.length, 0)
    if (chars > MAX_PATH_CHARS) w.opts.warn?.(`The drawing of "${layer.name}" is too large (${Math.round(chars / 1000)} thousand characters of path data), so it is shown as a box.`, layer.name)
    else if (g.fills.length || g.strokes?.length) layer.graphic = g
  }

  const kids = Array.isArray(n.children) ? n.children.filter(isObj) : []
  const children: Layer[] = []
  const childContainer = type === 'GROUP' ? container : n
  for (const c of kids) {
    const child = layerOf(c, n, childContainer, w)
    if (child) children.push(child)
  }
  if (children.length) layer.children = children
  return layer
}

/** "size=sm, state=default" -> { size: "sm", state: "default" } */
export function variantPropsOf(name: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of name.split(',')) {
    const m = /^\s*([^=]+?)\s*=\s*(.+?)\s*$/.exec(part)
    if (m) out[m[1]] = m[2]
  }
  return out
}

/** The default variant of a set: the one whose properties are the set's defaults. A single component is its own default. */
export function pickDefaultVariant(node: Json, kind: 'set' | 'single'): Json | undefined {
  if (kind === 'single') return node
  const variants = Array.isArray(node.children) ? node.children.filter((c): c is Json => isObj(c) && str(c.type) === 'COMPONENT') : []
  const defs = isObj(node.componentPropertyDefinitions) ? (node.componentPropertyDefinitions as Record<string, Json>) : {}
  const defaults: Record<string, string> = {}
  for (const [name, d] of Object.entries(defs)) if (isObj(d) && d.type === 'VARIANT' && typeof d.defaultValue === 'string') defaults[name] = d.defaultValue
  return variants.find((v) => { const p = variantPropsOf(str(v.name)); return Object.entries(defaults).every(([k, val]) => p[k] === val) }) ?? variants[0]
}

export interface BuiltDesign {
  format: 'aemora.design/v1'
  source: { kind: 'figma-rest' }
  states: string[]
  sizes: string[]
  defaultVariantId?: string
  defaultVariantProperties?: Record<string, string>
  treeTruncated: boolean
  tree: Layer
  variantDiffs: VariantDiff[]
  tokens: Record<string, never>
}

/**
 * The layer structure of a component or component set, from the Figma REST response (ask for it with geometry=paths, so
 * vector shapes and positions come with it). Same shape the DesignMD plugin's export is read into, so both ways in give
 * the same markup and preview.
 */
export function buildDesign(node: Json, kind: 'set' | 'single', opts: DesignOptions = {}): BuiltDesign | null {
  const walk: Walk = { count: 0, truncated: false, opts }
  const variants = kind === 'set' ? (Array.isArray(node.children) ? node.children.filter((c): c is Json => isObj(c) && str(c.type) === 'COMPONENT') : []) : [node]
  if (!variants.length) return null

  const defs = isObj(node.componentPropertyDefinitions) ? (node.componentPropertyDefinitions as Record<string, Json>) : {}
  const defaultNode = pickDefaultVariant(node, kind) ?? variants[0]

  const rootName = str(node.name) || 'Component'
  const container = isObj(defaultNode) ? defaultNode : null
  const tree = layerOf(defaultNode, null, container, walk, rootName)
  if (!tree) return null
  assignRoles(tree)

  const variantDiffs: VariantDiff[] = []
  let ambiguous = 0
  if (kind === 'set') {
    for (const v of variants) {
      if (v === defaultNode) continue
      const w2: Walk = { count: 0, truncated: false, opts: { ...opts, warn: undefined } }
      const t = layerOf(v, null, v, w2, rootName)
      if (!t) continue
      assignRoles(t)
      variantDiffs.push(diffVariant(tree, t, { variantId: str(v.id), variantProperties: variantPropsOf(str(v.name)), onAmbiguous: () => ambiguous++ }))
      if (w2.truncated) walk.truncated = true
    }
  }

  if (ambiguous) opts.warn?.(`In ${ambiguous} place${ambiguous === 1 ? '' : 's'}, a variant has a different number of layers with the same name than the default has (for example several layers called "Vector"). Layers are matched across variants by name, so those variants may change the wrong layer. Rename the layers to be unique in Figma to avoid this.`)

  const optionsOf = (re: RegExp) => [...new Set(Object.entries(defs).flatMap(([name, d]) => (re.test(name) && isObj(d) && Array.isArray(d.variantOptions) ? (d.variantOptions as unknown[]).map(String) : [])))]
  return {
    format: 'aemora.design/v1', source: { kind: 'figma-rest' },
    states: optionsOf(/\bstates?\b/i), sizes: optionsOf(/\bsizes?\b/i),
    defaultVariantId: str(defaultNode.id) || undefined,
    defaultVariantProperties: kind === 'set' ? variantPropsOf(str(defaultNode.name)) : undefined,
    treeTruncated: walk.truncated, tree, variantDiffs, tokens: {},
  }
}

