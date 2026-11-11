import type { Gradient, Layer, LayerChanges, Paint, Radii } from './layers'
import { toKey } from '../components/detect'
import { modifier, slug } from './naming'
import { withChanges, type Factor, type Node, type Structure } from './structure'
import type { MarkupNote } from './types'

type Decl = [string, string]
interface Ctx { isRoot: boolean; parentMode?: 'HORIZONTAL' | 'VERTICAL'; notes: MarkupNote[]; layer: string; /** Keys of the yes/no properties of this component. */ boolKeys?: Set<string>; /** Placed by its coordinates in its frame, not by the frame's auto layout. */ absolute?: boolean }
interface Rule { selectors: string[]; decls: Decl[] }

const round = (n: number) => Math.round(n * 100) / 100
const px = (n: number) => (n === 0 ? '0' : `${round(n)}px`)
const KEYS = ['position', 'transform', 'layout', 'size', 'clipsContent', 'blendMode', 'fills', 'strokes', 'radius', 'effects', 'opacity', 'text', 'visible'] as const

function rgba(r: number, g: number, b: number, a: number) { return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${round(a)})` }

function hexColor(hex: string, alpha = 1): string {
  const h = hex.slice(0, 7).toLowerCase()
  if (alpha >= 1) return h
  const n = parseInt(h.slice(1), 16)
  return rgba((n >> 16) & 255, (n >> 8) & 255, n & 255, alpha)
}

function solid(p: Paint): string | null {
  if (p.type !== 'SOLID' || p.visible === false || !p.hex) return null
  const c = hexColor(p.hex, p.alpha ?? 1)
  return p.token?.cssName ? `var(${p.token.cssName}, ${c})` : c
}

/** The top-most visible solid paint. Other kinds are reported, not drawn. */
function topPaint(paints: Paint[] | undefined, ctx: Ctx, what: string): string | null {
  const visible = (paints ?? []).filter((p) => p.visible !== false)
  const other = visible.find((p) => p.type !== 'SOLID')
  if (other) ctx.notes.push({ level: 'warning', layer: ctx.layer, message: `A ${other.type.toLowerCase().replace(/_/g, ' ')} ${what} is not reproduced in the CSS.` })
  for (let i = visible.length - 1; i >= 0; i--) { const c = solid(visible[i]); if (c) return c }
  return null
}

/** Markers that layoutDecls leaves for overlapRules to turn into rules for the items inside. They never reach the output. */
const OVERLAP = '--overlap', OVERLAP_SIDE = '--overlap-side', TOP_FIRST = '--top-first'

const JUSTIFY = { MIN: 'flex-start', CENTER: 'center', MAX: 'flex-end', SPACE_BETWEEN: 'space-between' } as const
const ALIGN = { MIN: 'flex-start', CENTER: 'center', MAX: 'flex-end', BASELINE: 'baseline' } as const

function layoutDecls(eff: Layer, ctx: Ctx): Decl[] {
  const l = eff.layout
  if (!l) return []
  const out: Decl[] = [['display', ctx.isRoot && l.sizingH === 'HUG' ? 'inline-flex' : 'flex'], ['flex-direction', l.mode === 'HORIZONTAL' ? 'row' : 'column']]
  if (l.wrap) out.push(['flex-wrap', 'wrap'])
  // With space between, Figma keeps a gap value but does not use it: the free space is the gap.
  if (l.gap && l.gap > 0 && l.primaryAlign !== 'SPACE_BETWEEN') out.push(['gap', px(l.gap)])
  // A negative gap (layers overlapping) cannot be a CSS gap. It is written as a margin on every item after the first (see overlapRules).
  else if (l.gap && l.gap < 0 && l.primaryAlign !== 'SPACE_BETWEEN') out.push(['gap', '0'], [OVERLAP, px(l.gap)], [OVERLAP_SIDE, l.mode === 'HORIZONTAL' ? 'margin-left' : 'margin-top'])
  if (l.reverseZIndex) out.push([TOP_FIRST, '1'])
  if (l.padding) {
    let { top: t, right: r, bottom: b, left: x } = l.padding
    // A fixed box can be smaller than its padding in Figma and the content just overflows. CSS never lets a box shrink below its padding.
    const sz = eff.size
    if (sz && l.sizingH === 'FIXED' && x + r > sz.width) { const half = Math.floor(sz.width / 2); x = Math.min(x, half); r = Math.min(r, half) }
    if (sz && l.sizingV === 'FIXED' && t + b > sz.height) { const half = Math.floor(sz.height / 2); t = Math.min(t, half); b = Math.min(b, half) }
    if (t || r || b || x) out.push(['padding', t === b && r === x ? (t === r ? px(t) : `${px(t)} ${px(r)}`) : `${px(t)} ${px(r)} ${px(b)} ${px(x)}`])
  }
  if (l.primaryAlign && l.primaryAlign !== 'MIN') out.push(['justify-content', JUSTIFY[l.primaryAlign]])
  // Flex stretches children across by default. Figma only does that when a child asks to fill, so "start" must be said out loud.
  out.push(['align-items', ALIGN[l.counterAlign ?? 'MIN']])
  return out
}

/** `explicit`: these are a variant's overrides, so what the base rule set for flex and size must be undone where the sizing changed. */
function sizeDecls(eff: Layer, ctx: Ctx, explicit = false): Decl[] {
  const sz = eff.size
  if (!sz) return []
  const out: Decl[] = []
  const axis = (horizontal: boolean) => {
    const sizing = horizontal ? (eff.layout?.sizingH ?? eff.sizing?.h) : (eff.layout?.sizingV ?? eff.sizing?.v)
    const dim = horizontal ? 'width' : 'height'
    // A box that hugs its content has nothing to hug when everything in it is placed by coordinates, so it keeps its size.
    const inFlow = (eff.children ?? []).some((c) => c.layoutPositioning !== 'ABSOLUTE' && c.visible !== false)
    const empty = !!eff.layout && !!eff.children?.length && !inFlow
    const alongMain = !!ctx.parentMode && (ctx.parentMode === 'HORIZONTAL') === horizontal
    if (sizing === 'HUG' && !empty) {
      if (explicit && eff.type !== 'TEXT') { out.push([dim, 'auto']); if (alongMain) out.push(['flex', '0 0 auto']) }
      return
    }
    if (sizing === 'FILL' && !ctx.absolute) {
      if (explicit && ctx.parentMode && !alongMain && eff.type !== 'TEXT') out.push([dim, 'auto'])
      // The root has no parent to fill, so it keeps the size it has in the design.
      if (!ctx.parentMode) { if (eff.type !== 'TEXT') out.push([dim, px(horizontal ? sz.width : sz.height)]); return }
      const along = (ctx.parentMode === 'HORIZONTAL') === horizontal
      // Padding counts toward a flex item's starting size, so items that share a row would not come out equal if some had padding and others none.
      // Every item that fills along a row starts from its size in the design, where they are equal, and the space left over is shared equally.
      // In a column the height follows the content, so it starts from nothing.
      if (along) out.push(['flex', horizontal ? `1 1 ${px(sz.width)}` : '1 1 0'], [horizontal ? 'min-width' : 'min-height', '0'])
      else out.push(['align-self', 'stretch'])
      return
    }
    // Text follows its words unless its box is fixed.
    if (eff.type === 'TEXT') return
    if (explicit && ctx.parentMode && !ctx.absolute) out.push(alongMain ? ['flex', '0 0 auto'] : ['align-self', 'auto'])
    out.push([dim, px(horizontal ? sz.width : sz.height)])
  }
  axis(true); axis(false)
  // Text that grows with its words never wraps.
  if (eff.type === 'TEXT' && eff.text?.autoResize === 'WIDTH_AND_HEIGHT') out.push(['white-space', 'nowrap'])
  // A box with a size of its own must really have it. Inline elements ignore width and height, and flex items shrink by default.
  if (out.some(([p]) => p === 'width' || p === 'height')) {
    if (!eff.layout) out.push(['display', 'block'])
    out.push(['flex-shrink', '0'])
  }
  return out
}

function stopColor(st: { hex: string; alpha: number }): string { return hexColor(st.hex, st.alpha) }

function gradientCss(g: Gradient): string {
  const stops = g.stops.map((st) => `${stopColor(st)} ${round(st.position * 100)}%`).join(', ')
  if (g.kind === 'RADIAL') return `radial-gradient(ellipse ${round((g.radii?.x ?? 0.5) * 100)}% ${round((g.radii?.y ?? 0.5) * 100)}% at ${round((g.center?.x ?? 0.5) * 100)}% ${round((g.center?.y ?? 0.5) * 100)}%, ${stops})`
  return `linear-gradient(${round(g.angle ?? 180)}deg, ${stops})`
}

function fillDecls(eff: Layer, ctx: Ctx, explicit: boolean): Decl[] {
  // A drawn shape is coloured through `color`, which its paths take with currentColor.
  const prop = eff.type === 'TEXT' || eff.graphic ? 'color' : 'background-color'
  const visible = (eff.fills ?? []).filter((p) => p.visible !== false)
  if (prop === 'background-color' && visible.some((p) => p.gradient)) {
    // Several fills, or a gradient: stack them as background layers, the top-most first.
    const layers = [...visible].reverse().flatMap((p) => (p.gradient ? [gradientCss(p.gradient)] : solid(p) ? [`linear-gradient(${solid(p)}, ${solid(p)})`] : []))
    if (layers.length) return [['background-image', layers.join(', ')]]
  }
  const c = topPaint(eff.fills, ctx, 'fill')
  if (c) return [[prop, c]]
  return explicit && eff.type !== 'TEXT' ? [[prop, 'transparent']] : []
}

/**
 * Strokes are drawn as shadows, not borders. A border changes the size of a box, but a stroke in Figma never does:
 * an inside stroke sits within the layer, an outside stroke around it, and a centered one half and half.
 */
function strokeShadows(eff: Layer, ctx: Ctx): string[] {
  const s = eff.strokes
  const c = s ? topPaint(s.paints, ctx, 'stroke') : null
  // A drawn shape's outline is part of its drawing, and a dashed stroke is an outline (below).
  if (eff.graphic || !s || !c || s.dash?.length) return []
  const w = s.weight ?? 0
  const sides = s.sides && new Set(Object.values(s.sides)).size > 1 ? s.sides : undefined
  if (!sides && w <= 0) return []
  if (sides) {
    // One band per side with a weight. A shadow shifted by the weight shows only as a band on that side.
    const grow = s.align === 'OUTSIDE' ? 1 : s.align === 'CENTER' ? 0.5 : 0
    const k = s.align === 'OUTSIDE' ? '' : 'inset '
    const out: string[] = []
    const band = (x: number, y: number, weight: number) => {
      if (weight <= 0) return
      if (s.align === 'CENTER') { out.push(`inset ${px(x * weight / 2)} ${px(y * weight / 2)} 0 0 ${c}`, `${px(-x * weight / 2)} ${px(-y * weight / 2)} 0 0 ${c}`) } else out.push(`${k}${px((grow ? -1 : 1) * x * weight)} ${px((grow ? -1 : 1) * y * weight)} 0 0 ${c}`)
    }
    band(0, 1, sides.top); band(-1, 0, sides.right); band(0, -1, sides.bottom); band(1, 0, sides.left)
    return out
  }
  if (s.align === 'OUTSIDE') return [`0 0 0 ${px(w)} ${c}`]
  if (s.align === 'CENTER') return [`inset 0 0 0 ${px(w / 2)} ${c}`, `0 0 0 ${px(w / 2)} ${c}`]
  return [`inset 0 0 0 ${px(w)} ${c}`]
}

/** A dashed stroke: an outline, which also leaves the size alone. */
function dashDecls(eff: Layer, ctx: Ctx): Decl[] {
  const s = eff.strokes
  const c = s ? topPaint(s.paints, ctx, 'stroke') : null
  if (!s || !c || !s.dash?.length || (s.weight ?? 0) <= 0 || eff.graphic) return []
  const w = s.weight!
  return [['outline', `${px(w)} dashed ${c}`], ['outline-offset', s.align === 'OUTSIDE' ? '0' : s.align === 'CENTER' ? `-${px(w / 2)}` : `-${px(w)}`]]
}

function radiusDecls(eff: Layer): Decl[] {
  // An ellipse is round whatever its size. A drawn one (an arc) is its drawing.
  if (eff.type === 'ELLIPSE' && !eff.graphic) return [['border-radius', '50%']]
  const r = eff.radius
  if (r === undefined) return []
  if (typeof r === 'number') return r > 0 ? [['border-radius', px(r)]] : []
  const o = r as Radii
  return [['border-radius', `${px(o.tl)} ${px(o.tr)} ${px(o.br)} ${px(o.bl)}`]]
}

function effectShadows(eff: Layer): string[] {
  const out: string[] = []
  for (const e of eff.effects ?? []) {
    if (e.visible === false || (e.type !== 'DROP_SHADOW' && e.type !== 'INNER_SHADOW')) continue
    const col = e.color ? (e.color.hex ? hexColor(e.color.hex, e.color.alpha ?? 1) : rgba(e.color.r ?? 0, e.color.g ?? 0, e.color.b ?? 0, e.color.a ?? e.color.alpha ?? 1)) : 'rgba(0, 0, 0, 0.25)'
    out.push(`${e.type === 'INNER_SHADOW' ? 'inset ' : ''}${px(e.offsetX ?? 0)} ${px(e.offsetY ?? 0)} ${px(e.radius ?? 0)} ${px(e.spread ?? 0)} ${col}`)
  }
  return out
}

function blurDecls(eff: Layer): Decl[] {
  const out: Decl[] = []
  for (const e of eff.effects ?? []) {
    if (e.visible === false) continue
    if (e.type === 'LAYER_BLUR') out.push(['filter', `blur(${px(e.radius ?? 0)})`])
    else if (e.type === 'BACKGROUND_BLUR') out.push(['backdrop-filter', `blur(${px(e.radius ?? 0)})`])
  }
  return out
}

/** Strokes and shadows share one box-shadow list, with the stroke on top. */
function shadowDecls(eff: Layer, ctx: Ctx, explicit: boolean): Decl[] {
  const all = [...strokeShadows(eff, ctx), ...effectShadows(eff)]
  return all.length ? [['box-shadow', all.join(', ')]] : explicit ? [['box-shadow', 'none']] : []
}

function textDecls(eff: Layer, ctx: Ctx): Decl[] {
  const t = eff.text
  if (!t) return []
  if (t.mixed) ctx.notes.push({ level: 'info', layer: ctx.layer, message: 'This text mixes styles. The CSS uses its main style only.' })
  const out: Decl[] = []
  if (t.fontFamily) out.push(['font-family', `"${t.fontFamily}", sans-serif`])
  if (t.fontSize) out.push(['font-size', px(t.fontSize)])
  if (t.fontWeight) out.push(['font-weight', String(t.fontWeight)])
  if (t.lineHeight) out.push(['line-height', t.lineHeight.unit === 'px' ? px(t.lineHeight.value) : t.lineHeight.unit === 'percent' ? String(round(t.lineHeight.value / 100)) : 'normal'])
  if (t.letterSpacing && t.letterSpacing.value) out.push(['letter-spacing', t.letterSpacing.unit === 'px' ? px(t.letterSpacing.value) : `${round(t.letterSpacing.value / 100)}em`])
  const tc = { UPPER: 'uppercase', LOWER: 'lowercase', TITLE: 'capitalize' }[t.textCase ?? ''] as string | undefined
  if (tc) out.push(['text-transform', tc])
  if (t.textCase === 'SMALL_CAPS' || t.textCase === 'SMALL_CAPS_FORCED') out.push(['font-variant-caps', 'small-caps'])
  if (t.italic) out.push(['font-style', 'italic'])
  if (t.textDecoration === 'UNDERLINE') out.push(['text-decoration', 'underline'])
  if (t.textDecoration === 'STRIKETHROUGH') out.push(['text-decoration', 'line-through'])
  const align = { CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justify' }[t.align ?? ''] as string | undefined
  if (align) out.push(['text-align', align])
  return out
}

/**
 * A layer turned a quarter or half turn inside an auto layout takes the room its turned shape takes (a divider of 42 by 1 turned
 * 90 degrees is 1 by 42). CSS transforms do not change layout, so the box turns about its centre and its margins make up the difference.
 * Other angles are left as they are.
 */
function turnDecls(eff: Layer): Decl[] {
  const t = eff.transform, sz = eff.size
  if (!t || !sz) return []
  const quarter = Math.abs(t[0]) < 0.001 && Math.abs(t[3]) < 0.001 && Math.abs(Math.abs(t[1]) - 1) < 0.001
  const half = Math.abs(t[1]) < 0.001 && Math.abs(t[2]) < 0.001 && Math.abs(t[0] + 1) < 0.001 && Math.abs(t[3] + 1) < 0.001
  if (!quarter && !half) return []
  const out: Decl[] = [['transform', `matrix(${t.map((n) => round(n * 10000) / 10000).join(', ')}, 0, 0)`], ['transform-origin', 'center']]
  if (quarter) {
    const mx = round((sz.height - sz.width) / 2), my = round((sz.width - sz.height) / 2)
    if (mx || my) out.push(['margin', `${px(my)} ${px(mx)}`])
  }
  return out
}

const BLEND: Record<string, string> = { MULTIPLY: 'multiply', SCREEN: 'screen', OVERLAY: 'overlay', DARKEN: 'darken', LIGHTEN: 'lighten', COLOR_DODGE: 'color-dodge', COLOR_BURN: 'color-burn', HARD_LIGHT: 'hard-light', SOFT_LIGHT: 'soft-light', DIFFERENCE: 'difference', EXCLUSION: 'exclusion', HUE: 'hue', SATURATION: 'saturation', COLOR: 'color', LUMINOSITY: 'luminosity' }

function displayFor(eff: Layer): string {
  return eff.layout ? 'flex' : eff.type === 'TEXT' ? 'inline' : 'block'
}

/** Declarations for the attributes in `attrs`, resolved against the effective layer. */
function declsFor(attrs: LayerChanges, eff: Layer, ctx: Ctx, explicit: boolean): Decl[] {
  const out: Decl[] = []
  for (const k of KEYS) {
    if (!(k in attrs) || (attrs as Record<string, unknown>)[k] === undefined) continue
    switch (k) {
      case 'position': if (ctx.absolute && eff.position) out.push(['position', 'absolute'], ['left', px(eff.position.x)], ['top', px(eff.position.y)]); break
      case 'transform': if (!ctx.absolute && eff.transform) out.push(...turnDecls(eff)); else if (ctx.absolute && eff.transform) out.push(['transform', `matrix(${eff.transform.map((n) => round(n * 10000) / 10000).join(', ')}, 0, 0)`], ['transform-origin', '0 0']); break
      case 'clipsContent': if (eff.clipsContent) out.push(['overflow', 'hidden']); else if (explicit) out.push(['overflow', 'visible']); break
      case 'blendMode': { const m = BLEND[eff.blendMode ?? '']; if (m) out.push(['mix-blend-mode', m]); else if (explicit) out.push(['mix-blend-mode', 'normal']); break }
      case 'layout': out.push(...layoutDecls(eff, ctx)); break
      case 'size':
        if (eff.type === 'GROUP') break
        out.push(...sizeDecls(eff, ctx, explicit))
        // A text box that is placed by coordinates keeps the width it has in the design, unless it follows its text.
        if (ctx.absolute && eff.type === 'TEXT' && eff.size) { out.push(['width', px(eff.size.width)], ['flex-shrink', '0']); if (eff.text?.autoResize === 'WIDTH_AND_HEIGHT') out.push(['white-space', 'nowrap']) }
        break
      case 'fills': out.push(...fillDecls(eff, ctx, explicit)); break
      case 'strokes': case 'effects': if (!out.some(([p]) => p === 'box-shadow')) out.push(...shadowDecls(eff, ctx, explicit)); if (k === 'strokes') out.push(...dashDecls(eff, ctx)); if (k === 'effects') out.push(...blurDecls(eff)); break
      case 'radius': out.push(...radiusDecls(eff)); break
      case 'opacity': if (eff.opacity !== undefined && (explicit || eff.opacity < 1)) out.push(['opacity', String(round(eff.opacity))]); break
      case 'text': out.push(...textDecls(eff, ctx)); break
      // A layer that a yes/no property switches is shown or hidden by the HTL, so the CSS must not hide it for good.
      case 'visible':
        if (eff.visible === false) {
          // Hidden in the design. Only a yes/no property of this component can show it again, through the HTL. A property of
          // a nested component (a badge's own "has icon") is already settled in the design, so the layer stays hidden.
          const ref = eff.propertyRefs?.visible
          if (!(ref && ctx.boolKeys?.has(toKey(ref)))) out.push(['display', 'none'])
        } else if (explicit) out.push(['display', displayFor(eff)])
        break
    }
  }
  // A frame's size and layout can change on their own. Re-emit the sizing that depends on both.
  if (explicit && ('layout' in attrs) && !('size' in attrs) && eff.size) out.push(...sizeDecls(eff, ctx))
  // A turned layer's margins follow its size.
  if (explicit && 'size' in attrs && !('transform' in attrs) && eff.transform && !ctx.absolute) out.push(...turnDecls(eff))
  return dedupe(out)
}

function dedupe(decls: Decl[]): Decl[] {
  const last = new Map<string, number>()
  decls.forEach(([p], i) => last.set(p, i))
  return decls.filter(([p], i) => last.get(p) === i)
}

const STATE_SELECTORS: { match: RegExp; rank: number; selector: (root: string) => string[] }[] = [
  { match: /^(hover|hovered)$/i, rank: 1, selector: (r) => [`${r}:hover`] },
  { match: /^(focus|focused)$/i, rank: 2, selector: (r) => [`${r}:focus-visible`] },
  { match: /^pressed$/i, rank: 3, selector: (r) => [`${r}:active`] },
  // "Active" in a tab, a menu or a pager means the current one, not a mouse button held down.
  { match: /^active$/i, rank: 5, selector: (r) => [`${r}[aria-selected="true"]`, `${r}.is-active`] },
  { match: /^(disabled|de-activated|deactivated|inactive)$/i, rank: 4, selector: (r) => [`${r}:disabled`, `${r}[aria-disabled="true"]`] },
  { match: /^selected$/i, rank: 5, selector: (r) => [`${r}[aria-selected="true"]`, `${r}.is-selected`] },
  { match: /^checked$/i, rank: 5, selector: (r) => [`${r}[aria-checked="true"]`, `${r}.is-checked`] },
  { match: /^(expanded|open|opened)$/i, rank: 5, selector: (r) => [`${r}[aria-expanded="true"]`, `${r}.is-${'open'}`] },
]
const isDefaultState = (v: string) => /^(default|enabled|rest|normal)$/i.test(v)

/** What browsers add to some tags that the design does not have: margins, borders, padding, underlines. */
const TAG_RESETS: Record<string, Decl[]> = {
  button: [['margin', '0'], ['padding', '0'], ['border', '0'], ['background', 'none'], ['font', 'inherit'], ['cursor', 'pointer']],
  a: [['text-decoration', 'none'], ['cursor', 'pointer']],
  input: [['margin', '0'], ['padding', '0'], ['border', '0'], ['background', 'none'], ['font', 'inherit']],
  hr: [['margin', '0'], ['border', '0']],
  p: [['margin', '0']], h1: [['margin', '0']], h2: [['margin', '0']], h3: [['margin', '0']], h4: [['margin', '0']], h5: [['margin', '0']], h6: [['margin', '0']],
}

export function generateCss(st: Structure, block: string, notes: MarkupNote[], tags: Map<Node, string> = new Map(), boolKeys: Set<string> = new Set()): string {
  const rootSel = `.${block}`
  const sel = (n: Node) => (n.el ? `${rootSel}__${n.el}` : rootSel)
  // Figma groups are not containers: what is inside one is placed in the frame around it. A group is a box with no box (display: contents).
  // The exception is a group inside an auto-layout frame: there it is one item of the layout, with its own coordinates inside, so it stays a box.
  const groupBox = (n: Node) => n.layer.type === 'GROUP' && !!n.parent?.layer.layout
  const isGroup = (n: Node) => n.layer.type === 'GROUP' && !groupBox(n)
  const container = (n: Node): Node | null => { let p = n.parent; while (p && isGroup(p)) p = p.parent; return p }
  const isAbsolute = (n: Node): boolean => {
    if (!n.layer.position || isGroup(n)) return false
    const c = container(n)
    return !!c && (!c.layer.layout || n.layer.layoutPositioning === 'ABSOLUTE')
  }
  const hasAbsolute = (n: Node): boolean => n.children.some((c) => isAbsolute(c) || (isGroup(c) && hasAbsolute(c)))
  // The direction a layer's parent lays out in, in a variant: the parent's own change to it, or else the default.
  const modeIn = (n: Node, layers: { path: string; changes: LayerChanges }[]) => layers.find((l) => l.path === n.parent?.path)?.changes.layout?.mode ?? n.parent?.layer.layout?.mode
  const rules: Rule[] = []
  const done = new Set<string>()
  const baseDecls = new Map<Node, Decl[]>()
  const applied: { factor: Factor; value: string; node: Node; decls: Decl[] }[] = []
  const unique: Node[] = []

  // Base styles, one rule per element class.
  for (const n of st.nodes) {
    const key = n.el ?? ''
    if (done.has(key)) continue
    done.add(key)
    const ctx: Ctx = { isRoot: !n.parent, parentMode: n.parent?.layer.layout?.mode, notes, layer: n.layer.name, boolKeys, absolute: isAbsolute(n) }
    const attrs: LayerChanges = {}
    for (const k of KEYS) if (n.layer[k] !== undefined) (attrs as Record<string, unknown>)[k] = n.layer[k]
    if (n.layer.type === 'ELLIPSE') attrs.radius = n.layer.radius ?? 0
    const decls: Decl[] = []
    if (n.layer.type !== 'TEXT') decls.push(['box-sizing', 'border-box'])
    decls.push(...(TAG_RESETS[tags.get(n) ?? ''] ?? []))
    if (isGroup(n)) decls.push(['display', 'contents'])
    else if (groupBox(n) && n.layer.size) decls.push(['position', 'relative'], ['display', 'block'], ['width', px(n.layer.size.width)], ['height', px(n.layer.size.height)], ['flex-shrink', '0'])
    else if (!isAbsolute(n) && hasAbsolute(n)) decls.push(['position', 'relative'])
    decls.push(...declsFor(attrs, n.layer, ctx, false))
    if (n.showIn?.length) decls.push(['display', 'none'])
    const cleaned = dedupe(decls)
    baseDecls.set(n, cleaned)
    unique.push(n)
    rules.push({ selectors: [sel(n)], decls: cleaned })
    // The outline of a drawn shape is its own path, filled with the stroke colour.
    if (n.layer.graphic?.strokes?.length) {
      const stroke = topPaint(n.layer.strokes?.paints, ctx, 'stroke')
      if (stroke) rules.push({ selectors: [`${sel(n)}-stroke`], decls: [['fill', stroke]] })
    }
  }

  // Variants: options that differ from the default in one property become modifier classes or interaction states.
  const ordered = [...st.single].sort((a, b) => {
    const rank = (x: typeof a) => (x.factor.isState ? (STATE_SELECTORS.find((s) => s.match.test(x.value))?.rank ?? 6) : 0)
    return rank(a) - rank(b)
  })
  for (const { factor, value, diff } of ordered) {
    const prefixes = prefixesFor(factor, value, rootSel)
    if (!prefixes) continue
    if (factor.isState && prefixes.list[0].includes('.is-')) {
      const msg = `The state "${value}" is styled with the class is-${slug(value)}${/selected|checked|expanded|open/i.test(value) ? ' or the matching aria attribute' : ''}. Set it from your script or server code.`
      if (!notes.some((n) => n.message === msg)) notes.push({ level: 'info', message: msg })
    }
    const extra: Decl[] = factor.isState && prefixes.disabled ? [['cursor', 'not-allowed']] : []
    // The export does not say that a layer changes places between options. A layer named for the option (a "pointer" for "pointer position")
    // sits after the others when the option starts with right or bottom.
    if (!factor.isState && /^(right|bottom|end|after|below)\b/i.test(value.trim())) {
      const words = (x: string) => x.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)
      const fw = words(factor.name)
      for (const n of unique) {
        const nw = words(n.layer.name)
        if (!(n.parent?.layer.layout && nw.length && nw.every((w) => fw.includes(w)))) continue
        const decls: Decl[] = [['order', '1']]
        rules.push({ selectors: prefixes.list.map((p) => `${p} ${sel(n)}`), decls })
        // Items that overlap (a negative gap) take their margin on the second one as drawn. Moved to the end, this item is the second.
        const lay = diff.layers.find((l) => l.path === n.parent!.path)?.changes.layout ?? n.parent.layer.layout
        if (lay && lay.gap && lay.gap < 0) {
          decls.push([(lay.mode ?? n.parent.layer.layout.mode) === 'HORIZONTAL' ? 'margin-left' : 'margin-top', px(lay.gap)])
          rules.push({ selectors: prefixes.list.map((p) => `${n.parent!.el ? `${p} ${sel(n.parent!)}` : p} > :not(${sel(n)})`), decls: [['margin-left', '0'], ['margin-top', '0']] })
        }
      }
    }
    for (const entry of diff.layers) {
      const node = st.byPath.get(entry.path)
      if (!node) continue
      const eff = withChanges(node.layer, entry.changes)
      const ctx: Ctx = { isRoot: !node.parent, parentMode: modeIn(node, diff.layers), notes, layer: node.layer.name, boolKeys, absolute: isAbsolute(node) }
      const baseCtx: Ctx = { ...ctx, parentMode: node.parent?.layer.layout?.mode }
      const baseAttrs: LayerChanges = {}
      for (const k of Object.keys(entry.changes)) (baseAttrs as Record<string, unknown>)[k] = (node.layer as unknown as Record<string, unknown>)[k]
      const base = declsFor(baseAttrs, node.layer, baseCtx, true)
      const decls = declsFor(entry.changes, eff, ctx, true).filter(([p, v]) => !base.some(([bp, bv]) => bp === p && bv === v))
      if (!node.parent) decls.push(...extra)
      if (!decls.length) continue
      applied.push({ factor, value, node, decls })
      rules.push({ selectors: prefixes.list.map((p) => (node.el ? `${p} ${rootSel}__${node.el}` : p)), decls })
    }
  }
  // Layers that exist only in an interaction state are shown in the state where the design has them.
  for (const n of unique) {
    // A layer the design itself hides stays hidden in the state too, unless a yes/no property of this component switches it.
    const ref = n.layer.propertyRefs?.visible
    if (n.layer.visible === false && !(ref && boolKeys.has(toKey(ref)))) continue
    for (const { factor, value, when } of n.showIn ?? []) {
      const prefixes = prefixesFor(factor, value, rootSel)
      if (!prefixes) continue
      // The state, and, when only some looks of the component have the layer, those looks as well.
      const looks = (when ?? [[]]).map((term) => term.map((t) => `${rootSel}--${slug(t.factor.name)}-${modifier(t.value)}`).join(''))
      const where = (target: Node) => prefixes.list.flatMap((p) => looks.map((l) => `${p}${l} ${sel(target)}`))
      rules.push({ selectors: where(n), decls: [['display', displayFor(n.layer)]] })
      // The same layer drawn another way in this state (the active tab's own colors) replaces the default one, it does not join it.
      for (const base of unique) {
        if (base !== n && base.parent === n.parent && base.layer.name === n.layer.name && !base.showIn?.length) rules.push({ selectors: where(base), decls: [['display', 'none']] })
      }
    }
  }

  // Options picked together. The single-option rules above would stack, which is not always what Figma has for the combination
  // (a large button with a leading icon has its own padding). Wherever the stack would differ, the combination says so.
  for (const { combo, diff } of st.multi) {
    const looks = combo.filter((c) => !c.factor.isState).map((c) => `${rootSel}--${slug(c.factor.name)}-${modifier(c.value)}`).join('')
    const state = combo.find((c) => c.factor.isState)
    const prefixes = state ? prefixesFor(state.factor, state.value, rootSel) : null
    if (state && !prefixes) continue
    // Without a state the options are classes on the root. With one, the state's selectors come first and the classes follow.
    const roots = prefixes ? prefixes.list.map((p) => `${p}${looks}`) : [looks]
    for (const node of unique) {
      const change = diff.layers.find((l) => l.path === node.path)?.changes
      const eff = change ? withChanges(node.layer, change) : node.layer
      const ctx: Ctx = { isRoot: !node.parent, parentMode: modeIn(node, diff.layers), notes: [], layer: node.layer.name, boolKeys, absolute: isAbsolute(node) }
      const attrs: LayerChanges = {}
      for (const k of KEYS) if (eff[k] !== undefined) (attrs as Record<string, unknown>)[k] = eff[k]
      let real = declsFor(attrs, eff, ctx, false)
      // A layer the design shows or hides only in this combination must say so, even when what it says is "shown".
      if (change?.visible !== undefined) real = dedupe([...real, ...declsFor({ visible: change.visible }, eff, ctx, true)])
      const cascade = new Map<string, string>(baseDecls.get(node) ?? [])
      const stacked = new Set<string>()
      for (const a of applied) {
        if (a.node === node && combo.some((c) => c.factor === a.factor && c.value === a.value)) for (const [p, v] of a.decls) { cascade.set(p, v); stacked.add(p) }
      }
      // A layer that exists only in some interaction states is hidden by default and shown by its own rules.
      // Comparing it with that hiding would show it in every combination, so its display is left to those rules.
      // A combination that says "no border, no shadow" in so many words draws none, whatever the single options stacked up.
      if (change && ('strokes' in change || 'effects' in change)) {
        const said: LayerChanges = { ...('strokes' in change ? { strokes: change.strokes } : {}), ...('effects' in change ? { effects: change.effects } : {}) }
        for (const d of declsFor(said, eff, ctx, true)) if (d[0] === 'box-shadow' && !(d[1] === 'none' && !cascade.has('box-shadow'))) real = dedupe([...real, d])
      }
      const differs = real.filter(([p, v]) => cascade.get(p) !== v && !(p === 'display' && node.showIn?.length))
      // What one option adds (the pill's border) may not be there in the combination (the hovered pill has none). Put it back to the base.
      for (const p of stacked) {
        if (p === 'display' || real.some(([rp]) => rp === p)) continue
        const back = (baseDecls.get(node) ?? []).find(([bp]) => bp === p)?.[1] ?? 'initial'
        if (cascade.get(p) !== back) differs.push([p, back])
      }
      if (differs.length) rules.push({ selectors: roots.map((r) => (node.el ? `${r} ${rootSel}__${node.el}` : r)), decls: differs })
    }
  }

  // Layers the design does not have in some interaction states are hidden there. These come last so nothing above shows them again.
  for (const n of unique) {
    for (const { factor, value, when } of n.hideIn ?? []) {
      const prefixes = prefixesFor(factor, value, rootSel)
      if (!prefixes) continue
      const looks = (when ?? [[]]).map((term) => term.map((t) => `${rootSel}--${slug(t.factor.name)}-${modifier(t.value)}`).join(''))
      rules.push({ selectors: prefixes.list.flatMap((p) => looks.map((l) => `${p}${l} ${sel(n)}`)), decls: [['display', 'none']] })
    }
  }

  return overlapRules(rules).map((r) => `${r.selectors.join(',\n')} {\n${r.decls.map(([p, v]) => `  ${p}: ${v};`).join('\n')}\n}`).join('\n\n') + '\n'
}

/**
 * Turns the markers of layoutDecls into rules. A negative gap becomes a negative margin on every item after the first,
 * and "first on top" lifts the first item. Where a variant changes the gap, the margin of the base is put back.
 */
function overlapRules(rules: Rule[]): Rule[] {
  const any = rules.some((r) => r.decls.some(([p]) => p === OVERLAP))
  if (!any && !rules.some((r) => r.decls.some(([p]) => p === TOP_FIRST))) return rules
  const out: Rule[] = []
  for (const r of rules) {
    const get = (k: string) => r.decls.find(([p]) => p === k)?.[1]
    const decls = r.decls.filter(([p]) => ![OVERLAP, OVERLAP_SIDE, TOP_FIRST].includes(p))
    out.push({ ...r, decls })
    const items = (suffix: string) => r.selectors.map((s) => `${s}${suffix}`)
    if (get(OVERLAP)) out.push({ selectors: items(' > * + *'), decls: [['margin-left', '0'], ['margin-top', '0'], [get(OVERLAP_SIDE)!, get(OVERLAP)!]] })
    else if (any && decls.some(([p]) => p === 'gap') && r.selectors.some((s) => s.includes('--'))) out.push({ selectors: items(' > * + *'), decls: [['margin-left', '0'], ['margin-top', '0']] })
    if (get(TOP_FIRST)) out.push({ selectors: items(' > :first-child'), decls: [['position', 'relative'], ['z-index', '1']] })
  }
  return out
}

function prefixesFor(factor: Factor, value: string, rootSel: string): { list: string[]; disabled: boolean } | null {
  if (factor.isState) {
    if (isDefaultState(value)) return null
    const s = STATE_SELECTORS.find((x) => x.match.test(value))
    if (s) return { list: s.selector(rootSel), disabled: s.rank === 4 }
    // A state authors cannot pick (error, loading ...): a class that scripts or server code can set.
    return { list: [`${rootSel}.is-${slug(value)}`], disabled: false }
  }
  return { list: [`${rootSel}--${slug(factor.name)}-${modifier(value)}`], disabled: false }
}
