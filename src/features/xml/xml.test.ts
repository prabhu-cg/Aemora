import { describe, expect, it } from 'vitest'
import { makeComponent, makeProperty } from '../components/factory'
import type { ComponentDef, Property } from '../components/schema'
import { addSection, addTab, buildDialog, placeField, setTitle } from '../dialog/ops'
import { resolveComponent } from '../mapping/engine'
import { FIELD_TYPE_IDS, type Mapping } from '../mapping/schema'
import { setFieldType, setMultifield, setConstraint } from '../mapping/ops'
import { ALLOWED_RESOURCE_TYPES, RESOURCE_TYPES } from '../aem/resourceTypes'
import { node, s, b, l, d, sa } from '../aem/nodes'
import { approachNotes, buildDialogNode, generateXml } from './build'
import { formatXml, highlightXml } from './format'
import { escapeAttr, formatValue, safeName, serializeDocument, serializeNode, unescapeAttr } from './serialize'
import { checkAem, checkGenerator, checkSyntax, parseXml, validateAll } from './validate'

const make = (props: Property[], mappings: Mapping[] = [], extra: Partial<ComponentDef> = {}) => {
  const c = makeComponent({ name: 'Card', type: 'card', properties: props, ...extra })
  return { c, fields: resolveComponent(c, mappings), dialog: buildDialog(c) }
}
const gen = (props: Property[], mappings: Mapping[] = [], extra: Partial<ComponentDef> = {}, format?: 'standalone' | 'inline') => {
  const m = make(props, mappings, extra)
  return { ...m, xml: generateXml({ component: m.c, dialog: m.dialog, fields: m.fields, projectName: 'My Site', format }) }
}
const p = (key: string, type: Property['type'] = 'string', extra: Partial<Property> = {}) => makeProperty({ key, label: key[0].toUpperCase() + key.slice(1), type, ...extra })
const doc = (xml: string) => parseXml(xml).doc!
const attr = (el: Element | null | undefined, a: string) => el?.getAttribute(a)
const find = (root: Element, ...path: string[]) => path.reduce<Element | null>((e, n) => (e ? [...e.children].find((c) => c.tagName === n) ?? null : null), root)

describe('serialization', () => {
  it('escapes everything an attribute can break on', () => {
    expect(escapeAttr('a & b < c > "d"')).toBe('a &amp; b &lt; c &gt; &quot;d&quot;')
    expect(escapeAttr('line1\nline2\ttab\rcr')).toBe('line1&#xa;line2&#x9;tab&#xd;cr')
    expect(escapeAttr('ok\u0000\u0008\u000b')).toBe('ok')
    expect(unescapeAttr(escapeAttr('x & <y> "z"\n'))).toBe('x & <y> "z"\n')
  })
  it('writes typed values the way FileVault reads them', () => {
    expect(formatValue(s('plain'))).toBe('plain')
    expect(formatValue(s('{Boolean}true'))).toBe('\\{Boolean}true') // a string that looks like a type is escaped
    expect(formatValue(s('[a]'))).toBe('\\[a]')
    expect(formatValue(s('${suffix.path}'))).toBe('${suffix.path}')
    expect(formatValue(b(true))).toBe('{Boolean}true')
    expect(formatValue(l(7.9))).toBe('{Long}7')
    expect(formatValue(d(1.5))).toBe('{Double}1.5')
    expect(formatValue(sa(['a', 'b,c', 'd\\e']))).toBe('[a,b\\,c,d\\\\e]')
    expect(formatValue(sa([]))).toBe('[]')
  })
  it('makes unsafe names safe instead of emitting them', () => {
    expect(safeName('jcr:primaryType')).toBe('jcr:primaryType')
    expect(safeName('my field!')).toBe('my_field_')
    expect(safeName('9lives')).toBe('_9lives')
    expect(serializeNode(node('a b', { 'x y': s('1') }))).toContain('<a_b')
  })
  it('puts one attribute per line and self-closes empty nodes', () => {
    const xml = serializeNode(node('root', { 'jcr:primaryType': s('nt:unstructured') }, [node('child', { a: s('1') })]))
    expect(xml).toBe(['<root', '    jcr:primaryType="nt:unstructured">', '    <child', '        a="1"/>', '</root>'].join('\n'))
  })
  it('declares namespaces on the root and escapes comment text', () => {
    const xml = serializeDocument(node('jcr:root', { 'jcr:primaryType': s('nt:unstructured') }), { comment: ['Note -- double dash'] })
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<!--')).toBe(true)
    expect(xml).toContain('xmlns:jcr="http://www.jcp.org/jcr/1.0"')
    expect(xml).toContain('xmlns:sling="http://sling.apache.org/jcr/sling/1.0"')
    expect(xml).toContain('Note - - double dash')
    expect(checkSyntax(xml).ok).toBe(true)
  })
})

