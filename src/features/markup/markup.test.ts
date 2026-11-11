import { describe, expect, it } from 'vitest'
import { importDesignMd, parseDesignMdText } from '../inputs/designmd/parse'
import { newId } from '../../lib/id'
import type { ComponentDef, Property } from '../components/schema'
import { generateMarkup } from './index'
import { validateMarkup } from './validate'

const raw = import.meta.glob('../../test/fixtures/designmd-rayna.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const golden = import.meta.glob('./golden/*', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const rayna = Object.values(raw)[0]
const chipRaw = import.meta.glob('../../test/fixtures/designmd-chip.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const catalog = parseDesignMdText(rayna)
const imported = (name: string): ComponentDef => importDesignMd(catalog, [catalog.entries.find((e) => e.name === name)!.id]).components[0]
const file = (c: ComponentDef, kind: string, opts = {}) => generateMarkup(c, opts).files.find((f) => f.kind === kind)!.content

/** Goldens are checked in. To refresh one, delete it and run the tests: it is written from the current output. */
async function expectGoldens(files: Record<string, string>) {
  const missing = Object.keys(files).filter((n) => golden[`./golden/${n}.txt`] === undefined)
  if (missing.length) {
    const fs = await import(/* @vite-ignore */ 'node:fs' as string)
    for (const n of missing) fs.writeFileSync(`src/features/markup/golden/${n}.txt`, files[n])
    throw new Error(`Wrote the missing golden files: ${missing.join(', ')}. Review them, then run the tests again.`)
  }
  for (const [n, content] of Object.entries(files)) expect(content, n).toBe(golden[`./golden/${n}.txt`])
}

const prop = (key: string, type: Property['type'], extra: Partial<Property> = {}): Property => ({
  id: newId(), key, label: key, type, required: false, defaultValue: null, allowedValues: [], description: '', group: '', origin: { kind: 'json', suggested: false }, ...extra,
})
const component = (name: string, design: unknown, properties: Property[], type: ComponentDef['type'] = 'custom'): ComponentDef => ({
  id: newId(), name, type, description: '', properties, unsupported: [], children: [], meta: design ? { design: { format: 'designmd.components/v1', ...(design as object) } } : {}, origin: { kind: 'json', suggested: false },
})
const frame = (name: string, extra: object = {}, children: object[] = []) => ({ id: name, name, type: 'FRAME', role: 'container', visible: true, children, ...extra })
const text = (name: string, characters: string, extra: object = {}) => ({ id: name, name, type: 'TEXT', role: 'label', visible: true, text: { characters }, ...extra })

describe('golden files for real components', () => {
  it.each([
    ['Button / primary', 'button-primary', ['html', 'css', 'java', 'content.xml']],
    ['Dropdown / menu item', 'dropdown-menu-item', ['html', 'css', 'java']],
  ] as const)('%s', async (name, base, exts) => {
    const m = generateMarkup(imported(name))
    const by = { html: 'htl', css: 'css', java: 'model', 'content.xml': 'component' } as const
    await expectGoldens(Object.fromEntries(exts.map((ext) => [`${base}.${ext}`, m.files.find((f) => f.kind === by[ext])!.content])))
  })
})

describe('markup from the real Rayna file', () => {
  it('is valid and consistent for every fixture component', () => {
    for (const e of catalog.entries) {
      const m = generateMarkup(importDesignMd(catalog, [e.id]).components[0])
      expect(validateMarkup(m), e.name).toEqual([])
      expect(m.fallback).toBe(false)
    }
  })
  it('is deterministic', () => {
    const c = imported('Metrics Card')
    expect(generateMarkup(c)).toEqual(generateMarkup(c))
  })
  it('makes optional icon layers conditional on the option that decides them, in the right place', () => {
    const html = file(imported('Button / primary'), 'htl')
    const lines = html.split('\n')
    const at = (s: string) => lines.findIndex((l) => l.includes(s))
    expect(html).toMatch(/data-sly-test="\$\{model\.iconStyleModifier == 'leading-icon'\}"/)
    expect(html).toMatch(/data-sly-test="\$\{model\.iconStyleModifier == 'trailing-icon' \|\| model\.iconStyleModifier == 'icon-only'\}"/)
    expect(at("== 'leading-icon'")).toBeLessThan(at('__label'))
    expect(at("== 'trailing-icon'")).toBeGreaterThan(at('__label'))
  })
  it('uses spans inside a button so the HTML stays valid', () => {
    const html = file(imported('Button / primary'), 'htl')
    expect(html).not.toMatch(/<div/)
    const card = file(imported('Metrics Card'), 'htl')
    expect(card).not.toMatch(/<button[^>]*>\s*<button/)
  })
  it('turns single-option variants into modifier classes and states into pseudo-classes, with only what differs', () => {
    const css = file(imported('Button / primary'), 'css')
    expect(css).toMatch(/\.cmp-button-primary--size-lg \.cmp-button-primary__label \{\n  font-size: 16px;\n\}/)
    expect(css).toMatch(/\.cmp-button-primary:hover \{\n  background-color: #[0-9a-f]{6};\n\}/)
    expect(css).toMatch(/\.cmp-button-primary:focus-visible/)
    expect(css).toMatch(/\.cmp-button-primary:disabled,\n\.cmp-button-primary\[aria-disabled="true"\] \{/)
    expect(css).toMatch(/--icon-style-icon-only \.cmp-button-primary__label \{\n  display: none;/)
  })
  it('gives an icon-only button an accessible name and says so', () => {
    const m = generateMarkup(imported('Button / primary'))
    expect(m.files[0].content).toContain('aria-label="${model.label}"')
    expect(m.notes.some((n) => /accessible name/.test(n.message))).toBe(true)
  })
  it('says what it guessed or left out', () => {
    const notes = generateMarkup(imported('Metrics Card')).notes
    expect(notes.some((n) => /guessed from the option names/.test(n.message))).toBe(true)
    expect(notes.filter((n) => n.level === 'warning')).toEqual([])
  })
})

describe('the real Chip from the Rayna file', () => {
  const chipCatalog = parseDesignMdText(Object.values(chipRaw)[0])
  const m = generateMarkup(importDesignMd(chipCatalog, [chipCatalog.entries[0].id]).components[0])
  it('shows the chevron for the Filter type, the home icon for icon=on, and the close icon when the property is on', () => {
    const html = m.files[0].content
    expect(html).toMatch(/__icon-chevron-down" data-sly-test="\$\{model\.typeModifier == 'filter'\}"/)
    expect(html).toMatch(/__icon-home-alt" data-sly-test="\$\{model\.iconModifier == 'on'\}"/)
    expect(html).toMatch(/__icon-multiply" data-sly-test="\$\{model\.hasCloseButton\}"/)
  })
  it('keeps the name of each fixed icon, and binds the one an option swaps', () => {
    const html = m.files[0].content
    expect(html).toContain('data-icon="chevron-down"')
    expect(html).toContain('data-icon="multiply"')
    expect(html).toContain('data-icon="${model.selectIcon}"')
  })
  it('does not warn that it left layers out because nothing decides them', () => {
    expect(m.notes.filter((n) => n.level === 'warning')).toEqual([])
    expect(validateMarkup(m)).toEqual([])
  })
})

describe('options and naming', () => {
  const c = imported('Button / primary')
  it('applies the CSS prefix, Java package, group and folder', () => {
    const m = generateMarkup(c, { cssPrefix: 'acme', javaPackage: 'com.acme.core.models', group: 'Acme - Content', folder: 'cta' })
    expect(m.blockClass).toBe('acme-cta')
    expect(m.files.map((f) => f.name)).toEqual(['cta.html', 'cta.css', 'ButtonPrimaryModel.java', '.content.xml', '_cq_editConfig.xml'])
    expect(m.files[0].content).toContain('data-sly-use.model="com.acme.core.models.ButtonPrimaryModel"')
    expect(m.files[2].content).toMatch(/^package com\.acme\.core\.models;/)
    expect(m.files[3].content).toContain('componentGroup="Acme - Content"')
    expect(m.files[1].content).toContain('.acme-cta {')
  })
  it('drops the prefix when it is empty', () => {
    expect(generateMarkup(c, { cssPrefix: '' }).blockClass).toBe('button-primary')
  })
  it('reads dialog fields from the JCR name the dialog uses', () => {
    const m = generateMarkup(c, {}, { label: 'jcr_label' })
    expect(m.files[2].content).toContain('@ValueMapValue(name = "jcr_label")')
  })
})

describe('Sling Model', () => {
  it('maps types, defaults and reserved words', () => {
    const c = component('Teaser', null, [
      prop('class', 'string', { defaultValue: 'a "quoted" \\ value' }),
      prop('count', 'number', { defaultValue: 3 }),
      prop('open', 'boolean', { defaultValue: true }),
      prop('when', 'date'),
      prop('topics', 'tags'),
      prop('layout', 'enum', { defaultValue: 'wide', allowedValues: ['wide', 'narrow'] }),
    ])
    const java = file(c, 'model')
    expect(java).toContain('private String classValue;')
    expect(java).toContain('@ValueMapValue(name = "class")')
    expect(java).toContain('@Default(values = "a \\"quoted\\" \\\\ value")')
    expect(java).toContain('@Default(doubleValues = 3)')
    expect(java).toContain('private Double count;')
    expect(java).toContain('@Default(booleanValues = true)')
    expect(java).toContain('public boolean isOpen()')
    expect(java).toContain('private Calendar when;')
    expect(java).toContain('import java.util.Calendar;')
    expect(java).toContain('private String[] topics;')
    expect(java).toContain('public String getLayoutModifier()')
  })
  it('has no helper or imports it does not use', () => {
    const java = file(component('Plain', null, [prop('title', 'string')]), 'model')
    expect(java).not.toContain('toModifier')
    expect(java).not.toContain('Default;')
    expect(java).not.toContain('Calendar')
  })
  it('makes a valid class name from any component name', () => {
    expect(generateMarkup(component('3D card / hero', null, [])).modelClass).toBe('Component3DCardHeroModel')
  })
})

describe('component XML', () => {
  it('escapes the title and description', () => {
    const c = { ...component('Q&A <box>', null, []), description: 'Say "hi" & go' }
    const xml = file(c, 'component')
    expect(xml).toContain('jcr:title="Q&amp;A &lt;box&gt;"')
    expect(xml).toContain('jcr:description="Say &quot;hi&quot; &amp; go"')
    expect(xml).toContain('jcr:primaryType="cq:Component"')
  })
  it('includes a basic edit config', () => {
    expect(file(component('A', null, []), 'editConfig')).toContain('jcr:primaryType="cq:EditConfig"')
  })
})

describe('layer handling', () => {
  const design = (tree: object, extra: object = {}) => ({ tree, variantDiffs: [], states: [], sizes: [], treeTruncated: false, ...extra })

  it('binds text, visibility and optional text to the right fields, and fixes unbound copy', () => {
    const tree = frame('Card', { layout: { mode: 'VERTICAL', gap: 8 } }, [
      text('Title', 'Hello', { role: 'heading', propertyRefs: { characters: 'title#1:1' } }),
      text('Body', 'Body copy', { role: 'text', propertyRefs: { characters: 'body#1:2', visible: 'show body#1:3' } }),
      text('Footer', 'Fixed footer <b> ${x}', { role: 'text' }),
    ])
    const c = component('Card', design(tree), [prop('title', 'string', { required: true }), prop('body', 'richtext'), prop('showBody', 'boolean')])
    const html = file(c, 'htl')
    expect(html).toContain('<h2 class="cmp-card__title">${model.title}</h2>')
    expect(html).toContain('data-sly-test="${model.showBody && model.body}"')
    expect(html).toContain("${model.body @ context='html'}")
    expect(html).toContain('Fixed footer &lt;b&gt; &#36;{x}')
    expect(validateMarkup(generateMarkup(c))).toEqual([])
  })

  it('resets the browser border on a button and the underline on a link, unless the design draws one', () => {
    const tree = frame('Cta', { strokes: { paints: [{ type: 'SOLID', hex: '#ff0000', alpha: 1 }], weight: 2, align: 'INSIDE' } })
    const plain = frame('Cta', {})
    const asButton = (t: object) => file(component('Cta', design(t), [], 'button'), 'css')
    expect(asButton(plain)).toMatch(/\.cmp-cta \{[^}]*border: 0;[^}]*cursor: pointer;/s)
    // The stroke is a shadow, so the browser border stays reset: a stroke in Figma never changes a size.
    expect(asButton(tree)).toContain('box-shadow: inset 0 0 0 2px #ff0000;')
    expect(asButton(tree)).toMatch(/border: 0;/)
    const asLink = file(component('Cta', design(plain), [prop('link', 'link')], 'button'), 'css')
    expect(asLink).toContain('text-decoration: none;')
    expect(file(component('Cta', design(plain), [], 'custom'), 'css')).not.toContain('cursor: pointer')
  })

  it('writes flex layout, spacing, fills with tokens, borders, radius, shadows and text styles', () => {
    const tree = frame('Box', {
      layout: { mode: 'HORIZONTAL', gap: 12, padding: { top: 8, right: 16, bottom: 8, left: 16 }, primaryAlign: 'SPACE_BETWEEN', counterAlign: 'CENTER', sizingH: 'FILL', sizingV: 'HUG' },
      size: { width: 300, height: 40 }, radius: { tl: 4, tr: 4, br: 0, bl: 0 }, opacity: 0.5,
      fills: [{ type: 'SOLID', hex: '#102030', alpha: 0.5, token: { cssName: '--color-surface' } }],
      strokes: { paints: [{ type: 'SOLID', hex: '#ff0000', alpha: 1 }], weight: 2, align: 'INSIDE' },
      effects: [{ type: 'DROP_SHADOW', color: { hex: '#000000', alpha: 0.25 }, offsetX: 0, offsetY: 4, radius: 8, spread: -1 }, { type: 'INNER_SHADOW', color: { r: 255, g: 255, b: 255, a: 1 }, offsetX: 1, offsetY: 1, radius: 0, spread: 0 }],
    }, [
      text('Name', 'Name', { text: { characters: 'Name', fontFamily: 'Inter', fontSize: 14, fontWeight: 600, lineHeight: { value: 120, unit: 'percent' }, letterSpacing: { value: 5, unit: 'percent' }, textCase: 'UPPER', textDecoration: 'UNDERLINE', align: 'RIGHT' }, fills: [{ type: 'SOLID', hex: '#ffffff', alpha: 1 }] }),
      frame('Grow', { layout: { mode: 'VERTICAL', sizingH: 'FILL', sizingV: 'FILL' }, size: { width: 10, height: 10 } }),
    ])
    const css = file(component('Box', design(tree), []), 'css')
    expect(css).toContain('display: flex;')
    expect(css).toContain('flex-direction: row;')
    expect(css).toContain('gap: 12px;')
    expect(css).toContain('padding: 8px 16px;')
    expect(css).toContain('justify-content: space-between;')
    expect(css).toContain('align-items: center;')
    expect(css).toContain('width: 300px;') // the root has no parent to fill, so it keeps its size
    expect(css).toContain('border-radius: 4px 4px 0 0;')
    expect(css).toContain('opacity: 0.5;')
    expect(css).toContain('background-color: var(--color-surface, rgba(16, 32, 48, 0.5));')
    expect(css).toContain('box-shadow: inset 0 0 0 2px #ff0000, 0 4px 8px -1px rgba(0, 0, 0, 0.25), inset 1px 1px 0 0 rgba(255, 255, 255, 1);')
    expect(css).not.toMatch(/\n  border: 2px/)
    expect(css).toContain('font-family: "Inter", sans-serif;')
    expect(css).toContain('line-height: 1.2;')
    expect(css).toContain('letter-spacing: 0.05em;')
    expect(css).toContain('text-transform: uppercase;')
    expect(css).toContain('text-decoration: underline;')
    expect(css).toContain('text-align: right;')
    expect(css).toContain('color: #ffffff;')
    expect(css).toMatch(/__grow \{[^}]*flex: 1 1 0;[^}]*min-width: 0;[^}]*align-self: stretch;/s)
  })

  it('reports fills and strokes it cannot reproduce instead of dropping them silently', () => {
    const tree = frame('Hero', { fills: [{ type: 'GRADIENT_LINEAR', description: 'blue to red' }], strokes: { paints: [{ type: 'SOLID', hex: '#000000' }], weight: 1, align: 'OUTSIDE' } })
    const m = generateMarkup(component('Hero', design(tree), []))
    expect(m.notes.some((n) => /gradient linear fill is not reproduced/.test(n.message))).toBe(true)
  })

  it('draws inside, outside and centered strokes without changing any size', () => {
    const css = (align: string) => file(component('S', design(frame('S', { strokes: { paints: [{ type: 'SOLID', hex: '#000000', alpha: 1 }], weight: 4, align } })), []), 'css')
    expect(css('INSIDE')).toContain('box-shadow: inset 0 0 0 4px #000000;')
    expect(css('OUTSIDE')).toContain('box-shadow: 0 0 0 4px #000000;')
    expect(css('CENTER')).toContain('box-shadow: inset 0 0 0 2px #000000, 0 0 0 2px #000000;')
  })

  it('says "align to start" out loud, since flex stretches children by default', () => {
    const css = (counterAlign: string) => file(component('Col', design(frame('Col', { layout: { mode: 'VERTICAL', counterAlign, sizingH: 'HUG', sizingV: 'HUG' } })), []), 'css')
    expect(css('MIN')).toContain('align-items: flex-start;')
    expect(css('CENTER')).toContain('align-items: center;')
  })

  it('gives layers with a size of their own a real box that does not shrink', () => {
    const tree = frame('Row', { layout: { mode: 'HORIZONTAL', sizingH: 'HUG', sizingV: 'HUG' } }, [{ id: 'v', name: 'Shape', type: 'VECTOR', role: 'icon', visible: true, size: { width: 10, height: 5 } }])
    expect(file(component('Row', design(tree), []), 'css')).toMatch(/__shape \{[^}]*width: 10px;[^}]*height: 5px;[^}]*display: block;[^}]*flex-shrink: 0;/s)
  })

  it('leaves a layer that a yes/no property switches to the HTL, and hides one nothing switches', () => {
    const tree = frame('Tag', {}, [text('Switched', 'a', { visible: false, propertyRefs: { visible: 'has a#1:1' } }), text('Plain', 'b', { visible: false })])
    const css = file(component('Tag', design(tree), [prop('hasA', 'boolean')]), 'css')
    expect(css).not.toMatch(/__switched \{[^}]*display: none/s)
    expect(css).toMatch(/__plain \{[^}]*display: none/s)
  })

  it('removes the margins and borders browsers add to text, dividers, buttons and inputs', () => {
    const tree = frame('Form', {}, [
      text('Title', 't', { role: 'heading' }), text('Copy', 'c', { role: 'text', text: { characters: 'x'.repeat(100) } }),
      { id: 'd', name: 'Rule', type: 'LINE', role: 'divider', visible: true }, { id: 'i', name: 'Field', type: 'RECTANGLE', role: 'input', visible: true },
      { id: 'b', name: 'Go', type: 'INSTANCE', role: 'button', visible: true, children: [text('Cap', 'go')] },
    ])
    const css = file(component('Form', design(tree), []), 'css')
    expect(css).toMatch(/__title \{[^}]*margin: 0;/s)
    expect(css).toMatch(/__copy \{[^}]*margin: 0;/s)
    expect(css).toMatch(/__rule \{[^}]*margin: 0;[^}]*border: 0;/s)
    expect(css).toMatch(/__field \{[^}]*padding: 0;[^}]*border: 0;/s)
    expect(css).toMatch(/__go \{[^}]*margin: 0;[^}]*padding: 0;[^}]*border: 0;[^}]*background: none;/s)
  })

  it('renders images, dividers and slots and tells you what is missing', () => {
    const tree = frame('Media', {}, [
      { id: 'i', name: 'Picture', type: 'RECTANGLE', role: 'image', visible: true },
      { id: 'd', name: 'Line', type: 'LINE', role: 'divider', visible: true },
      { id: 's', name: 'Extra', type: 'FRAME', role: 'slot', visible: true },
    ])
    const withField = generateMarkup(component('Media', design(tree), [prop('image', 'image'), prop('altText', 'string')]))
    expect(withField.files[0].content).toContain('<img class="cmp-media__picture" src="${model.image}" alt="${model.altText}">')
    expect(withField.files[0].content).toContain('<hr class="cmp-media__line">')
    expect(withField.notes.some((n) => /slot/.test(n.message))).toBe(true)
    const without = generateMarkup(component('Media', design(tree), []))
    expect(without.notes.some((n) => n.level === 'warning' && /no image field/.test(n.message))).toBe(true)
  })

  it('names same-name layers apart and keeps each one styled', () => {
    const tree = frame('List', {}, [text('Item', 'One', { fills: [{ type: 'SOLID', hex: '#111111' }] }), text('Item', 'Two', { fills: [{ type: 'SOLID', hex: '#222222' }] })])
    const m = generateMarkup(component('List', design(tree), []))
    expect(m.files[0].content).toContain('cmp-list__item"')
    expect(m.files[0].content).toContain('cmp-list__item-2"')
    expect(m.files[1].content).toContain('.cmp-list__item-2 {')
  })

  it('applies a state change to a nested layer through the root', () => {
    const tree = frame('Chip', {}, [text('Label', 'Chip', { fills: [{ type: 'SOLID', hex: '#000000' }] })])
    const d = design(tree, {
      defaultVariantProperties: { state: 'default' },
      variantDiffs: [{ variantId: 'v', variantProperties: { state: 'hover' }, layers: [{ path: 'Chip/Label', changes: { fills: [{ type: 'SOLID', hex: '#ffffff' }] } }], added: [], removed: [] }],
    })
    expect(file(component('Chip', d, []), 'css')).toContain('.cmp-chip:hover .cmp-chip__label {\n  color: #ffffff;\n}')
  })

  it('uses a layer position from the plugin when it provides one', () => {
    const tree = frame('Row', {}, [text('A', 'a'), text('B', 'b')])
    const d = design(tree, {
      defaultVariantProperties: { mark: 'none' },
      variantDiffs: [{ variantId: 'v', variantProperties: { mark: 'dot' }, layers: [], added: [{ parentPath: 'Row', index: 1, layer: { id: 'dot', name: 'Dot', type: 'ELLIPSE', role: 'unknown', visible: true } }], removed: [] }],
    })
    const m = generateMarkup(component('Row', d, [prop('mark', 'enum', { defaultValue: 'none', allowedValues: ['none', 'dot'] })]))
    const lines = m.files[0].content.split('\n')
    expect(lines.findIndex((l) => l.includes('__dot'))).toBe(lines.findIndex((l) => l.includes('__a')) + 1)
    expect(m.files[0].content).toContain("data-sly-test=\"${model.markModifier == 'dot'}\"")
    expect(m.notes.some((n) => /guessed/.test(n.message))).toBe(false)
  })

  it('hides a layer that some options remove', () => {
    const tree = frame('Tag', {}, [text('Label', 'Tag'), { id: 'x', name: 'Close', type: 'INSTANCE', role: 'icon', visible: true }])
    const d = design(tree, {
      defaultVariantProperties: { closable: 'yes' },
      variantDiffs: [{ variantId: 'v', variantProperties: { closable: 'no' }, layers: [], added: [], removed: ['Tag/Close'] }],
    })
    const m = generateMarkup(component('Tag', d, [prop('closable', 'enum', { defaultValue: 'yes', allowedValues: ['yes', 'no'] })]))
    expect(m.files[0].content).toContain("data-sly-test=\"${model.closableModifier == 'yes'}\"")
  })

  it('writes the same modifier class in the CSS, the HTL conditions and the model, even for camelCase values', () => {
    const tree = frame('Tab', {}, [text('Label', 'Tab')])
    const d = design(tree, {
      defaultVariantProperties: { Look: 'plainText' },
      variantDiffs: [{ variantId: 'v', variantProperties: { Look: 'iconOnly' }, layers: [{ path: 'Tab', changes: { fills: [{ type: 'SOLID', hex: '#111111' }] } }, { path: 'Tab/Label', changes: { visible: false } }], added: [{ parentPath: 'Tab', layer: { id: 'i', name: 'Mark', type: 'INSTANCE', role: 'icon', visible: true } }], removed: [] }],
    })
    const c = component('Tab', d, [prop('look', 'enum', { defaultValue: 'plainText', allowedValues: ['plainText', 'iconOnly'] })])
    const m = generateMarkup(c)
    expect(m.files[1].content).toContain('.cmp-tab--look-icononly {')
    expect(m.files[0].content).toContain("model.lookModifier == 'icononly'")
    expect(m.files[2].content).toContain('toLowerCase().replaceAll("[^a-z0-9]+", "-")')
  })

  it('uses the same model name in the HTL and the model for keys that are Java keywords or collide', () => {
    const tree = frame('Tile', {}, [text('Name', 'x', { role: 'heading', propertyRefs: { characters: 'class#1:1' } }), text('Sub', 'y', { role: 'text', propertyRefs: { characters: 'classValue#1:2' } })])
    const c = component('Tile', design(tree), [prop('class', 'string', { required: true }), prop('classValue', 'string', { required: true })])
    const m = generateMarkup(c)
    expect(m.files[0].content).toContain('${model.classValue}')
    expect(m.files[0].content).toContain('${model.classValue2}')
    expect(m.files[2].content).toContain('private String classValue2;')
    expect(validateMarkup(m)).toEqual([])
  })

  it('judges a layer by the default look, and keeps layers that only exist in a state hidden until that state (the Chip)', () => {
    const tree = frame('Chip', {}, [text('Text', 'Default', { role: 'text' })])
    const icon = (name: string, extra: object = {}) => ({ id: name, name, type: 'INSTANCE', role: 'icon', visible: true, ...extra })
    const diff = (variantProperties: Record<string, string>, added: object[]) => ({ variantId: JSON.stringify(variantProperties), variantProperties, layers: [], added: added.map((layer) => ({ parentPath: 'Chip', layer })), removed: [] })
    const d = design(tree, {
      defaultVariantProperties: { Type: 'Input', state: 'default' },
      variantDiffs: [
        diff({ Type: 'Filter', state: 'default' }, [icon('chevron')]),
        diff({ Type: 'Input', state: 'focused' }, [icon('close', { propertyRefs: { visible: 'has close button#1:1' } })]),
        diff({ Type: 'Filter', state: 'focused' }, [icon('chevron')]),
        diff({ Type: 'Input', state: 'disabled' }, []),
        diff({ Type: 'Filter', state: 'disabled' }, [icon('chevron-disabled')]),
      ],
    })
    const m = generateMarkup(component('Chip', d, [prop('hasCloseButton', 'boolean', { defaultValue: true }), prop('type', 'enum', { defaultValue: 'Input', allowedValues: ['Input', 'Filter'] }), prop('text', 'string', { defaultValue: 'Default' })]))
    const html = m.files[0].content
    expect(html).toContain('class="cmp-chip__chevron" data-sly-test="${model.typeModifier == \'filter\'}"')
    expect(html).toContain('class="cmp-chip__close" data-sly-test="${model.hasCloseButton}"')
    // Layers of one interaction state are in the markup, hidden, and the CSS shows them in that state.
    const css = m.files[1].content
    expect(html).toContain('cmp-chip__chevron-disabled')
    expect(css).toMatch(/\.cmp-chip__close \{[^}]*display: none;/s)
    // In the focus state only the Input type has it, and in the disabled state only the Filter type has its own chevron.
    expect(css).toContain('.cmp-chip:focus-visible.cmp-chip--type-input .cmp-chip__close {\n  display: block;\n}')
    expect(css).toMatch(/\.cmp-chip:disabled\.cmp-chip--type-filter \.cmp-chip__chevron-disabled/)
    expect(m.notes.some((n) => n.layer === 'close' && n.level === 'info' && /only shows in the focused state, so it is hidden until then/.test(n.message))).toBe(true)
    expect(m.notes.some((n) => n.layer === 'chevron-disabled' && /only shows in the disabled state/.test(n.message))).toBe(true)
    expect(m.notes.some((n) => /no single option/.test(n.message))).toBe(false)
    expect(validateMarkup(m)).toEqual([])
  })

  it('states what a combination of options looks like only where the single options stacked would be wrong', () => {
    const pad = (n: number) => ({ layout: { mode: 'HORIZONTAL', padding: { top: n, right: n, bottom: n, left: n }, sizingH: 'HUG', sizingV: 'HUG' } })
    const tree = frame('Btn', pad(8), [text('Label', 'Go')])
    const diff = (vp: Record<string, string>, p: number) => ({ variantId: JSON.stringify(vp), variantProperties: vp, layers: [{ path: 'Btn', changes: pad(p) }], added: [], removed: [] })
    const d = design(tree, {
      defaultVariantProperties: { size: 'sm', look: 'plain' },
      variantDiffs: [diff({ size: 'lg', look: 'plain' }, 16), diff({ size: 'sm', look: 'bold' }, 12), diff({ size: 'lg', look: 'bold' }, 20)],
    })
    const props = [prop('size', 'enum', { defaultValue: 'sm', allowedValues: ['sm', 'lg'] }), prop('look', 'enum', { defaultValue: 'plain', allowedValues: ['plain', 'bold'] })]
    const css = file(component('Btn', d, props), 'css')
    expect(css).toContain('.cmp-btn--size-lg {\n  padding: 16px;\n}')
    expect(css).toContain('.cmp-btn--look-bold {\n  padding: 12px;\n}')
    // lg + bold is 20, but stacking would give 12 (the later rule wins): the combination says 20.
    expect(css).toContain('.cmp-btn--size-lg.cmp-btn--look-bold {\n  padding: 20px;\n}')
    // When the stack is already right, nothing extra is written.
    const same = design(tree, { defaultVariantProperties: { size: 'sm', look: 'plain' }, variantDiffs: [diff({ size: 'lg', look: 'plain' }, 16), diff({ size: 'sm', look: 'bold' }, 12), diff({ size: 'lg', look: 'bold' }, 12)] })
    expect(file(component('Btn', same, props), 'css')).not.toContain('.cmp-btn--size-lg.cmp-btn--look-bold')
  })

  it('shows a layer of an interaction state only for the looks of the component that have it (the Date)', () => {
    const tree = frame('D', {}, [text('Day', '4')])
    const note = { id: 'n', name: 'Note', type: 'TEXT', role: 'text', visible: true, text: { characters: 'Last Day' } }
    const diff = (vp: Record<string, string>, added: object[]) => ({ variantId: JSON.stringify(vp), variantProperties: vp, layers: [], added: added.map((layer) => ({ parentPath: 'D', layer })), removed: [] })
    const d = design(tree, {
      defaultVariantProperties: { State: 'Default', Position: 'Start' },
      variantDiffs: [
        diff({ State: 'Default', Position: 'Last Day' }, []),
        diff({ State: 'Selected', Position: 'Start' }, []),
        diff({ State: 'Selected', Position: 'Last Day' }, [note]),
      ],
    })
    const props = [prop('position', 'enum', { defaultValue: 'Start', allowedValues: ['Start', 'Last Day'] })]
    const css = file(component('D', d, props), 'css')
    expect(css).toMatch(/\.cmp-d__note \{[^}]*display: none;/s)
    // Selected alone is not enough: it also has to be the Last Day look.
    expect(css).toContain('.cmp-d[aria-selected="true"].cmp-d--position-last-day .cmp-d__note,\n.cmp-d.is-selected.cmp-d--position-last-day .cmp-d__note {\n  display: inline;\n}')
    expect(css).not.toMatch(/\.cmp-d\.is-selected \.cmp-d__note/)
  })

  it('falls back to a simple wrapper without a layer structure', () => {
    const m = generateMarkup(component('Quote', null, [prop('quote', 'text'), prop('author', 'string'), prop('source', 'link')]))
    expect(m.fallback).toBe(true)
    expect(m.files[0].content).toContain('data-sly-test="${model.quote}"')
    expect(m.notes[0].message).toMatch(/no layer structure/)
    expect(validateMarkup(m)).toEqual([])
  })

  it('warns when the plugin cut the layer structure off', () => {
    const m = generateMarkup(component('Big', design(frame('Big'), { treeTruncated: true }), []))
    expect(m.notes.some((n) => /cut off/.test(n.message))).toBe(true)
  })
})

