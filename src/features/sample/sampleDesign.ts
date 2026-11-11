import type { Effect, Layer, LayerChanges, Layout, Paint, TextProps, VariantDiff } from '../markup/layers'

/**
 * Layer data for the sample project's Button and Card, in the same format the DesignMD and Figma API routes produce.
 * It is what lets the sample show a real component preview, and real HTL and CSS, with options, states and a show/hide rule.
 */

const ACCENT = '#eb5017'
const solid = (hex: string, alpha = 1): Paint => ({ type: 'SOLID', visible: true, hex, alpha })
const NO_STROKE = { paints: [] as Paint[], weight: 0, align: 'INSIDE' }
const outline = (hex: string) => ({ paints: [solid(hex)], weight: 1, align: 'INSIDE' })

let counter = 0
const nextId = (name: string) => `sample:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}:${++counter}`

const text = (size: number, weight: number, characters: string, align = 'LEFT', lineHeight = 145): TextProps => ({
  fontFamily: 'Inter', fontWeight: weight, fontSize: size, lineHeight: { value: lineHeight, unit: 'percent' }, letterSpacing: { value: 0, unit: 'percent' },
  textCase: 'ORIGINAL', textDecoration: 'NONE', align, characters,
})
const layout = (mode: 'HORIZONTAL' | 'VERTICAL', gap: number, pad: [number, number, number, number], extra: Partial<Layout> = {}): Layout => ({
  mode, gap, padding: { top: pad[0], right: pad[1], bottom: pad[2], left: pad[3] }, primaryAlign: 'CENTER', counterAlign: 'CENTER', sizingH: 'HUG', sizingV: 'HUG', wrap: false, ...extra,
})

function layer(name: string, type: string, role: string, rest: Partial<Layer> = {}): Layer {
  return { id: nextId(name), name, type, visible: true, children: [], opacity: 1, strokes: NO_STROKE, effects: [], role, roleSource: 'type', ...rest }
}

function diff(variantProperties: Record<string, string>, layers: { path: string; changes: LayerChanges }[]): VariantDiff {
  return { variantId: nextId('variant'), variantProperties, layers, added: [], removed: [] }
}

function design(tree: Layer, defaults: Record<string, string>, variantDiffs: VariantDiff[], states: string[], sizes: string[]) {
  return {
    format: 'aemora.design/v1', source: { kind: 'sample' }, states, sizes,
    defaultVariantId: tree.id, defaultVariantProperties: defaults, treeTruncated: false, tree, variantDiffs, tokens: {},
  }
}

// ---- Button ----

export function buttonDesign() {
  counter = 0
  const icon = (name: string, which: string): Layer => layer(name, 'INSTANCE', 'icon', {
    visible: false, size: { width: 16, height: 16 }, instanceOf: { componentName: `icon / ${which}` }, roleSource: 'name',
    children: [layer('icon', 'VECTOR', 'icon', { size: { width: 16, height: 16 }, fills: [solid('#ffffff')], graphic: { fills: [{ d: which === 'arrow-left' ? 'M12 2L4 8l8 6z' : 'M4 2l8 6-8 6z' }] } })],
  })
  const label = layer('Label', 'TEXT', 'label', {
    size: { width: 60, height: 20 }, fills: [solid('#ffffff')], text: text(14, 600, 'Learn more', 'CENTER'), roleSource: 'name', propertyRefs: { characters: 'label' },
  })
  const tree = layer('Button', 'COMPONENT', 'root', {
    size: { width: 124, height: 40 }, layout: layout('HORIZONTAL', 8, [10, 20, 10, 20]), radius: 8, fills: [solid(ACCENT)],
    children: [icon('Icon-left', 'arrow-left'), label, icon('Icon-right', 'arrow-right')],
  })
  const pad = (v: number, h: number) => layout('HORIZONTAL', 8, [v, h, v, h])
  const labelAt = (size: number) => text(size, 600, 'Learn more', 'CENTER')
  const recolor = (hex: string) => [
    { path: 'Button/Label', changes: { fills: [solid(hex)] } },
    { path: 'Button/Icon-left/icon', changes: { fills: [solid(hex)] } },
    { path: 'Button/Icon-right/icon', changes: { fills: [solid(hex)] } },
  ]
  const defaults = { Size: 'medium', Variant: 'primary', 'Icon position': 'none', State: 'default' }
  const diffs = [
    diff({ Size: 'small' }, [{ path: 'Button', changes: { layout: pad(6, 14), size: { width: 104, height: 32 } } }, { path: 'Button/Label', changes: { text: labelAt(12) } }]),
    diff({ Size: 'large' }, [{ path: 'Button', changes: { layout: pad(14, 28), size: { width: 150, height: 50 } } }, { path: 'Button/Label', changes: { text: labelAt(16) } }]),
    diff({ Variant: 'secondary' }, [{ path: 'Button', changes: { fills: [solid('#ffffff')], strokes: outline(ACCENT) } }, ...recolor(ACCENT)]),
    diff({ Variant: 'tertiary' }, [{ path: 'Button', changes: { fills: [] } }, ...recolor(ACCENT)]),
    diff({ 'Icon position': 'left' }, [{ path: 'Button/Icon-left', changes: { visible: true } }]),
    diff({ 'Icon position': 'right' }, [{ path: 'Button/Icon-right', changes: { visible: true } }]),
    diff({ State: 'hover' }, [{ path: 'Button', changes: { fills: [solid('#d4430f')] } }]),
    diff({ State: 'disabled' }, [{ path: 'Button', changes: { opacity: 0.5 } }]),
    // A hovered secondary or tertiary button is tinted, not filled like the primary one.
    diff({ Variant: 'secondary', State: 'hover' }, [{ path: 'Button', changes: { fills: [solid('#fff4ef')], strokes: outline(ACCENT) } }, ...recolor(ACCENT)]),
    diff({ Variant: 'tertiary', State: 'hover' }, [{ path: 'Button', changes: { fills: [solid('#fff4ef')] } }, ...recolor(ACCENT)]),
  ]
  return design(tree, defaults, diffs, ['default', 'hover', 'disabled'], ['small', 'medium', 'large'])
}

