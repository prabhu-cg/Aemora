import { describe, expect, it } from 'vitest'
import { generateMarkup } from '../../markup'
import { renderHtl } from '../../markup/render/render'
import { buildModel, defaultSamples } from '../../markup/render/samples'
import { validateMarkup } from '../../markup/validate'
import { readDesign } from '../../markup/layers'
import { buildDesign, variantPropsOf } from './design'
import { confirmSuggested } from '../../components/ops'
import { resolveComponent } from '../../mapping/engine'
import { suggestShowWhen } from '../../mapping/showhide'
import { parseFigmaResponse } from './parse'

/** Figma REST node data, written the way the API returns it (colors 0 to 1, a relativeTransform, geometry paths). */
const rgb = (r: number, g: number, b: number, a = 1) => ({ r, g, b, a })
const solid = (r: number, g: number, b: number, extra: object = {}) => ({ type: 'SOLID', color: rgb(r, g, b), ...extra })
const at = (x: number, y: number, rot = 0) => [[Math.cos(rot), -Math.sin(rot), x], [Math.sin(rot), Math.cos(rot), y]]
const node = (id: string, name: string, type: string, extra: object = {}) => ({ id, name, type, size: { x: 10, y: 10 }, relativeTransform: at(0, 0), absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 }, ...extra })
const text = (id: string, name: string, characters: string, extra: object = {}) => node(id, name, 'TEXT', {
  characters, size: { x: 37, y: 20 }, fills: [solid(0.2, 0.25, 0.33)],
  style: { fontFamily: 'Inter', fontWeight: 500, fontSize: 14, lineHeightUnit: 'PIXELS', lineHeightPx: 20, letterSpacing: 0.5, textCase: 'ORIGINAL', textAlignHorizontal: 'LEFT', textAutoResize: 'WIDTH_AND_HEIGHT' }, ...extra,
})
const arrow = (id: string) => node(id, 'icon', 'VECTOR', { size: { x: 18, y: 17 }, fills: [solid(0.6, 0.64, 0.7)], fillGeometry: [{ path: 'M0 0L18 8.5L0 17Z', windingRule: 'NONZERO' }], relativeTransform: at(1, 1.5), absoluteBoundingBox: { x: 11, y: 11.5, width: 18, height: 17 } })
const icon = (id: string, vid: string) => node(id, 'icon / arrow', 'INSTANCE', { size: { x: 20, y: 20 }, componentId: 'c:icon', children: [arrow(vid)], absoluteBoundingBox: { x: 10, y: 10, width: 20, height: 20 } })

/** A component set shaped like a tab: icon, label, badge, border, with a default look and two more. */
function tabSet(): Record<string, unknown> {
  const variant = (id: string, name: string, label: string, fill: [number, number, number], extra: object[] = []) => node(id, name, 'COMPONENT', {
    size: { x: 129, y: 52 }, layoutMode: 'VERTICAL', primaryAxisSizingMode: 'AUTO', counterAxisSizingMode: 'AUTO', itemSpacing: 0, clipsContent: true, fills: [solid(1, 1, 1)],
    children: [
      node(`${id}:content`, 'Content', 'FRAME', {
        layoutMode: 'HORIZONTAL', itemSpacing: 8, paddingTop: 12, paddingBottom: 12, paddingLeft: 16, paddingRight: 16, primaryAxisAlignItems: 'MIN', counterAxisAlignItems: 'CENTER',
        layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'HUG', size: { x: 129, y: 51 },
        children: [icon(`${id}:i`, `${id}:v`), text(`${id}:t`, 'Label', label, { fills: [solid(...fill)], componentPropertyReferences: { characters: 'Label#1:1' }, layoutGrow: 1 }), ...extra],
      }),
      node(`${id}:b`, 'Border', 'RECTANGLE', { size: { x: 129, y: 1 }, fills: [solid(0.89, 0.91, 0.93)] }),
    ],
  })
  return {
    id: 'set:1', name: 'Tab', type: 'COMPONENT_SET', description: '',
    componentPropertyDefinitions: {
      'Label#1:1': { type: 'TEXT', defaultValue: 'Label' },
      State: { type: 'VARIANT', defaultValue: 'default', variantOptions: ['default', 'hover'] },
      Style: { type: 'VARIANT', defaultValue: 'Line', variantOptions: ['Line', 'Pill'] },
    },
    children: [
      variant('v:hover', 'State=hover, Style=Line', 'Label', [0.05, 0.1, 0.3]),
      variant('v:default', 'State=default, Style=Line', 'Label', [0.2, 0.25, 0.33]),
      variant('v:pill', 'State=default, Style=Pill', 'Label', [0.2, 0.25, 0.33], [node('v:pill:badge', 'Badge', 'FRAME', { size: { x: 24, y: 17 }, fills: [solid(0.94, 0.95, 0.96)], cornerRadius: 12 })]),
    ],
  }
}
const built = (n = tabSet()) => buildDesign(n as never, 'set', { components: { 'c:icon': { name: 'icon / arrow' } } })!