describe('validateMarkup', () => {
  const ok = generateMarkup(imported('Input'))
  const mutate = (kind: string, fn: (s: string) => string) => ({ ...ok, files: ok.files.map((f) => (f.kind === kind ? { ...f, content: fn(f.content) } : f)) })
  it('accepts generated output', () => expect(validateMarkup(ok)).toEqual([]))
  it('finds unbalanced tags, unknown model getters, duplicate attributes and bad CSS', () => {
    expect(validateMarkup(mutate('htl', (s) => s.replace('</span>', ''))).join()).toMatch(/unexpected|unclosed/)
    expect(validateMarkup(mutate('htl', (s) => s + '<p>${model.nope}</p>\n')).join()).toMatch(/model\.nope/)
    expect(validateMarkup(mutate('htl', (s) => s.replace('<div class="cmp-input ', '<div class="a" class="cmp-input '))).join()).toMatch(/"class" twice/)
    expect(validateMarkup(mutate('css', (s) => s + '.x { color: undefined;')).join()).toMatch(/braces|unresolved/)
  })
})

describe('layers placed by their coordinates, and drawn shapes', () => {
  const design = (tree: object) => ({ tree, variantDiffs: [], states: [], sizes: [], treeTruncated: false })
  const css = (tree: object, props: Property[] = []) => file(component('Box', design(tree), props), 'css')
  const html = (tree: object) => file(component('Box', design(tree), []), 'htl')
  const shape = (name: string, extra: object = {}) => ({ id: name, name, type: 'RECTANGLE', role: 'unknown', visible: true, size: { width: 10, height: 10 }, ...extra })

  it('places children of a frame without auto layout at their coordinates, and makes that frame the reference', () => {
    const c = css(frame('Box', { size: { width: 80, height: 60 } }, [shape('Dot', { position: { x: 30, y: 6 } }), shape('Flow')]))
    expect(c).toMatch(/\.cmp-box \{[^}]*position: relative;/s)
    expect(c).toMatch(/__dot \{[^}]*position: absolute;[^}]*left: 30px;[^}]*top: 6px;/s)
    expect(c).not.toMatch(/__flow \{[^}]*position: absolute/s) // no position known: it stays in the flow
  })

  it('does not place children that auto layout places, unless they are absolute', () => {
    const tree = frame('Box', { layout: { mode: 'HORIZONTAL', sizingH: 'HUG', sizingV: 'HUG' } }, [shape('Flows', { position: { x: 5, y: 5 } }), shape('Badge', { position: { x: 40, y: -4 }, layoutPositioning: 'ABSOLUTE' })])
    const c = css(tree)
    expect(c).not.toMatch(/__flows \{[^}]*position: absolute/s)
    expect(c).toMatch(/__badge \{[^}]*position: absolute;[^}]*left: 40px;[^}]*top: -4px;/s)
    expect(c).toMatch(/\.cmp-box \{[^}]*position: relative;/s)
  })

  it('treats a group as no box at all, and places what is in it against the frame around it', () => {
    const c = css(frame('Box', { size: { width: 80, height: 80 } }, [{ id: 'g', name: 'Group', type: 'GROUP', role: 'container', visible: true, size: { width: 30, height: 30 }, children: [shape('Inside', { position: { x: 15, y: 25 } })] }]))
    expect(c).toMatch(/__group \{[^}]*display: contents;/s)
    expect(c).not.toMatch(/__group \{[^}]*width/s)
    expect(c).toMatch(/\.cmp-box \{[^}]*position: relative;/s) // the frame, not the group, is the reference
    expect(c).toMatch(/__inside \{[^}]*position: absolute;[^}]*left: 15px;[^}]*top: 25px;/s)
  })

  it('applies a rotation or flip as a matrix from the corner, and clips and blends', () => {
    const c = css(frame('Box', { clipsContent: true, blendMode: 'MULTIPLY' }, [shape('Tilt', { position: { x: 8, y: 20 }, transform: [0.866, 0.5, -0.5, 0.866] })]))
    expect(c).toMatch(/\.cmp-box \{[^}]*overflow: hidden;[^}]*mix-blend-mode: multiply;/s)
    expect(c).toMatch(/__tilt \{[^}]*transform: matrix\(0\.866, 0\.5, -0\.5, 0\.866, 0, 0\);[^}]*transform-origin: 0 0;/s)
  })

  it('keeps the width of an absolute text box, and lets one that follows its text stay on one line', () => {
    const t = (autoResize: string) => css(frame('Box', {}, [{ id: 't', name: 'Words', type: 'TEXT', role: 'text', visible: true, size: { width: 50, height: 20 }, position: { x: 1, y: 2 }, text: { characters: 'x', autoResize } }]))
    expect(t('NONE')).toMatch(/__words \{[^}]*width: 50px;/s)
    expect(t('NONE')).not.toContain('white-space: nowrap')
    expect(t('WIDTH_AND_HEIGHT')).toContain('white-space: nowrap;')
  })

  it('fills the row for a text or shape that asks to fill, and gives a round ellipse', () => {
    const c = css(frame('Box', { layout: { mode: 'HORIZONTAL', sizingH: 'HUG', sizingV: 'HUG' } }, [
      { id: 't', name: 'Grow', type: 'TEXT', role: 'text', visible: true, size: { width: 10, height: 10 }, sizing: { h: 'FILL', v: 'HUG' }, text: { characters: 'x' } },
      shape('Round', { type: 'ELLIPSE' }),
    ]))
    expect(c).toMatch(/__grow \{[^}]*flex: 1 1 0;[^}]*min-width: 0;/s)
    expect(c).toMatch(/__round \{[^}]*border-radius: 50%;/s)
  })

  it('draws gradients as background layers, stacked top first', () => {
    const lin = { type: 'GRADIENT_LINEAR', gradient: { kind: 'LINEAR', angle: 90, stops: [{ position: 0, hex: '#ff0000', alpha: 1 }, { position: 1, hex: '#0000ff', alpha: 0.5 }] } }
    expect(css(frame('Box', { fills: [lin] }))).toContain('background-image: linear-gradient(90deg, #ff0000 0%, rgba(0, 0, 255, 0.5) 100%);')
    const stacked = css(frame('Box', { fills: [{ type: 'SOLID', hex: '#00ff00' }, lin] }))
    expect(stacked).toContain('background-image: linear-gradient(90deg, #ff0000 0%, rgba(0, 0, 255, 0.5) 100%), linear-gradient(#00ff00, #00ff00);')
    const rad = { type: 'GRADIENT_RADIAL', gradient: { kind: 'RADIAL', center: { x: 0.5, y: 0.5 }, radii: { x: 0.5, y: 0.25 }, stops: [{ position: 0, hex: '#ffffff', alpha: 1 }, { position: 1, hex: '#000000', alpha: 1 }] } }
    expect(css(frame('Box', { fills: [rad] }))).toContain('radial-gradient(ellipse 50% 25% at 50% 50%, #ffffff 0%, #000000 100%)')
  })

  it('draws a stroke on one side, or dashed, without changing any size', () => {
    const stroke = (extra: object) => css(frame('Box', { strokes: { paints: [{ type: 'SOLID', hex: '#ff0000', alpha: 1 }], weight: 3, align: 'INSIDE', ...extra } }))
    expect(stroke({ sides: { top: 0, right: 0, bottom: 3, left: 0 } })).toContain('box-shadow: inset 0 -3px 0 0 #ff0000;')
    expect(stroke({ sides: { top: 1, right: 0, bottom: 0, left: 2 } })).toContain('box-shadow: inset 0 1px 0 0 #ff0000, inset 2px 0 0 0 #ff0000;')
    expect(stroke({ align: 'OUTSIDE', sides: { top: 2, right: 0, bottom: 0, left: 0 } })).toContain('box-shadow: 0 -2px 0 0 #ff0000;')
    const dashed = stroke({ dash: [4, 2] })
    expect(dashed).toContain('outline: 3px dashed #ff0000;')
    expect(dashed).toContain('outline-offset: -3px;')
    expect(dashed).not.toContain('box-shadow')
  })

  it('writes a drawn shape as inline SVG coloured like text, with its outline as a second path', () => {
    const tree = frame('Box', {}, [{ id: 'v', name: 'Arrow', type: 'VECTOR', role: 'icon', visible: true, size: { width: 18, height: 17 }, fills: [{ type: 'SOLID', hex: '#98a2b3', alpha: 1 }], strokes: { paints: [{ type: 'SOLID', hex: '#101828', alpha: 1 }], weight: 1, align: 'CENTER' }, graphic: { fills: [{ d: 'M0 0L18 8.5L0 17Z', rule: 'EVENODD' }], strokes: [{ d: 'M1 1L17 8L1 16Z' }] } }])
    const h = html(tree)
    expect(h).toContain('<svg class="cmp-box__arrow" viewBox="0 0 18 17" width="18" height="17" aria-hidden="true" focusable="false">')
    expect(h).toContain('<path d="M0 0L18 8.5L0 17Z" fill-rule="evenodd" clip-rule="evenodd" fill="currentColor"/>')
    expect(h).toContain('<path class="cmp-box__arrow-stroke" d="M1 1L17 8L1 16Z"/>')
    const c = css(tree)
    expect(c).toMatch(/__arrow \{[^}]*color: #98a2b3;/s)
    expect(c).not.toMatch(/__arrow \{[^}]*background-color/s)
    expect(c).not.toMatch(/__arrow \{[^}]*box-shadow/s) // the outline is the second path
    expect(c).toContain('.cmp-box__arrow-stroke {\n  fill: #101828;\n}')
    expect(validateMarkup(generateMarkup(component('Box', design(tree), [])))).toEqual([])
  })
})