// ---- Card ----

export function cardDesign() {
  counter = 100
  const heading = layer('Heading', 'TEXT', 'heading', {
    size: { width: 280, height: 26 }, fills: [solid('#101828')], text: text(20, 700, 'Card heading', 'LEFT', 130), sizing: { h: 'FILL', v: 'HUG' }, roleSource: 'name', propertyRefs: { characters: 'heading' },
  })
  const description = layer('Description', 'TEXT', 'text', {
    size: { width: 280, height: 40 }, fills: [solid('#475467')], text: text(14, 400, 'A short description of what the card links to.', 'LEFT'), sizing: { h: 'FILL', v: 'HUG' },
    roleSource: 'name', propertyRefs: { characters: 'description', visible: 'showDescription' },
  })
  const buttonLabel = layer('Label', 'TEXT', 'label', {
    size: { width: 60, height: 20 }, fills: [solid('#ffffff')], text: text(14, 600, 'Read more', 'CENTER'), roleSource: 'name', propertyRefs: { characters: 'ctaLabel' },
  })
  const button = layer('Button', 'FRAME', 'button', {
    size: { width: 92, height: 40 }, layout: layout('HORIZONTAL', 8, [10, 16, 10, 16]), radius: 8, fills: [solid(ACCENT)], roleSource: 'name', children: [buttonLabel],
  })
  const content = layer('Content', 'FRAME', 'container', {
    size: { width: 320, height: 160 }, layout: layout('VERTICAL', 8, [20, 20, 20, 20], { primaryAlign: 'MIN', counterAlign: 'MIN', sizingH: 'FILL' }), children: [heading, description, button],
  })
  const image = layer('Image', 'RECTANGLE', 'image', { size: { width: 320, height: 180 }, fills: [solid('#f2f4f7')], sizing: { h: 'FILL', v: 'FIXED' } })
  const tree = layer('Card', 'COMPONENT', 'root', {
    size: { width: 320, height: 340 }, layout: layout('VERTICAL', 0, [0, 0, 0, 0], { primaryAlign: 'MIN', counterAlign: 'MIN', sizingH: 'FIXED' }),
    radius: 12, fills: [solid('#ffffff')], strokes: outline('#e4e7ec'), clipsContent: true, children: [image, content],
  })
  const centered = layout('VERTICAL', 8, [20, 20, 20, 20], { primaryAlign: 'MIN', counterAlign: 'CENTER', sizingH: 'FILL' })
  const shadow: Effect = { type: 'DROP_SHADOW', visible: true, color: { hex: '#101828', alpha: 0.12 }, offsetX: 0, offsetY: 8, radius: 24, spread: 0 }
  const defaults = { 'Background variant': 'default', Alignment: 'left', State: 'default' }
  const diffs = [
    diff({ 'Background variant': 'subtle' }, [{ path: 'Card', changes: { fills: [solid('#f9fafb')] } }]),
    diff({ 'Background variant': 'accent' }, [{ path: 'Card', changes: { fills: [solid('#fff4ef')], strokes: outline(ACCENT) } }]),
    diff({ Alignment: 'center' }, [
      { path: 'Card/Content', changes: { layout: centered } },
      { path: 'Card/Content/Heading', changes: { text: text(20, 700, 'Card heading', 'CENTER', 130) } },
      { path: 'Card/Content/Description', changes: { text: text(14, 400, 'A short description of what the card links to.', 'CENTER') } },
    ]),
    diff({ State: 'hover' }, [{ path: 'Card', changes: { effects: [shadow] } }]),
  ]
  return design(tree, defaults, diffs, ['default', 'hover'], [])
}