describe('Figma node data as layers', () => {
  it('picks the default variant by the set’s defaults, names the root after the component, and keeps the set’s variants as differences', () => {
    const d = built()
    expect(d.defaultVariantId).toBe('v:default')
    expect(d.defaultVariantProperties).toEqual({ State: 'default', Style: 'Line' })
    expect(d.tree.name).toBe('Tab')
    expect(d.variantDiffs.map((v) => v.variantProperties)).toEqual([{ State: 'hover', Style: 'Line' }, { State: 'default', Style: 'Pill' }])
    expect(d.states).toEqual(['default', 'hover'])
  })

  it('reads auto layout: direction, gap, padding, alignment and how each frame is sized', () => {
    const content = built().tree.children![0]
    expect(content.layout).toEqual({ mode: 'HORIZONTAL', gap: 8, padding: { top: 12, right: 16, bottom: 12, left: 16 }, primaryAlign: 'MIN', counterAlign: 'CENTER', sizingH: 'FILL', sizingV: 'HUG' })
    expect(built().tree.layout).toMatchObject({ mode: 'VERTICAL', sizingH: 'HUG', sizingV: 'HUG' })
  })

  it('derives sizing from grow and stretch when Figma does not say it directly', () => {
    const label = built().tree.children![0].children![1]
    expect(label.sizing).toEqual({ h: 'FILL', v: 'HUG' }) // layoutGrow 1 in a row fills along it; a box that follows its text hugs its height
    const stretched = buildDesign(node('s', 'S', 'COMPONENT', { layoutMode: 'VERTICAL', children: [text('t', 'T', 'x', { layoutAlign: 'STRETCH' })] }) as never, 'single')!
    expect(stretched.tree.children![0].sizing).toMatchObject({ h: 'FILL' }) // stretch across a column
  })

  it('reads colors with their opacity, text styles, strokes, corners and effects', () => {
    const d = buildDesign(node('c', 'Card', 'COMPONENT', {
      fills: [solid(0.2, 0.4, 0.6, { opacity: 0.5 })], cornerRadius: 6,
      strokes: [solid(1, 0, 0)], strokeWeight: 2, strokeAlign: 'INSIDE', individualStrokeWeights: { top: 0, right: 0, bottom: 3, left: 0 }, strokeDashes: [4, 2],
      effects: [{ type: 'DROP_SHADOW', visible: true, color: rgb(0, 0, 0, 0.25), offset: { x: 0, y: 4 }, radius: 8, spread: -1 }, { type: 'LAYER_BLUR', radius: 3 }],
      rectangleCornerRadii: [4, 4, 0, 0], opacity: 0.8, blendMode: 'MULTIPLY',
      children: [text('t', 'T', 'Hi', { style: { fontFamily: 'Inter', fontWeight: 700, fontSize: 16, lineHeightUnit: 'FONT_SIZE_%', lineHeightPercentFontSize: 120, letterSpacing: 0, textCase: 'UPPER', textDecoration: 'UNDERLINE', textAlignHorizontal: 'CENTER', textAutoResize: 'HEIGHT', italic: true } })],
    }) as never, 'single')!.tree
    expect(d.fills).toEqual([{ type: 'SOLID', visible: true, hex: '#336699', alpha: 0.5 }])
    expect(d.radius).toEqual({ tl: 4, tr: 4, br: 0, bl: 0 })
    expect(d.strokes).toMatchObject({ weight: 2, align: 'INSIDE', sides: { top: 0, right: 0, bottom: 3, left: 0 }, dash: [4, 2] })
    expect(d.effects).toEqual([{ type: 'DROP_SHADOW', visible: true, color: { hex: '#000000', alpha: 0.25 }, offsetX: 0, offsetY: 4, radius: 8, spread: -1 }, { type: 'LAYER_BLUR', visible: true, offsetX: 0, offsetY: 0, radius: 3, spread: 0 }])
    expect(d.opacity).toBe(0.8)
    expect(d.blendMode).toBe('MULTIPLY')
    expect(d.children![0].text).toMatchObject({ fontWeight: 700, lineHeight: { value: 120, unit: 'percent' }, textCase: 'UPPER', textDecoration: 'UNDERLINE', align: 'CENTER', autoResize: 'HEIGHT', italic: true })
  })

  it('turns a linear gradient into a CSS angle and stops on the CSS gradient line', () => {
    // A 100x50 box. The handles run left to right across the whole width: CSS 90deg, stops at their own 0 and 1.
    const g = (handles: { x: number; y: number }[]) => buildDesign(node('g', 'G', 'COMPONENT', { size: { x: 100, y: 50 }, fills: [{ type: 'GRADIENT_LINEAR', gradientHandlePositions: handles, gradientStops: [{ position: 0, color: rgb(1, 0, 0) }, { position: 1, color: rgb(0, 0, 1) }] }] }) as never, 'single')!.tree.fills![0].gradient!
    const across = g([{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }, { x: 0, y: 1 }])
    expect(across.kind).toBe('LINEAR')
    expect(across.angle).toBe(90)
    expect(across.stops.map((s) => s.position)).toEqual([0, 1])
    // Top to bottom is CSS 180deg.
    expect(g([{ x: 0.5, y: 0 }, { x: 0.5, y: 1 }, { x: 0, y: 0 }]).angle).toBe(180)
    // A gradient that covers only the middle half of the width has its stops pulled in.
    const half = g([{ x: 0.25, y: 0.5 }, { x: 0.75, y: 0.5 }, { x: 0.25, y: 1 }])
    expect(half.stops.map((s) => s.position)).toEqual([0.25, 0.75])
  })

  it('reads a radial gradient as a center and radii in the box', () => {
    const r = buildDesign(node('g', 'G', 'COMPONENT', { size: { x: 100, y: 100 }, fills: [{ type: 'GRADIENT_RADIAL', gradientHandlePositions: [{ x: 0.5, y: 0.5 }, { x: 1, y: 0.5 }, { x: 0.5, y: 1 }], gradientStops: [{ position: 0, color: rgb(1, 1, 1) }, { position: 1, color: rgb(0, 0, 0) }] }] }) as never, 'single')!.tree.fills![0].gradient!
    expect(r).toMatchObject({ kind: 'RADIAL', center: { x: 0.5, y: 0.5 }, radii: { x: 0.5, y: 0.5 } })
  })

  it('keeps the drawn shape of vectors, and what instances are instances of', () => {
    const inst = built().tree.children![0].children![0]
    expect(inst.instanceOf).toEqual({ componentId: 'c:icon', componentName: 'icon / arrow' })
    expect(inst.children![0].graphic).toEqual({ fills: [{ d: 'M0 0L18 8.5L0 17Z', rule: undefined }] })
    expect(inst.children![0].role).toBe('icon')
  })

  it('leaves out a drawing that is too large and says so', () => {
    const warn: string[] = []
    const big = node('b', 'Big', 'COMPONENT', { children: [node('v', 'Huge', 'VECTOR', { fillGeometry: [{ path: `M0 0${'L1 1'.repeat(20000)}Z` }] })] })
    const d = buildDesign(big as never, 'single', { warn: (m) => warn.push(m) })!
    expect(d.tree.children![0].graphic).toBeUndefined()
    expect(warn[0]).toMatch(/"Huge" is too large/)
  })

  it('places children of a frame without auto layout by their coordinates, with rotation as a matrix', () => {
    const d = buildDesign(node('d', 'Date', 'COMPONENT', { layoutMode: 'NONE', children: [
      node('dot', 'Dot', 'ELLIPSE', { size: { x: 4, y: 4 }, relativeTransform: at(30, 6), absoluteBoundingBox: { x: 30, y: 6, width: 4, height: 4 } }),
      node('tilt', 'Tilt', 'RECTANGLE', { size: { x: 10, y: 4 }, relativeTransform: at(8, 20, Math.PI / 6) }),
    ] }) as never, 'single')!.tree
    expect(d.children![0].position).toEqual({ x: 30, y: 6 })
    expect(d.children![0].transform).toBeUndefined()
    expect(d.children![1].position).toEqual({ x: 8, y: 20 })
    expect(d.children![1].transform).toEqual([0.866, 0.5, -0.5, 0.866])
  })

  it('places an absolute child of an auto-layout frame, but not the children auto layout places', () => {
    const d = buildDesign(node('f', 'F', 'COMPONENT', { layoutMode: 'HORIZONTAL', children: [
      node('a', 'Flows', 'FRAME', { relativeTransform: at(5, 5) }),
      node('b', 'Badge', 'FRAME', { layoutPositioning: 'ABSOLUTE', relativeTransform: at(40, -4) }),
    ] }) as never, 'single')!.tree
    expect(d.children![0].position).toBeUndefined()
    expect(d.children![1]).toMatchObject({ layoutPositioning: 'ABSOLUTE', position: { x: 40, y: -4 } })
  })

  it('measures what is inside a group from the frame around it, as Figma does', () => {
    const d = buildDesign(node('p', 'P', 'COMPONENT', { layoutMode: 'NONE', absoluteBoundingBox: { x: 100, y: 100, width: 80, height: 80 }, children: [
      node('g', 'Group', 'GROUP', { absoluteBoundingBox: { x: 110, y: 120, width: 30, height: 30 }, children: [
        node('in', 'Inside', 'RECTANGLE', { absoluteBoundingBox: { x: 115, y: 125, width: 10, height: 10 }, relativeTransform: at(5, 5) }),
      ] }),
    ] }) as never, 'single')!.tree
    expect(d.children![0].position).toBeUndefined() // a group is not placed
    expect(d.children![0].children![0].position).toEqual({ x: 15, y: 25 }) // from the frame, not from the group
  })

  it('reports a layer’s variant differences as changes, additions and removals', () => {
    const [hover, pill] = built().variantDiffs
    expect(hover.layers.find((l) => l.path === 'Tab/Content/Label')!.changes.fills).toEqual([{ type: 'SOLID', visible: true, hex: '#0d1a4d', alpha: 1 }])
    expect(pill.added).toEqual([expect.objectContaining({ parentPath: 'Tab/Content', index: 2, layer: expect.objectContaining({ name: 'Badge', radius: 12 }) })])
    expect(pill.removed).toEqual([])
  })

  it('reads variant properties from a variant name', () => {
    expect(variantPropsOf('Size=Small, State=Default')).toEqual({ Size: 'Small', State: 'Default' })
  })
})

