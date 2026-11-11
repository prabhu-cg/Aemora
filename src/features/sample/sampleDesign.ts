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

// ---- Image ----

export function imageDesign() {
  counter = 200
  const picture = layer('Picture', 'RECTANGLE', 'image', { size: { width: 320, height: 180 }, fills: [solid('#f2f4f7')], sizing: { h: 'FILL', v: 'FIXED' } })
  const caption = layer('Caption', 'TEXT', 'text', {
    size: { width: 320, height: 18 }, fills: [solid('#475467')], text: text(13, 400, 'Describes the image', 'LEFT'), sizing: { h: 'FILL', v: 'HUG' }, roleSource: 'name', propertyRefs: { characters: 'altText' },
  })
  const badgeLabel = layer('Label', 'TEXT', 'label', { size: { width: 62, height: 16 }, fills: [solid('#344054')], text: text(12, 600, 'Decorative', 'CENTER'), roleSource: 'name' })
  // Shown only while the "Decorative image" switch is on.
  const badge = layer('Decorative badge', 'FRAME', 'container', {
    visible: false, size: { width: 86, height: 24 }, layout: layout('HORIZONTAL', 0, [4, 12, 4, 12]), radius: 12, fills: [solid('#f2f4f7')],
    children: [badgeLabel], propertyRefs: { visible: 'decorative' }, roleSource: 'name',
  })
  const tree = layer('Image', 'COMPONENT', 'root', {
    size: { width: 320, height: 230 }, layout: layout('VERTICAL', 8, [0, 0, 0, 0], { primaryAlign: 'MIN', counterAlign: 'MIN', sizingH: 'FIXED' }), children: [picture, caption, badge],
  })
  const defaults = { 'Display variant': 'default' }
  const diffs = [
    diff({ 'Display variant': 'rounded' }, [{ path: 'Image/Picture', changes: { radius: 16 } }]),
    diff({ 'Display variant': 'cover' }, [{ path: 'Image/Picture', changes: { size: { width: 320, height: 260 }, radius: 4 } }]),
  ]
  return design(tree, defaults, diffs, [], [])
}

// ---- Text ----

export function textDesign() {
  counter = 300
  const body = layer('Body', 'TEXT', 'text', {
    size: { width: 320, height: 24 }, fills: [solid('#101828')], text: text(16, 400, 'Formatted text goes here.', 'LEFT', 150), sizing: { h: 'FILL', v: 'HUG' }, roleSource: 'name', propertyRefs: { characters: 'text' },
  })
  const tree = layer('Text', 'COMPONENT', 'root', {
    size: { width: 320, height: 24 }, layout: layout('VERTICAL', 0, [0, 0, 0, 0], { primaryAlign: 'MIN', counterAlign: 'MIN', sizingH: 'FIXED' }), children: [body],
  })
  const style = (size: number, weight: number, align: string) => ({ ...text(size, weight, 'Formatted text goes here.', align, size > 20 ? 125 : 150) })
  const levels: [string, number, number][] = [['h1', 32, 700], ['h2', 26, 700], ['h3', 22, 700], ['h4', 18, 700]]
  const aligns = ['left', 'center', 'right']
  const diffs: VariantDiff[] = []
  for (const level of ['h1', 'h2', 'h3', 'h4', 'p']) {
    for (const align of aligns) {
      if (level === 'p' && align === 'left') continue // the default look
      const [, size, weight] = levels.find(([l]) => l === level) ?? ['p', 16, 400]
      diffs.push(diff({ 'Heading level': level, Alignment: align }, [{ path: 'Text/Body', changes: { text: style(size, weight, align.toUpperCase()) } }]))
    }
  }
  return design(tree, { 'Heading level': 'p', Alignment: 'left' }, diffs, [], [])
}

// ---- Container ----

