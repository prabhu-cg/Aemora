// Checks the generated markup against the design it came from, in a real browser frame.
// It needs layout, so it cannot run under jsdom: the Preview tab runs it, and so can any page with a frame.
import { toKey } from '../components/detect'
import type { ComponentDef } from '../components/schema'
import type { DmComponent } from '../inputs/designmd/schema'
import { treeOfVariant } from '../inputs/designmd/resolve'
import { childPath, readDesign, type Layer, type Paint, type VariantDiff } from '../markup/layers'
import { renderHtl } from '../markup/render/render'
import { buildModel, defaultSamples } from '../markup/render/samples'
import { buildStructure, type Node } from '../markup/structure'
import { paintFrame } from '../preview/paintFrame'

export type MismatchKind = 'size' | 'position' | 'color' | 'order' | 'missing'

export interface Mismatch {
  kind: MismatchKind
  /** The option values this variant has, for example "type=banners, state=error". */
  variant: string
  /** Layer name path in the design. */
  path: string
  expected: string
  actual: string
}

export interface FidelityReport {
  variants: number
  /** Variants that were not drawn (interaction states, which are checked by hand for now). */
  skippedVariants: number
  /** How many comparisons were made, per kind, and how many held. */
  checked: Record<MismatchKind, number>
  matched: Record<MismatchKind, number>
  /** Layers in the design that could not be matched to a layer of the markup. */
  unmatched: number
  /** All comparisons that held, over all comparisons. 1 means every one held. */
  score: number
  mismatches: Mismatch[]
  /** What this check cannot see, so a clean score is not read as more than it is. */
  limits: string[]
}

export const SIZE_TOLERANCE = 1.5
const COLOR_TOLERANCE = 3
const ALPHA_TOLERANCE = 0.03
const MAX_MISMATCHES = 300

const KINDS: MismatchKind[] = ['size', 'position', 'color', 'order', 'missing']
export const FIDELITY_LIMITS = [
  'Pictures are not in the export, so they are not compared.',
  'Interaction states (hover, focus, disabled) are not drawn by this check.',
  'Text uses the fallback font here, so text boxes are held at the design size and only their colour and order are compared.',
  'Gradients, blend modes, shadows and rotation are not compared yet.',
  'Positions are compared only when the export has the design\'s box for each layer (DesignMD 1.3 or later).',
]

interface Rgba { r: number; g: number; b: number; a: number }

function parseCssColor(value: string): Rgba | null {
  const m = /^rgba?\(([^)]+)\)$/.exec(value.trim())
  if (!m) return null
  const [r, g, b, a = '1'] = m[1].split(/[\s,/]+/).filter(Boolean)
  const out = { r: Number(r), g: Number(g), b: Number(b), a: Number(a) }
  return Object.values(out).every(Number.isFinite) ? out : null
}

function parseHex(hex: string, alpha = 1): Rgba | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: alpha }
}

const sameColor = (a: Rgba, b: Rgba) => Math.abs(a.r - b.r) <= COLOR_TOLERANCE && Math.abs(a.g - b.g) <= COLOR_TOLERANCE && Math.abs(a.b - b.b) <= COLOR_TOLERANCE && Math.abs(a.a - b.a) <= ALPHA_TOLERANCE
const show = (c: Rgba) => `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.round(c.a * 100) / 100})`

/** The colour a layer is drawn in: its top visible solid fill, or null when there is none or something other than plain colour is in play. */
function expectedColor(l: Layer): Rgba | null {
  const visible = (l.fills ?? []).filter((p: Paint) => p.visible !== false)
  if (!visible.length || visible.some((p) => p.type !== 'SOLID')) return null
  const top = visible[visible.length - 1]
  return top.hex ? parseHex(top.hex, top.alpha ?? 1) : null
}

function walk(layer: Layer, path: string, visit: (l: Layer, path: string, parent: Layer | null) => void, parent: Layer | null = null): void {
  visit(layer, path, parent)
  const kids = layer.children ?? []
  kids.forEach((c) => walk(c, childPath(path, c, kids), visit, layer))
}

const label = (vp: Record<string, string> | null) => (vp && Object.keys(vp).length ? Object.entries(vp).map(([k, v]) => `${k}=${v}`).join(', ') : 'default')

const rendered = (el: Element, win: Window): boolean => {
  const r = el.getBoundingClientRect()
  return r.width > 0 || r.height > 0 || win.getComputedStyle(el).display === 'contents'
}