describe('through the Figma API import', () => {
  const response = { name: 'Rayna', nodes: { '1:1': { document: tabSet(), components: { 'c:icon': { name: 'icon / arrow' } } } } }
  const res = parseFigmaResponse(response, { fileKey: 'KEY', requestedNodeId: '1:1' })
  const tab = res.components[0]

  it('carries the layer structure, so the component is no longer a bare wrapper', () => {
    const d = readDesign(tab)!
    expect(d.tree?.name).toBe('Tab')
    expect(d.variantDiffs).toHaveLength(2)
    expect(res.warnings.some((w) => /Colors, spacing and shapes are read for the markup and preview/.test(w.message))).toBe(true)
  })

  it('suggests fields from the layers of the default variant, so they match the tree', () => {
    const ids = new Set<string>()
    const walk = (l: { id: string; children?: unknown[] }) => { ids.add(l.id); (l.children ?? []).forEach((c) => walk(c as never)) }
    walk(readDesign(tab)!.tree as never)
    for (const p of tab.properties.filter((x) => x.origin.suggested)) expect(ids.has(p.origin.ref!)).toBe(true)
  })

  it('makes markup with the drawing, positions and states, and a valid preview of it', () => {
    const m = generateMarkup(tab)
    expect(m.fallback).toBe(false)
    const html = m.files[0].content
    expect(html).toContain('<svg ')
    expect(html).toContain('viewBox="0 0 18 17"')
    expect(html).toContain('<path d="M0 0L18 8.5L0 17Z" fill="currentColor"/>')
    expect(validateMarkup(m)).toEqual([])
    const css = m.files[1].content
    expect(css).toMatch(/\.cmp-tab \{[^}]*overflow: hidden;/s)
    const r = renderHtl(html, buildModel(tab.properties, defaultSamples(tab.properties)))
    expect(r.problems).toEqual([])
    expect(r.body.querySelector('svg path')?.getAttribute('d')).toBe('M0 0L18 8.5L0 17Z')
  })
})

