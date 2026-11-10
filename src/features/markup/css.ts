import type { Layer, LayerChanges, Paint, Radii } from './layers'
import { modifier, slug } from './naming'
import { withChanges, type Factor, type Node, type Structure } from './structure'
import type { MarkupNote } from './types'

type Decl = [string, string]
interface Ctx { isRoot: boolean; parentMode?: 'HORIZONTAL' | 'VERTICAL'; notes: MarkupNote[]; layer: string }
interface Rule { selectors: string[]; decls: Decl[] }

const round = (n: number) => Math.round(n * 100) / 100
const px = (n: number) => (n === 0 ? '0' : `${round(n)}px`)
const KEYS = ['layout', 'size', 'fills', 'strokes', 'radius', 'effects', 'opacity', 'text', 'visible'] as const

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

const JUSTIFY = { MIN: 'flex-start', CENTER: 'center', MAX: 'flex-end', SPACE_BETWEEN: 'space-between' } as const
const ALIGN = { MIN: 'flex-start', CENTER: 'center', MAX: 'flex-end', BASELINE: 'baseline' } as const

function layoutDecls(eff: Layer, ctx: Ctx): Decl[] {
  const l = eff.layout
  if (!l) return []
  const out: Decl[] = [['display', ctx.isRoot && l.sizingH === 'HUG' ? 'inline-flex' : 'flex'], ['flex-direction', l.mode === 'HORIZONTAL' ? 'row' : 'column']]
  if (l.wrap) out.push(['flex-wrap', 'wrap'])
  if (l.gap) out.push(['gap', px(l.gap)])
  if (l.padding) {
    const { top: t, right: r, bottom: b, left: x } = l.padding
    if (t || r || b || x) out.push(['padding', t === b && r === x ? (t === r ? px(t) : `${px(t)} ${px(r)}`) : `${px(t)} ${px(r)} ${px(b)} ${px(x)}`])
  }
  if (l.primaryAlign && l.primaryAlign !== 'MIN') out.push(['justify-content', JUSTIFY[l.primaryAlign]])
  // Flex stretches children across by default. Figma only does that when a child asks to fill, so "start" must be said out loud.
  out.push(['align-items', ALIGN[l.counterAlign ?? 'MIN']])
  return out
}

function sizeDecls(eff: Layer, ctx: Ctx): Decl[] {
  const sz = eff.size
  if (!sz || eff.type === 'TEXT') return []
  const out: Decl[] = []
  const axis = (horizontal: boolean) => {
    const sizing = horizontal ? eff.layout?.sizingH : eff.layout?.sizingV
    const dim = horizontal ? 'width' : 'height'
    if (sizing === 'HUG') return
    if (sizing === 'FILL') {
      // The root has no parent to fill, so it keeps the size it has in the design.
      if (!ctx.parentMode) { out.push([dim, px(horizontal ? sz.width : sz.height)]); return }
      const along = (ctx.parentMode === 'HORIZONTAL') === horizontal
      if (along) out.push(['flex', '1 1 0'], [horizontal ? 'min-width' : 'min-height', '0'])
      else out.push(['align-self', 'stretch'])
      return
    }
    out.push([dim, px(horizontal ? sz.width : sz.height)])
  }
  axis(true); axis(false)
  // A box with a size of its own must really have it. Inline elements ignore width and height, and flex items shrink by default.
  if (out.some(([p]) => p === 'width' || p === 'height')) {
    if (!eff.layout) out.push(['display', 'block'])
    out.push(['flex-shrink', '0'])
  }
  return out
}

function fillDecls(eff: Layer, ctx: Ctx, explicit: boolean): Decl[] {
  const c = topPaint(eff.fills, ctx, 'fill')
  const prop = eff.type === 'TEXT' ? 'color' : 'background-color'
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
  if (!s || !c || (s.weight ?? 0) <= 0) return []
  const w = s.weight!
  if (s.align === 'OUTSIDE') return [`0 0 0 ${px(w)} ${c}`]
  if (s.align === 'CENTER') return [`inset 0 0 0 ${px(w / 2)} ${c}`, `0 0 0 ${px(w / 2)} ${c}`]
  return [`inset 0 0 0 ${px(w)} ${c}`]
}