/**
 * Draws every option combination of the component in `doc` and compares each layer with the design:
 * its size, its colour, whether it is there, and the order of the items in each row or column.
 * `html` and `css` are what the preview shows (hand edits included), `blockClass` is the root class of the markup.
 */
export function checkFidelity(component: ComponentDef, html: string, css: string, blockClass: string, doc: Document, onProgress?: (done: number, total: number) => void): FidelityReport | null {
  const design = readDesign(component)
  const win = doc.defaultView
  if (!design?.tree || !win || !doc.body) return null
  const st = buildStructure(design, component.properties, [])
  if (!st) return null

  const checked = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<MismatchKind, number>
  const matched = { ...checked }
  const mismatches: Mismatch[] = []
  const unmatched = new Set<string>()
  const record = (kind: MismatchKind, ok: boolean, m: Omit<Mismatch, 'kind'>) => {
    checked[kind]++
    if (ok) matched[kind]++
    else if (mismatches.length < MAX_MISMATCHES) mismatches.push({ kind, ...m })
  }

  const stateFactors = st.factors.filter((f) => f.isState)
  const defaults = design.defaultVariantProperties ?? {}
  const asComponent = { tree: design.tree, variantDiffs: design.variantDiffs, defaultVariantId: '' } as unknown as DmComponent
  const variants: { vp: Record<string, string> | null; diff?: VariantDiff }[] = [{ vp: null }, ...design.variantDiffs.map((d) => ({ vp: d.variantProperties, diff: d }))]
  let skipped = 0
  let done = 0

  // Class of each markup element -> the design layer it was made from.
  const byClass = new Map<string, Node>()
  for (const n of st.nodes) byClass.set(n.el ? `${blockClass}__${n.el}` : blockClass, n)

  for (const { vp, diff } of variants) {
    done++
    onProgress?.(done, variants.length)
    const full = { ...defaults, ...(vp ?? {}) }
    if (stateFactors.some((f) => full[f.name] !== f.default)) { skipped++; continue }

    const tree = treeOfVariant(asComponent, diff?.variantId ?? '')
    if (!tree) continue
    const expected = new Map<string, { layer: Layer; parent: Layer | null }>()
    // A layer inside one the design hides is not drawn either, so it is treated as hidden.
    const hiddenPaths = new Set<string>()
    walk(tree, tree.name, (l, p, parent) => {
      expected.set(p, { layer: l, parent })
      const up = parent ? [...hiddenPaths].some((h) => p.startsWith(`${h}/`)) : false
      if (l.visible === false || up) hiddenPaths.add(p)
    })

    // Sample values that put the component in this variant: its option values, and each yes/no property on where the design shows the layer it switches.
    const samples = defaultSamples(component.properties)
    for (const p of component.properties) {
      if (p.type === 'boolean') samples[p.key] = true
      const f = st.factors.find((x) => x.key === p.key)
      if (f) samples[p.key] = full[f.name]
    }
    const shows = new Map<string, boolean>()
    for (const n of st.nodes) {
      const ref = n.layer.propertyRefs?.visible
      if (!ref) continue
      const v = expected.get(n.path)?.layer.visible ?? n.layer.visible
      shows.set(toKey(ref), (shows.get(toKey(ref)) ?? false) || v !== false)
    }
    for (const [key, on] of shows) if (component.properties.some((p) => p.key === key && p.type === 'boolean')) samples[key] = on

    paintFrame(doc, { css, body: renderHtl(html, buildModel(component.properties, samples)).body, state: 'default', bg: 'light', zoom: '1' })
    const name = label(vp)

    // Text is held at the design size: the fallback font is not the design's font, so its width says nothing about the markup.
    const elementsOf = (n: Node): HTMLElement[] => [...doc.getElementsByClassName(n.el ? `${blockClass}__${n.el}` : blockClass)] as HTMLElement[]
    for (const n of st.nodes) {
      const e = expected.get(n.path)
      if (!e || e.layer.type !== 'TEXT' || !e.layer.size) continue
      for (const el of elementsOf(n)) {
        if (win.getComputedStyle(el).display === 'none') continue
        Object.assign(el.style, { display: 'inline-block', flex: 'none', width: `${e.layer.size.width}px`, height: `${e.layer.size.height}px`, overflow: 'hidden' })
      }
    }

    // A layer that has a look per option has one copy in the markup for each look, and only one is drawn. The design layer is matched to that one.
    const copies = new Map<string, Node[]>()
    for (const n of st.nodes) copies.set(n.path, [...(copies.get(n.path) ?? []), n])
    for (const n of st.nodes) if (!expected.has(n.path)) unmatched.add(n.path)
    const rootEl = doc.body.firstElementChild
    const rootRect = rootEl?.getBoundingClientRect()
    for (const [path, e] of expected) {
      const layer = e.layer
      // A layer the design hides is not compared, nor a group (it has no box of its own).
      if (layer.visible === false || hiddenPaths.has(path) || layer.type === 'GROUP' || !layer.size) continue
      const nodes = copies.get(path)
      if (!nodes) continue
      const els = nodes.flatMap(elementsOf)
      const el = els.find((x) => rendered(x, win))
      if (!el) {
        // Shown in the design, but nothing is drawn. A layer that a yes/no field or an interaction state controls may be absent.
        const n = nodes[0]
        const switched = !!layer.propertyRefs?.visible || nodes.some((x) => x.showIn?.length)
        if (!switched) record('missing', false, { variant: name, path, expected: `${layer.size.width}x${layer.size.height}`, actual: els.length ? 'not drawn' : `no element (${n.el ?? 'root'})` })
        continue
      }
      record('missing', true, { variant: name, path, expected: '', actual: '' })

      const r = el.getBoundingClientRect()
      // A turned layer is measured by its turned outline here, which is not its size in the design.
      if (!layer.transform) {
        const ok = Math.abs(r.width - layer.size.width) <= SIZE_TOLERANCE && Math.abs(r.height - layer.size.height) <= SIZE_TOLERANCE
        record('size', ok, { variant: name, path, expected: `${layer.size.width}x${layer.size.height}`, actual: `${Math.round(r.width * 10) / 10}x${Math.round(r.height * 10) / 10}` })
      }

      // Where the layer is, from the top left of the root. A turned layer is not compared: its box is where it started.
      if (layer.box && rootRect && !layer.transform && (layer.type !== 'TEXT')) {
        const dx = r.left - rootRect.left, dy = r.top - rootRect.top
        const ok = Math.abs(dx - layer.box.x) <= SIZE_TOLERANCE && Math.abs(dy - layer.box.y) <= SIZE_TOLERANCE
        record('position', ok, { variant: name, path, expected: `${layer.box.x}, ${layer.box.y}`, actual: `${Math.round(dx * 10) / 10}, ${Math.round(dy * 10) / 10}` })
      }

      const want = expectedColor(layer)
      if (want) {
        const cs = win.getComputedStyle(el)
        const prop = layer.type === 'TEXT' || layer.graphic ? cs.color : cs.backgroundColor
        const got = parseCssColor(prop)
        if (got) record('color', sameColor(want, got), { variant: name, path, expected: show(want), actual: show(got) })
      }
    }

    // The order of the items in each row or column.
    for (const [path, { layer }] of expected) {
      const mode = layer.layout?.mode
      if (hiddenPaths.has(path)) continue
      const kids = (layer.children ?? []).filter((c) => c.visible !== false && c.layoutPositioning !== 'ABSOLUTE')
      if (!mode || layer.layout?.wrap || kids.length < 2 || kids.some((c) => c.type === 'GROUP')) continue
      const parentEl = (copies.get(path) ?? []).flatMap(elementsOf).find((x) => rendered(x, win))
      if (!parentEl) continue
      const actual = [...parentEl.children]
        .filter((c) => rendered(c, win) && win.getComputedStyle(c).position !== 'absolute')
        .map((c) => ({ c, n: byClass.get([...c.classList].find((k) => byClass.has(k)) ?? '') }))
        .filter((x): x is { c: Element; n: Node } => !!x.n)
        .sort((a, b) => { const ra = a.c.getBoundingClientRect(), rb = b.c.getBoundingClientRect(); return mode === 'HORIZONTAL' ? ra.left - rb.left || ra.top - rb.top : ra.top - rb.top || ra.left - rb.left })
        .map((x) => x.n.layer.name)
      const want = kids.map((c) => c.name)
      // Only when the same layers are drawn: a field that hides one is a different question.
      if (actual.length !== want.length) continue
      record('order', actual.every((a, i) => a === want[i]), { variant: name, path, expected: want.join(' → '), actual: actual.join(' → ') })
    }
  }

  const total = KINDS.reduce((a, k) => a + checked[k], 0)
  const good = KINDS.reduce((a, k) => a + matched[k], 0)
  return { variants: variants.length, skippedVariants: skipped, checked, matched, unmatched: unmatched.size, score: total ? good / total : 1, mismatches, limits: FIDELITY_LIMITS }
}