/** A tab as the real one is built: the Line look wraps its parts in Content and Border, the Pill look has them directly under the tab, and each state of the pill is its own set of layers. */
function pillTab(): Record<string, unknown> {
  const badge = (id: string) => node(`${id}:badge`, 'Badge', 'FRAME', { layoutMode: 'HORIZONTAL', itemSpacing: 2, size: { x: 24, y: 17 }, fills: [solid(0.94, 0.95, 0.96)], cornerRadius: 12, componentPropertyReferences: { visible: 'has number tag#3:3' }, children: [
    text(`${id}:n`, 'Label', '0', { size: { x: 8, y: 17 } }),
    // Hidden in the design. What switches it is a property of the nested badge, not of the tab.
    node(`${id}:left`, 'Icon-left', 'INSTANCE', { visible: false, size: { x: 12, y: 12 }, componentId: 'c:icon', componentPropertyReferences: { visible: 'Icon-left#9:9' }, children: [arrow(`${id}:lv`)] }),
  ] })
  const parts = (id: string, color: [number, number, number]) => [
    node(`${id}:home`, 'icon / home', 'INSTANCE', { size: { x: 20, y: 20 }, componentId: 'c:icon', componentPropertyReferences: { visible: 'has icon#1:2', mainComponent: 'Icon#4:4' }, children: [arrow(`${id}:hv`)] }),
    text(`${id}:l`, 'Label', 'Label', { fills: [solid(...color)] }),
    badge(id),
  ]
  const line = (id: string, name: string, color: [number, number, number]) => node(id, name, 'COMPONENT', { size: { x: 129, y: 52 }, layoutMode: 'VERTICAL', primaryAxisSizingMode: 'AUTO', counterAxisSizingMode: 'AUTO', children: [
    node(`${id}:c`, 'Content', 'FRAME', { layoutMode: 'HORIZONTAL', itemSpacing: 8, size: { x: 129, y: 51 }, children: parts(id, color) }),
    node(`${id}:r`, 'Border', 'RECTANGLE', { size: { x: 129, y: 1 }, fills: [solid(0.89, 0.91, 0.93)] }),
  ] })
  const pill = (id: string, name: string, color: [number, number, number], fill: [number, number, number]) => node(id, name, 'COMPONENT', { size: { x: 140, y: 40 }, layoutMode: 'HORIZONTAL', itemSpacing: 8, cornerRadius: 20, fills: [solid(...fill)], children: parts(id, color) })
  return {
    id: 'set:t', name: 'Tab', type: 'COMPONENT_SET',
    componentPropertyDefinitions: {
      'has icon#1:2': { type: 'BOOLEAN', defaultValue: true },
      'has number tag#3:3': { type: 'BOOLEAN', defaultValue: true },
      'Icon#4:4': { type: 'INSTANCE_SWAP', defaultValue: 'c:icon' },
      State: { type: 'VARIANT', defaultValue: 'default', variantOptions: ['default', 'active'] },
      Style: { type: 'VARIANT', defaultValue: 'Line', variantOptions: ['Line', 'Pill'] },
    },
    children: [
      line('l:d', 'State=default, Style=Line', [0.4, 0.4, 0.4]), line('l:a', 'State=active, Style=Line', [1, 0.4, 0.1]),
      pill('p:d', 'State=default, Style=Pill', [0.4, 0.4, 0.4], [1, 1, 1]), pill('p:a', 'State=active, Style=Pill', [1, 1, 1], [1, 0.4, 0.1]),
    ],
  }
}