describe('generated dialog structure', () => {
  const g = gen([p('title', 'string', { required: true, label: 'Title', description: 'Shown above' }), p('size', 'enum', { allowedValues: ['s', 'l'], defaultValue: 's' })])
  const root = doc(g.xml).documentElement
  it('is complete, well-formed XML with the standard dialog skeleton', () => {
    expect(g.xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(checkSyntax(g.xml)).toEqual({ ok: true })
    expect(root.tagName).toBe('jcr:root')
    expect(attr(root, 'jcr:primaryType')).toBe('nt:unstructured')
    expect(attr(root, 'jcr:title')).toBe('Card')
    expect(attr(root, 'sling:resourceType')).toBe('cq/gui/components/authoring/dialog')
    const content = find(root, 'content')!
    expect(attr(content, 'sling:resourceType')).toBe(RESOURCE_TYPES.container)
    const tabs = find(content, 'items', 'tabs')!
    expect(attr(tabs, 'sling:resourceType')).toBe(RESOURCE_TYPES.tabs)
    expect(attr(tabs, 'maximized')).toBe('{Boolean}true')
    const tab = find(tabs, 'items', 'properties')!
    expect(attr(tab, 'jcr:title')).toBe('Properties')
    expect(attr(find(tab, 'layout'), 'sling:resourceType')).toBe(RESOURCE_TYPES.layoutFixedColumns)
    const column = find(tab, 'items', 'column')!
    expect([...find(column, 'items')!.children].map((c) => c.tagName)).toEqual(['title', 'size'])
  })
  it('writes each field with the exact attributes the engine resolved', () => {
    const title = find(root, 'content', 'items', 'tabs', 'items', 'properties', 'items', 'column', 'items', 'title')!
    expect(attr(title, 'sling:resourceType')).toBe(RESOURCE_TYPES.textfield)
    expect(attr(title, 'name')).toBe('./title')
    expect(attr(title, 'fieldLabel')).toBe('Title')
    expect(attr(title, 'fieldDescription')).toBe('Shown above')
    expect(attr(title, 'required')).toBe('{Boolean}true')
    const size = find(root, 'content', 'items', 'tabs', 'items', 'properties', 'items', 'column', 'items', 'size')!
    expect([...find(size, 'items')!.children].map((i) => [attr(i, 'text'), attr(i, 'value'), attr(i, 'selected')])).toEqual([['s', 's', '{Boolean}true'], ['l', 'l', null]])
  })
  it('has a header comment with the target path and the generator caveat', () => {
    expect(g.xml).toMatch(/Place this at: \/apps\/my-site\/components\/card\/_cq_dialog\/\.content\.xml/)
    expect(g.xml).toMatch(/Not yet tested on a running AEM instance/)
    expect(g.xml).toMatch(/No clientlibs, custom widgets or scripts/)
  })
  it('uses the given component folder name in the target path', () => {
    const m = make([p('a')], [], { name: 'Card Teaser' })
    expect(generateXml({ component: m.c, dialog: m.dialog, fields: m.fields, projectName: 'Site', componentFolder: 'teaser-card' })).toContain('/apps/site/components/teaser-card/_cq_dialog/.content.xml')
    expect(generateXml({ component: m.c, dialog: m.dialog, fields: m.fields })).toContain('/apps/<project>/components/card-teaser/')
  })
  it('records how nested components are handled', () => {
    const c = gen([p('a')], [], { children: [{ name: 'Primary Button', approach: 'expose-properties', exposedKeys: ['label', 'link'] }, { name: 'Icon', approach: 'reference-component', exposedKeys: [] }] })
    expect(c.xml).toContain('Nested "Primary Button": this dialog exposes selected properties (label, link). No separate component is created.')
    expect(c.xml).toContain('Nested "Icon": authored as an independent component; this dialog references it.')
    expect(approachNotes(makeComponent({ name: 'X' }))).toEqual([])
  })
  it('builds tabs and sections from the dialog layout', () => {
    const c = makeComponent({ name: 'Card', properties: [p('a'), p('b'), p('c')] })
    let dlg = buildDialog(c)
    const t = addTab(dlg, 'Style'); dlg = t.dialog
    const sec = addSection(dlg, dlg.tabs[0].id, 'Link'); dlg = sec.dialog
    dlg = placeField(dlg, c.properties[1].id, { tabId: dlg.tabs[0].id, sectionId: sec.section.id })
    dlg = placeField(dlg, c.properties[2].id, { tabId: t.tab.id })
    dlg = setTitle(dlg, 'Edit card')
    const xml = generateXml({ component: c, dialog: dlg, fields: resolveComponent(c, []) })
    const r = doc(xml).documentElement
    expect(attr(r, 'jcr:title')).toBe('Edit card')
    const tabs = find(r, 'content', 'items', 'tabs', 'items')!
    expect([...tabs.children].map((x) => [x.tagName, attr(x, 'jcr:title')])).toEqual([['properties', 'Properties'], ['style', 'Style']])
    const col = find(tabs, 'properties', 'items', 'column', 'items')!
    expect([...col.children].map((x) => x.tagName)).toEqual(['a', 'sectionLink'])
    const fieldset = find(col, 'sectionLink')!
    expect(attr(fieldset, 'sling:resourceType')).toBe(RESOURCE_TYPES.fieldset)
    expect(attr(fieldset, 'jcr:title')).toBe('Link')
    expect([...find(fieldset, 'items')!.children].map((x) => x.tagName)).toEqual(['b'])
  })
  it('can put the dialog inline under cq:dialog in the component .content.xml', () => {
    const g2 = gen([p('a')], [], {}, 'inline')
    const r = doc(g2.xml).documentElement
    expect(attr(r, 'jcr:primaryType')).toBe('cq:Component')
    expect(r.getAttribute('xmlns:cq')).toBe('http://www.day.com/jcr/cq/1.0')
    const dlg = find(r, 'cq:dialog')!
    expect(attr(dlg, 'sling:resourceType')).toBe('cq/gui/components/authoring/dialog')
    expect(g2.xml).toMatch(/\.content\.xml \(cq:dialog node\)/)
    expect(checkAem(doc(g2.xml)).filter((i) => i.level === 'error')).toEqual([])
  })
  it('keeps sibling node names unique even when keys would collide', () => {
    const g3 = gen([p('flag', 'boolean'), p('flagTypeHint')])
    const names = [...find(doc(g3.xml).documentElement, 'content', 'items', 'tabs', 'items', 'properties', 'items', 'column', 'items')!.children].map((c) => c.tagName)
    expect(new Set(names).size).toBe(names.length)
    expect(checkAem(doc(g3.xml)).filter((i) => i.code === 'duplicate-node')).toEqual([])
  })
})

describe('every field type produces valid, allowed XML', () => {
  it.each(FIELD_TYPE_IDS)('%s', (id) => {
    const prop = p('thing', 'string', { allowedValues: ['a', 'b'], label: 'Thing' })
    const c = makeComponent({ name: 'X', properties: [prop] })
    let ms = setFieldType([], c, prop, id).mappings
    if (id === 'multifield') ms = setMultifield(ms, c, prop, { composite: true })
    const xml = generateXml({ component: c, dialog: buildDialog(c), fields: resolveComponent(c, ms) })
    expect(checkSyntax(xml).ok).toBe(true)
    const issues = checkAem(doc(xml))
    expect(issues.filter((i) => i.level === 'error')).toEqual([])
    for (const el of doc(xml).querySelectorAll('[*|resourceType], *')) {
      const rt = el.getAttribute('sling:resourceType')
      if (rt) expect(ALLOWED_RESOURCE_TYPES.has(rt)).toBe(true)
    }
  })
  it('typed values survive: numbers, booleans, arrays, dates and hint siblings', () => {
    const num = p('count', 'number', { defaultValue: 3 })
    const flag = p('on', 'boolean', { defaultValue: true })
    const tags = p('tags', 'tags')
    const img = p('hero', 'image')
    const c = makeComponent({ name: 'X', properties: [num, flag, tags, img] })
    const ms = setFieldType(setConstraint([], c, num, 'min', 1), c, img, 'fileupload').mappings
    const xml = generateXml({ component: c, dialog: buildDialog(c), fields: resolveComponent(c, ms) })
    const items = find(doc(xml).documentElement, 'content', 'items', 'tabs', 'items', 'properties', 'items', 'column', 'items')!
    expect(attr(find(items, 'count'), 'value')).toBe('{Long}3')
    expect(attr(find(items, 'count'), 'min')).toBe('{Long}1')
    expect(attr(find(items, 'on'), 'checked')).toBe('{Boolean}true')
    expect(attr(find(items, 'onTypeHint'), 'name')).toBe('./on@TypeHint')
    expect(attr(find(items, 'hero'), 'mimeTypes')).toMatch(/^\[image\/gif,/)
    expect(attr(find(items, 'hero'), 'uploadUrl')).toBe('${suffix.path}')
  })
  it('a composite multifield nests container, items and named fields', () => {
    const links = p('links', 'list', { label: 'Links' })
    const c = makeComponent({ name: 'X', properties: [links] })
    const xml = generateXml({ component: c, dialog: buildDialog(c), fields: resolveComponent(c, setMultifield([], c, links, { composite: true })) })
    const mf = find(doc(xml).documentElement, 'content', 'items', 'tabs', 'items', 'properties', 'items', 'column', 'items', 'links')!
    expect(attr(mf, 'composite')).toBe('{Boolean}true')
    const field = find(mf, 'field')!
    expect(attr(field, 'sling:resourceType')).toBe(RESOURCE_TYPES.container)
    expect(attr(field, 'name')).toBe('./links')
    expect([...find(field, 'items')!.children].map((x) => [x.tagName, attr(x, 'name')])).toEqual([['label', './label'], ['link', './link']])
  })
})

describe('hostile and awkward text', () => {
  it('escapes markup, quotes, newlines and leading braces in labels, descriptions and defaults', () => {
    const nasty = p('t', 'string', { label: 'A & B <script>alert("x")</script>', description: 'Line one\nLine two\ttabbed', defaultValue: '{Boolean}true', allowedValues: [] })
    const g = gen([nasty])
    expect(checkSyntax(g.xml).ok).toBe(true)
    const el = find(doc(g.xml).documentElement, 'content', 'items', 'tabs', 'items', 'properties', 'items', 'column', 'items', 't')!
    expect(attr(el, 'fieldLabel')).toBe('A & B <script>alert("x")</script>')
    expect(attr(el, 'fieldDescription')).toBe('Line one\nLine two\ttabbed')
    expect(attr(el, 'value')).toBe('\\{Boolean}true')
    expect(g.xml).not.toContain('<script>')
    expect(checkAem(doc(g.xml)).some((i) => i.code === 'script')).toBe(true) // and the compatibility layer flags it
  })
  it('handles unicode and emoji', () => {
    const g = gen([p('t', 'string', { label: 'Überschrift – 見出し 🙂' })])
    expect(checkSyntax(g.xml).ok).toBe(true)
    expect(g.xml).toContain('Überschrift – 見出し 🙂')
  })
  it('handles a component and tab with odd names', () => {
    const g = gen([p('a')], [], { name: 'Hero & "Banner" <1>' })
    expect(checkSyntax(g.xml).ok).toBe(true)
    expect(attr(doc(g.xml).documentElement, 'jcr:title')).toBe('Hero & "Banner" <1>') // the dialog title starts as the component name
  })
})

describe('layer 1: XML syntax', () => {
  it('accepts well-formed XML', () => expect(checkSyntax('<a b="1"><c/></a>')).toEqual({ ok: true }))
  it('explains broken XML and keeps going', () => {
    for (const bad of ['<a><b></a>', '<a b=1/>', '<a', 'not xml', '<a></b>']) {
      const r = checkSyntax(bad)
      expect(r.ok).toBe(false)
      expect(r.message).toBeTruthy()
    }
    expect(checkSyntax('   ').message).toBe('The XML is empty.')
  })
  it('refuses DOCTYPE and ENTITY declarations before parsing (no external entity resolution)', () => {
    const xxe = '<?xml version="1.0"?><!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><a>&x;</a>'
    expect(checkSyntax(xxe)).toEqual({ ok: false, message: 'DOCTYPE and ENTITY declarations are not allowed in dialog XML.' })
    expect(parseXml('<!doctype a><a/>').doc).toBeNull()
    expect(parseXml('<a><!ENTITY b "c"></a>').doc).toBeNull()
  })
})

describe('layer 2: generator checks', () => {
  it('collects property, field and dialog problems with their source', () => {
    const bad = p('a', 'enum') // enum with no values: property warning + select error
    const m = make([bad])
    const issues = checkGenerator(m.c, m.dialog, m.fields, true)
    expect(issues.some((i) => i.source === 'property')).toBe(true)
    expect(issues.some((i) => i.source === 'field' && i.level === 'error')).toBe(true)
    expect(checkGenerator(makeComponent({ name: 'Empty' }), buildDialog(makeComponent({ name: 'Empty' })), [], true).some((i) => i.source === 'dialog')).toBe(true)
  })
  it('warns when the project has no component name', () => {
    const m = make([p('a')])
    expect(checkGenerator(m.c, m.dialog, m.fields, false).some((i) => i.source === 'component')).toBe(true)
    expect(checkGenerator(m.c, m.dialog, m.fields, true)).toEqual([])
  })
})

describe('layer 3: AEM compatibility (structure only)', () => {
  const ok = gen([p('a')]).xml
  const codes = (xml: string) => checkAem(doc(xml)).map((i) => i.code)
  const mutate = (fn: (x: string) => string) => fn(ok)
  it('finds nothing wrong with generated output', () => expect(checkAem(doc(ok))).toEqual([]))
  it('flags a wrong root, missing namespaces and a wrong dialog type', () => {
    expect(codes('<root/>')).toEqual(['root'])
    expect(codes(mutate((x) => x.replace(/xmlns:nt="[^"]*"/, '')))).toContain('namespace')
    // A prefix that is used but not declared is not even well-formed XML, so layer 1 catches that one.
    expect(checkSyntax(mutate((x) => x.replace(/xmlns:sling="[^"]*"/, ''))).ok).toBe(false)
    expect(codes(mutate((x) => x.replace('cq/gui/components/authoring/dialog', 'something/else')))).toContain('dialog-type')
  })
  it('flags Classic UI, custom code and scripts', () => {
    expect(codes(mutate((x) => x.replace('<content', '<content xtype="panel"')))).toContain('custom-code')
    expect(codes(mutate((x) => x.replace('<content', '<content extraClientlibs="my.lib"')))).toContain('custom-code')
    expect(codes(mutate((x) => x.replace(/(<content\s+jcr:primaryType=")nt:unstructured/, '$1cq:Dialog')))).toContain('classic-ui')
    expect(codes(mutate((x) => x.replace('fieldLabel="A"', 'fieldLabel="javascript:alert(1)"')))).toContain('script')
  })
  it('flags unsupported resource types, bad value prefixes and missing primary types', () => {
    expect(codes(mutate((x) => x.replace(RESOURCE_TYPES.textfield, 'my/custom/widget')))).toContain('resource-type')
    expect(codes(mutate((x) => x.replace('maximized="{Boolean}true"', 'maximized="{Wat}true"')))).toContain('value-type')
    expect(codes(mutate((x) => x.replace('maximized="{Boolean}true"', 'maximized="{Boolean}yes"')))).toContain('value-type')
    expect(codes('<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0" xmlns:nt="http://www.jcp.org/jcr/nt/1.0" xmlns:sling="http://sling.apache.org/jcr/sling/1.0" sling:resourceType="cq/gui/components/authoring/dialog"/>')).toEqual(expect.arrayContaining(['primary-type', 'content']))
  })
  it('flags fields that cannot work: no name, bad name, empty select, multifield without field', () => {
    expect(codes(mutate((x) => x.replace('name="./a"', '')))).toContain('field-name')
    expect(codes(mutate((x) => x.replace('name="./a"', 'name="a"')))).toContain('field-name')
    const sel = gen([p('s', 'enum', { allowedValues: ['x'] })]).xml
    expect(codes(sel.replace(/<item0[\s\S]*?\/>/, ''))).toContain('select-items')
    expect(codes(sel.replace(/ text="x"/, ''))).toContain('select-item')
    const mf = gen([p('m', 'list')]).xml
    expect(codes(mf.replace(/<field[\s\S]*?\/>/, ''))).toContain('multifield-field')
  })
  it('flags duplicate sibling nodes and two fields saving to one name', () => {
    expect(codes(mutate((x) => x.replace('<layout', '<column\n jcr:primaryType="nt:unstructured"/><column\n jcr:primaryType="nt:unstructured"/><layout')))).toContain('duplicate-node')
    const two = gen([p('a'), p('b')]).xml.replace('name="./b"', 'name="./a"')
    expect(codes(two)).toContain('duplicate-name')
  })
})

describe('validation layers stay separate', () => {
  it('syntax failure means there is nothing for the AEM layer to check, but the generator layer still reports', () => {
    const m = make([p('a')])
    const r = validateAll('<a><b></a>', m.c, m.dialog, m.fields, true)
    expect(r.syntax.ok).toBe(false)
    expect(r.aem).toBeNull()
    expect(Array.isArray(r.generator)).toBe(true)
  })
  it('all three report for valid XML', () => {
    const g = gen([p('a')])
    const r = validateAll(g.xml, g.c, g.dialog, g.fields, true)
    expect(r.syntax).toEqual({ ok: true })
    expect(r.generator).toEqual([])
    expect(r.aem).toEqual([])
  })
})

describe('format and highlight', () => {
  it('formatting generated XML changes nothing, and fixes sloppy indentation', () => {
    const g = gen([p('a'), p('b', 'enum', { allowedValues: ['x', 'y'] })]).xml
    const body = (x: string) => x.replace(/<!--[\s\S]*?-->\n/, '')
    expect(formatXml(g)).toBe(g)
    const squashed = g.replace(/\n\s+/g, ' ')
    expect(body(formatXml(squashed))).toBe(body(g))
    expect(checkSyntax(formatXml(squashed)).ok).toBe(true)
  })
  it('keeps comments and special characters', () => {
    const out = formatXml('<?xml version="1.0"?><!-- keep me --><a t="x &amp; y &lt;z&gt;"><!-- inner --><b/></a>')
    expect(out).toContain('<!-- keep me -->')
    expect(out).toContain('<!-- inner -->')
    expect(out).toContain('t="x &amp; y &lt;z&gt;"')
  })
  it('refuses to format broken XML with a readable error', () => {
    expect(() => formatXml('<a><b></a>')).toThrow()
    expect(() => formatXml('<!DOCTYPE a><a/>')).toThrow(/not allowed/)
  })
  it('highlighting escapes document text and marks tags, attributes and values', () => {
    const html = highlightXml('<a b="<script>">\n<!-- c -->\n</a>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('xml-tag')
    expect(html).toContain('xml-attr')
    expect(html).toContain('xml-value')
    expect(html).toContain('xml-comment')
    expect(highlightXml('<x onload="1">')).not.toMatch(/<x /)
  })
})

describe('node tree builder', () => {
  it('buildDialogNode returns the dialog node without serializing', () => {
    const m = make([p('a')])
    const n = buildDialogNode(m.dialog, m.fields)
    expect(n.name).toBe('jcr:root')
    expect(n.children[0].name).toBe('content')
    expect(buildDialogNode(m.dialog, m.fields, 'cq:dialog').name).toBe('cq:dialog')
  })
})