function radiusDecls(eff: Layer): Decl[] {
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
  if (t.textDecoration === 'UNDERLINE') out.push(['text-decoration', 'underline'])
  if (t.textDecoration === 'STRIKETHROUGH') out.push(['text-decoration', 'line-through'])
  const align = { CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justify' }[t.align ?? ''] as string | undefined
  if (align) out.push(['text-align', align])
  return out
}

function displayFor(eff: Layer): string {
  return eff.layout ? 'flex' : eff.type === 'TEXT' ? 'inline' : 'block'
}

/** Declarations for the attributes in `attrs`, resolved against the effective layer. */
function declsFor(attrs: LayerChanges, eff: Layer, ctx: Ctx, explicit: boolean): Decl[] {
  const out: Decl[] = []
  for (const k of KEYS) {
    if (!(k in attrs) || (attrs as Record<string, unknown>)[k] === undefined) continue
    switch (k) {
      case 'layout': out.push(...layoutDecls(eff, ctx)); break
      case 'size': out.push(...sizeDecls(eff, ctx)); break
      case 'fills': out.push(...fillDecls(eff, ctx, explicit)); break
      case 'strokes': case 'effects': if (!out.some(([p]) => p === 'box-shadow')) out.push(...shadowDecls(eff, ctx, explicit)); if (k === 'effects') out.push(...blurDecls(eff)); break
      case 'radius': out.push(...radiusDecls(eff)); break
      case 'opacity': if (eff.opacity !== undefined && (explicit || eff.opacity < 1)) out.push(['opacity', String(round(eff.opacity))]); break
      case 'text': out.push(...textDecls(eff, ctx)); break
      // A layer that a yes/no property switches is shown or hidden by the HTL, so the CSS must not hide it for good.
      case 'visible': if (eff.visible === false) { if (!eff.propertyRefs?.visible) out.push(['display', 'none']) } else if (explicit) out.push(['display', displayFor(eff)]); break
    }
  }
  // A frame's size and layout can change on their own. Re-emit the sizing that depends on both.
  if (explicit && ('layout' in attrs) && !('size' in attrs) && eff.size) out.push(...sizeDecls(eff, ctx))
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
  { match: /^(pressed|active)$/i, rank: 3, selector: (r) => [`${r}:active`] },
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

export function generateCss(st: Structure, block: string, notes: MarkupNote[], tags: Map<Node, string> = new Map()): string {
  const rootSel = `.${block}`
  const sel = (n: Node) => (n.el ? `${rootSel}__${n.el}` : rootSel)
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
    const ctx: Ctx = { isRoot: !n.parent, parentMode: n.parent?.layer.layout?.mode, notes, layer: n.layer.name }
    const attrs: LayerChanges = {}
    for (const k of KEYS) if (n.layer[k] !== undefined) (attrs as Record<string, unknown>)[k] = n.layer[k]
    const decls: Decl[] = []
    if (n.layer.type !== 'TEXT') decls.push(['box-sizing', 'border-box'])
    decls.push(...(TAG_RESETS[tags.get(n) ?? ''] ?? []))
    decls.push(...declsFor(attrs, n.layer, ctx, false))
    if (n.showIn?.length) decls.push(['display', 'none'])
    const cleaned = dedupe(decls)
    baseDecls.set(n, cleaned)
    unique.push(n)
    rules.push({ selectors: [sel(n)], decls: cleaned })
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
    for (const entry of diff.layers) {
      const node = st.byPath.get(entry.path)
      if (!node) continue
      const eff = withChanges(node.layer, entry.changes)
      const ctx: Ctx = { isRoot: !node.parent, parentMode: node.parent?.layer.layout?.mode, notes, layer: node.layer.name }
      const baseAttrs: LayerChanges = {}
      for (const k of Object.keys(entry.changes)) (baseAttrs as Record<string, unknown>)[k] = (node.layer as unknown as Record<string, unknown>)[k]
      const base = declsFor(baseAttrs, node.layer, ctx, true)
      const decls = declsFor(entry.changes, eff, ctx, true).filter(([p, v]) => !base.some(([bp, bv]) => bp === p && bv === v))
      if (!node.parent) decls.push(...extra)
      if (!decls.length) continue
      if (!factor.isState) applied.push({ factor, value, node, decls })
      rules.push({ selectors: prefixes.list.map((p) => (node.el ? `${p} ${rootSel}__${node.el}` : p)), decls })
    }
  }
  // Layers that exist only in an interaction state are shown in the state where the design has them.
  for (const n of unique) {
    for (const { factor, value, when } of n.showIn ?? []) {
      const prefixes = prefixesFor(factor, value, rootSel)
      if (!prefixes) continue
      // The state, and, when only some looks of the component have the layer, those looks as well.
      const looks = (when ?? [[]]).map((term) => term.map((t) => `${rootSel}--${slug(t.factor.name)}-${modifier(t.value)}`).join(''))
      rules.push({ selectors: prefixes.list.flatMap((p) => looks.map((l) => `${p}${l} ${sel(n)}`)), decls: [['display', displayFor(n.layer)]] })
    }
  }

  // Options picked together. The single-option rules above would stack, which is not always what Figma has for the combination
  // (a large button with a leading icon has its own padding). Wherever the stack would differ, the combination says so.
  for (const { combo, diff } of st.multi) {
    const compound = combo.map((c) => `${rootSel}--${slug(c.factor.name)}-${modifier(c.value)}`).join('')
    for (const node of unique) {
      const change = diff.layers.find((l) => l.path === node.path)?.changes
      const eff = change ? withChanges(node.layer, change) : node.layer
      const ctx: Ctx = { isRoot: !node.parent, parentMode: node.parent?.layer.layout?.mode, notes: [], layer: node.layer.name }
      const attrs: LayerChanges = {}
      for (const k of KEYS) if (eff[k] !== undefined) (attrs as Record<string, unknown>)[k] = eff[k]
      const real = declsFor(attrs, eff, ctx, false)
      const cascade = new Map<string, string>(baseDecls.get(node) ?? [])
      for (const a of applied) {
        if (a.node === node && combo.some((c) => c.factor === a.factor && c.value === a.value)) for (const [p, v] of a.decls) cascade.set(p, v)
      }
      const differs = real.filter(([p, v]) => cascade.get(p) !== v)
      if (differs.length) rules.push({ selectors: [node.el ? `${compound} ${rootSel}__${node.el}` : compound], decls: differs })
    }
  }

  return rules.map((r) => `${r.selectors.join(',\n')} {\n${r.decls.map(([p, v]) => `  ${p}: ${v};`).join('\n')}\n}`).join('\n\n') + '\n'
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