describe('a tab with a Line and a Pill look, and states', () => {
  const res = parseFigmaResponse({ name: 'F', nodes: { '1:1': { document: pillTab(), components: { 'c:icon': { name: 'icon / home' } } } } }, { fileKey: 'K', requestedNodeId: '1:1' })
  const tab = res.components[0]
  const m = generateMarkup(tab)
  const css = m.files[1].content
  const show = (component = tab, style = 'Line', label = 'Hello') => {
    const mk = generateMarkup(component)
    const samples = { ...defaultSamples(component.properties), style, label }
    return renderHtl(mk.files[0].content, buildModel(component.properties, samples)).body
  }

  it('does not make a field of the state: authors do not choose it, the CSS does', () => {
    expect(tab.properties.map((p) => p.label)).not.toContain('State')
    expect(tab.properties.find((p) => p.label === 'Style')).toMatchObject({ type: 'enum', allowedValues: ['Line', 'Pill'] })
    expect(res.warnings.some((w) => /"State" lists interaction states/.test(w.message))).toBe(true)
  })

  it('calls the current tab active, not pressed, and offers no pressed state it does not have', () => {
    expect(css).toMatch(/\.cmp-tab\[aria-selected="true"\][^{]*\{/)
    expect(css).toContain('.cmp-tab.is-active')
    expect(css).not.toContain(':active')
  })

  it('keeps hidden what the design hides, even when a nested component’s property switches it', () => {
    expect(css).toMatch(/__icon-left \{[^}]*display: none;/s)
    expect(show().querySelector('.cmp-tab__icon-left')).toBeTruthy() // in the markup for the nested component to show, but hidden by the CSS
    // A property of this tab still shows and hides its layer through the HTL.
    expect(css).not.toMatch(/__icon-home \{[^}]*display: none;/s)
    expect(m.files[0].content).toContain('data-sly-test="${model.hasIcon}"')
  })

  it('shows the Pill look as its own structure, not the Line one', () => {
    const line = show(tab, 'Line'), pillBody = show(tab, 'Pill')
    expect(line.querySelector('.cmp-tab__content')).toBeTruthy()
    expect(line.querySelector('.cmp-tab__border')).toBeTruthy()
    expect(pillBody.querySelector('.cmp-tab__content')).toBeNull()
    expect(pillBody.querySelector('.cmp-tab__border')).toBeNull()
    expect(pillBody.textContent).toContain('Hello')
  })

  it('shows the typed label in both looks', () => {
    expect(show(tab, 'Line', 'My tab').textContent).toContain('My tab')
    expect(show(tab, 'Pill', 'My tab').textContent).toContain('My tab')
    expect(show(tab, 'Pill', 'My tab').textContent).not.toMatch(/\bLabel\b/)
  })

  it('keeps the label connected after the suggested fields are kept', () => {
    const kept = confirmSuggested(tab)
    expect(kept.properties.some((p) => p.origin.suggested)).toBe(false)
    for (const style of ['Line', 'Pill']) expect(show(kept, style, 'Kept').textContent).toContain('Kept')
  })

  it('shows the active pill in place of the default one, never both', () => {
    // In the active state the active pill's layers show, and the default pill's are hidden.
    const showRule = css.split('\n\n').find((r) => /is-active\.cmp-tab--style-pill [^{]*\{\s*display: (inline|block|flex)/.test(r))
    const hideRule = css.split('\n\n').find((r) => /is-active\.cmp-tab--style-pill [^{]*\{\s*display: none/.test(r))
    expect(showRule).toBeTruthy()
    expect(hideRule).toBeTruthy()
  })

  it('is a valid component that previews without trouble', () => {
    expect(validateMarkup(m)).toEqual([])
    expect(renderHtl(m.files[0].content, buildModel(tab.properties, defaultSamples(tab.properties))).problems).toEqual([])
  })

  it('makes a swapped icon a text field, as the DesignMD route does', () => {
    expect(tab.properties.find((p) => p.key === 'icon')).toMatchObject({ type: 'string', label: 'Icon', description: 'Swaps the component. Default in the design: icon / home.' })
    expect(tab.unsupported).toEqual([])
  })

  it('suggests show-only-when rules from the design itself', () => {
    const fields = resolveComponent(tab, [])
    const key = (k: string) => fields.find((f) => f.key === k)!
    const s = suggestShowWhen(fields, tab)
    const rule = (target: string) => s.find((x) => x.targetId === key(target).propertyId)
    // The badge's number is part of the badge that "has number tag" switches, and the icon field belongs to the icon "has icon" switches.
    expect(rule('label2')).toMatchObject({ controllerId: key('hasNumberTag').propertyId, source: 'design' })
    expect(rule('icon')).toMatchObject({ controllerId: key('hasIcon').propertyId, source: 'design' })
    // The tab's own label is not inside anything that is switched.
    expect(rule('label')).toBeUndefined()
    // A yes/no property is never the target of a rule.
    expect(rule('hasIcon')).toBeUndefined()
    expect(rule('hasNumberTag')).toBeUndefined()
  })

  it('does not suggest a rule for a field that already has one', () => {
    const fields = resolveComponent(tab, [])
    const key = (k: string) => fields.find((f) => f.key === k)!
    const withRule = fields.map((f) => (f.key === 'icon' ? { ...f, showWhen: { propertyId: key('hasIcon').propertyId } } : f))
    expect(suggestShowWhen(withRule, tab).some((x) => x.targetId === key('icon').propertyId)).toBe(false)
  })

  it('still offers the name-based pairs for fields the design says nothing about', () => {
    const named = { ...tab, properties: [...tab.properties, { ...tab.properties.find((p) => p.key === 'hasIcon')!, id: 'x1', key: 'showFooter', label: 'Show footer' }, { ...tab.properties.find((p) => p.key === 'label')!, id: 'x2', key: 'footer', label: 'Footer', origin: { kind: 'json' as const, suggested: false } }] }
    const s = suggestShowWhen(resolveComponent(named, []), named)
    expect(s.find((x) => x.targetLabel === 'Footer')).toMatchObject({ controllerLabel: 'Show footer', source: 'names' })
  })
})