export function containerDesign() {
  counter = 400
  const item = () => layer('Item', 'RECTANGLE', 'unknown', { size: { width: 120, height: 64 }, radius: 8, fills: [solid('#f2f4f7')], strokes: outline('#e4e7ec') })
  const gaps: Record<string, number> = { none: 0, small: 8, medium: 16, large: 32 }
  const arrange = (arrangement: string, spacing: string): Layout =>
    layout(arrangement === 'stack' ? 'VERTICAL' : 'HORIZONTAL', gaps[spacing], [16, 16, 16, 16], { primaryAlign: 'MIN', counterAlign: 'MIN', sizingH: arrangement === 'grid' ? 'FIXED' : 'HUG', wrap: arrangement === 'grid' })
  const tree = layer('Container', 'COMPONENT', 'root', {
    size: { width: 152, height: 264 }, layout: arrange('stack', 'medium'), radius: 12, strokes: outline('#d0d5dd'), children: [item(), item(), item()],
  })
  const diffs: VariantDiff[] = []
  for (const arrangement of ['stack', 'row', 'grid']) {
    for (const spacing of Object.keys(gaps)) {
      if (arrangement === 'stack' && spacing === 'medium') continue // the default look
      const wide = arrangement === 'row' ? { width: 3 * 120 + 2 * gaps[spacing] + 32, height: 96 } : arrangement === 'grid' ? { width: 2 * 120 + gaps[spacing] + 32, height: 2 * 64 + gaps[spacing] + 32 } : undefined
      diffs.push(diff({ Layout: arrangement, Spacing: spacing }, [{ path: 'Container', changes: { layout: arrange(arrangement, spacing), ...(wide ? { size: wide } : {}) } }]))
    }
  }
  return design(tree, { Layout: 'stack', Spacing: 'medium' }, diffs, [], [])
}

// ---- Accordion ----

export function accordionDesign() {
  counter = 500
  const chevron = () => layer('Chevron', 'INSTANCE', 'icon', {
    size: { width: 16, height: 16 }, instanceOf: { componentName: 'icon / chevron-down' }, roleSource: 'name',
    children: [layer('icon', 'VECTOR', 'icon', { size: { width: 16, height: 16 }, fills: [solid('#667085')], graphic: { fills: [{ d: 'M2 5l6 6 6-6-1.4-1.4L8 8.2 3.4 3.6z' }] } })],
  })
  const item = (which: 'First' | 'Second', last: boolean): Layer => {
    const key = which.toLowerCase()
    const title = layer('Title', 'TEXT', 'heading', {
      size: { width: 280, height: 24 }, fills: [solid('#101828')], text: text(16, 600, which === 'First' ? 'What is Aemora?' : 'Does it need a server?', 'LEFT'), sizing: { h: 'FILL', v: 'HUG' }, roleSource: 'name', propertyRefs: { characters: `${key}Title` },
    })
    const header = layer('Header', 'FRAME', 'container', {
      size: { width: 360, height: 56 }, layout: layout('HORIZONTAL', 12, [16, 16, 16, 16], { primaryAlign: 'SPACE_BETWEEN', sizingH: 'FILL' }), children: [title, chevron()],
    })
    const body = layer('Body', 'TEXT', 'text', {
      size: { width: 328, height: 40 }, fills: [solid('#475467')], text: text(14, 400, which === 'First' ? 'It turns a design component into an AEM dialog.' : 'No. It runs in your browser.', 'LEFT'), sizing: { h: 'FILL', v: 'HUG' }, roleSource: 'name', propertyRefs: { characters: `${key}Content` },
    })
    // Shown while the item's "open" switch is on.
    const content = layer('Content', 'FRAME', 'container', {
      visible: which === 'First', size: { width: 360, height: 56 }, layout: layout('VERTICAL', 0, [0, 16, 16, 16], { primaryAlign: 'MIN', counterAlign: 'MIN', sizingH: 'FILL' }),
      children: [body], propertyRefs: { visible: `${key}Open` },
    })
    return layer(`${which} item`, 'FRAME', 'container', {
      size: { width: 360, height: 112 }, layout: layout('VERTICAL', 0, [0, 0, 0, 0], { primaryAlign: 'MIN', counterAlign: 'MIN', sizingH: 'FILL' }),
      strokes: { paints: [solid('#e4e7ec')], weight: 1, align: 'INSIDE', sides: { top: 0, right: 0, bottom: last ? 0 : 1, left: 0 } }, children: [header, content],
    })
  }
  const tree = layer('Accordion', 'COMPONENT', 'root', {
    size: { width: 360, height: 224 }, layout: layout('VERTICAL', 0, [0, 0, 0, 0], { primaryAlign: 'MIN', counterAlign: 'MIN', sizingH: 'FIXED' }), children: [item('First', false), item('Second', true)],
  })
  const hover = (hex: string) => ['First', 'Second'].map((w) => ({ path: `Accordion/${w} item/Header`, changes: { fills: [solid(hex)] } }))
  const diffs = [
    diff({ Style: 'boxed' }, [{ path: 'Accordion', changes: { radius: 8, strokes: outline('#d0d5dd'), clipsContent: true } }]),
    diff({ State: 'hover' }, hover('#f9fafb')),
    diff({ Style: 'boxed', State: 'hover' }, [{ path: 'Accordion', changes: { radius: 8, strokes: outline('#d0d5dd'), clipsContent: true } }, ...hover('#f9fafb')]),
  ]
  return design(tree, { Style: 'default', State: 'default' }, diffs, ['default', 'hover'], [])
}