describe('a look that keeps a copy of its layers for each state (the Rayna Tab in Pill)', () => {
  const raw = import.meta.glob('../../test/fixtures/designmd-tab.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const cat = parseDesignMdText(Object.values(raw)[0])
  const tab = importDesignMd(cat, cat.entries.map((e) => e.id)).components[0]
  const css = generateMarkup(tab).files[1].content
  const shownBy = (state: string) => css.split('\n\n').filter((r) => r.split('{')[0].includes(state) && r.split('{')[0].includes('--style-pill') && /display: (inline|block|flex)/.test(r)).flatMap((r) => r.split('{')[0].match(/__[\w-]+/g) ?? [])

  it('draws the hovered and active pill without the border the resting pill has, as the design does', () => {
    expect(css).toMatch(/--style-pill \{[^}]*box-shadow: inset 0 0 0 1px #d0d5dd/s)
    for (const sel of [':hover.cmp-tab--style-pill {', '.cmp-tab.is-active.cmp-tab--style-pill {']) {
      const rule = css.split('\n\n').find((r) => r.split('{')[0].trim().endsWith(sel.slice(0, -2)))
      expect(rule, sel).toMatch(/box-shadow: (initial|none)/)
    }
  })

  it('shows, in each state, only that state\'s copies, never another state\'s', () => {
    const states = { hover: shownBy(':hover'), active: shownBy('is-active'), disabled: shownBy(':disabled') }
    for (const [state, own] of Object.entries(states)) {
      expect(own.length, state).toBeGreaterThan(0)
      for (const [other, theirs] of Object.entries(states)) if (other !== state) expect(own.filter((c) => theirs.includes(c)).filter((c) => /icon-home|badge|label/.test(c)), `${state} shows ${other}'s layers`).toEqual([])
    }
  })
})

describe('a layer the design does not have in some interaction states (the Rayna Breadcrumb)', () => {
  const raw = import.meta.glob('../../test/fixtures/designmd-breadcrumb.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const cat = parseDesignMdText(Object.values(raw)[0])
  const crumb = importDesignMd(cat, cat.entries.map((e) => e.id)).components[0]
  const m = generateMarkup(crumb)
  const css = m.files[1].content

  it('keeps it in the markup and hides it in the states where the design removes it', () => {
    const el = /cmp-breadcrumb__(content-separator)\b/
    expect(m.files[0].content).toMatch(el)
    for (const sel of [':hover', '[aria-selected="true"]', ':disabled']) {
      const rule = css.split('\n\n').find((r) => r.split('{')[0].includes(sel) && /__content-separator[,\s{]/.test(r.split('{')[0]) && /display: none/.test(r))
      expect(rule, sel).toBeTruthy()
    }
  })
})

describe('layers and states in the Rayna Chip and Input', () => {
  const load = (glob: Record<string, string>, name?: string) => {
    const cat = parseDesignMdText(Object.values(glob)[0])
    const e = name ? cat.entries.find((x) => x.name === name)! : cat.entries[0]
    return importDesignMd(cat, [e.id]).components[0]
  }
  const rules = (css: string) => css.split('\n\n')

  it('hides the chevron of a filter chip in the states and looks where the design has none', () => {
    const css = generateMarkup(load(chipRaw, 'Chip')).files[1].content
    expect(rules(css).some((r) => /:disabled|aria-disabled/.test(r.split('{')[0]) && /__icon-chevron-down[^-]/.test(r.split('{')[0]) && /display: none/.test(r))).toBe(true)
  })

  it('keeps a layer the design itself hides hidden in the state that adds it (the input\'s second rectangle)', () => {
    const inputRaw = import.meta.glob('../../test/fixtures/designmd-input.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const css = generateMarkup(load(inputRaw)).files[1].content
    expect(rules(css).some((r) => /is-filled/.test(r.split('{')[0]) && /__rectangle-2/.test(r.split('{')[0]))).toBe(false)
  })
})