// ---- Tabs ----

export function tabsDesign() {
  counter = 600
  const names = ['Overview', 'Details', 'Reviews']
  const tab = (i: number): Layer => layer(`Tab ${i + 1}`, 'FRAME', 'container', {
    size: { width: 90, height: 40 }, layout: layout('HORIZONTAL', 0, [10, 16, 10, 16]), roleSource: 'name',
    ...(i === 2 ? { propertyRefs: { visible: 'showThirdTab' } } : {}),
    children: [layer('Label', 'TEXT', 'label', { size: { width: 58, height: 20 }, fills: [solid('#667085')], text: text(14, 500, names[i], 'CENTER'), roleSource: 'name', propertyRefs: { characters: `tab${i + 1}Label` } })],
  })
  const list = layer('Tab list', 'FRAME', 'container', {
    size: { width: 320, height: 40 }, layout: layout('HORIZONTAL', 4, [0, 0, 0, 0], { primaryAlign: 'MIN', sizingH: 'FILL' }), children: [tab(0), tab(1), tab(2)],
  })
  const panel = layer('Panel', 'FRAME', 'container', {
    size: { width: 320, height: 96 }, layout: layout('VERTICAL', 0, [16, 16, 16, 16], { primaryAlign: 'MIN', counterAlign: 'MIN', sizingH: 'FILL', sizingV: 'FIXED' }), radius: 8, fills: [solid('#f9fafb')],
    children: [layer('Panel text', 'TEXT', 'text', { size: { width: 200, height: 20 }, fills: [solid('#475467')], text: text(14, 400, 'The content of the selected tab.', 'LEFT'), roleSource: 'name' })],
  })
  const tree = layer('Tabs', 'COMPONENT', 'root', {
    size: { width: 320, height: 152 }, layout: layout('VERTICAL', 16, [0, 0, 0, 0], { primaryAlign: 'MIN', counterAlign: 'MIN', sizingH: 'FIXED' }), children: [list, panel],
  })
  // How each tab and the strip around them look, for a style and the active tab.
  const bottom = (w: number, hex: string) => ({ paints: [solid(hex)], weight: Math.max(w, 1), align: 'INSIDE', sides: { top: 0, right: 0, bottom: w, left: 0 } })
  const look = (style: string, active: number): { path: string; changes: LayerChanges }[] => {
    const out: { path: string; changes: LayerChanges }[] = [{ path: 'Tabs/Tab list', changes: style === 'pill' ? { fills: [solid('#f2f4f7')], radius: 8, layout: layout('HORIZONTAL', 4, [4, 4, 4, 4], { primaryAlign: 'MIN', sizingH: 'FILL' }) } : { fills: [], radius: 0, layout: layout('HORIZONTAL', 4, [0, 0, 0, 0], { primaryAlign: 'MIN', sizingH: 'FILL' }) } }]
    for (let i = 0; i < 3; i++) {
      const on = i === active
      const color = on ? (style === 'pill' ? '#101828' : ACCENT) : '#667085'
      out.push({ path: `Tabs/Tab list/Tab ${i + 1}`, changes: style === 'pill'
        ? { fills: on ? [solid('#ffffff')] : [], radius: 6, strokes: NO_STROKE, effects: on ? [{ type: 'DROP_SHADOW', visible: true, color: { hex: '#101828', alpha: 0.1 }, offsetX: 0, offsetY: 1, radius: 3, spread: 0 }] : [] }
        : { fills: [], radius: 0, effects: [], strokes: on ? bottom(2, ACCENT) : NO_STROKE } })
      out.push({ path: `Tabs/Tab list/Tab ${i + 1}/Label`, changes: { fills: [solid(color)], text: text(14, on ? 600 : 500, names[i], 'CENTER') } })
    }
    return out
  }
  const diffs: VariantDiff[] = []
  for (const style of ['line', 'pill']) for (const active of [0, 1, 2]) {
    if (style === 'line' && active === 0) continue // the default look
    diffs.push(diff({ Style: style, 'Active tab': String(active + 1) }, look(style, active)))
  }
  // The default look: the first tab is the active one, drawn with the underline.
  for (const { path, changes } of look('line', 0)) {
    let node: Layer | undefined = tree
    for (const name of path.split('/').slice(1)) node = node?.children?.find((c) => c.name === name)
    if (node) Object.assign(node, changes)
  }
  return design(tree, { Style: 'line', 'Active tab': '1' }, diffs, [], [])
}
