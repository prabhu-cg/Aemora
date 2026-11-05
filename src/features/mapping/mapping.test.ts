import { describe, expect, it } from 'vitest'
import { makeComponent, makeProperty } from '../components/factory'
import { PROPERTY_TYPES, type Property, type PropertyType } from '../components/schema'
import { ALLOWED_RESOURCE_TYPES, RESOURCE_TYPES } from '../aem/resourceTypes'
import type { AemNode } from '../aem/nodes'
import { COMPATIBLE, FIELD_TYPES, fieldTypeList } from './fieldTypes'
import { defaultForField, fieldTypeWarning, resolveComponent, resolveField, suggestFieldType } from './engine'
import { fieldToNodes } from './nodes'
import { validateField, validateFields } from './validate'
import {
  addSubfield, patchSubfield, pruneMappings, removeSubfield, resetMapping, setConstraint, setFieldType, setMultifield, setOverrides,
} from './ops'
import { FIELD_TYPE_IDS, MappingSchema, type Mapping } from './schema'

const comp = makeComponent({ name: 'Card', type: 'card' })
const prop = (type: PropertyType, extra: Partial<Property> = {}) => makeProperty({ key: 'field', label: 'Field', type, ...extra })
const node0 = (p: Property, m?: Mapping) => fieldToNodes(resolveField(comp, p, m))[0]
const v = (n: AemNode, k: string) => (n.props[k] as { v: unknown } | undefined)?.v

describe('field type catalog', () => {
  it('has exactly the 14 required AEM field types', () => {
    expect([...FIELD_TYPE_IDS].sort()).toEqual(['checkbox', 'colorfield', 'datepicker', 'fileupload', 'hidden', 'multifield', 'numberfield', 'pathfield', 'richtext', 'select', 'switch', 'tagfield', 'textarea', 'textfield'])
    expect(fieldTypeList).toHaveLength(14)
  })
  it('uses the exact Granite / CQ resource types', () => {
    const F = 'granite/ui/components/coral/foundation/form'
    expect(Object.fromEntries(fieldTypeList.map((f) => [f.id, f.resourceType]))).toEqual({
      textfield: `${F}/textfield`, textarea: `${F}/textarea`, numberfield: `${F}/numberfield`, checkbox: `${F}/checkbox`, switch: `${F}/switch`,
      select: `${F}/select`, multifield: `${F}/multifield`, pathfield: `${F}/pathfield`, colorfield: `${F}/colorfield`, hidden: `${F}/hidden`, datepicker: `${F}/datepicker`,
      fileupload: 'cq/gui/components/authoring/dialog/fileupload',
      tagfield: 'cq/gui/components/coral/common/form/tagfield',
      richtext: 'cq/gui/components/authoring/dialog/richtext',
    })
  })
  it('only references resource types on the allow-list', () => {
    for (const f of fieldTypeList) expect(ALLOWED_RESOURCE_TYPES.has(f.resourceType)).toBe(true)
    expect(RESOURCE_TYPES.container).toBe('granite/ui/components/coral/foundation/container')
  })
})

describe('suggested mapping (property type to field type)', () => {
  it.each([
    ['string', 'textfield'], ['text', 'textarea'], ['richtext', 'richtext'], ['number', 'numberfield'], ['boolean', 'checkbox'], ['enum', 'select'],
    ['image', 'pathfield'], ['link', 'pathfield'], ['color', 'colorfield'], ['date', 'datepicker'], ['list', 'multifield'], ['tags', 'tagfield'], ['hidden', 'hidden'],
  ] as const)('%s -> %s', (type, field) => expect(suggestFieldType({ type })).toBe(field))
  it('covers every property type and every compatible field is a real field type', () => {
    for (const t of PROPERTY_TYPES) {
      expect(COMPATIBLE[t].length).toBeGreaterThan(0)
      for (const f of COMPATIBLE[t]) expect(FIELD_TYPES[f]).toBeTruthy()
    }
  })
  it('matches the spec examples: label, size, variant, image, alt text, optional content, repeated links, rich text', () => {
    expect(suggestFieldType(prop('string'))).toBe('textfield')   // Button label, Alt text
    expect(suggestFieldType(prop('enum'))).toBe('select')        // Button size, variant
    expect(suggestFieldType(prop('image'))).toBe('pathfield')    // Image
    expect(suggestFieldType(prop('boolean'))).toBe('checkbox')   // Optional content
    expect(suggestFieldType(prop('list'))).toBe('multifield')    // Repeated links
    expect(suggestFieldType(prop('richtext'))).toBe('richtext')  // Rich text content
  })
  it('warns when a manual choice does not fit, and never when it does', () => {
    expect(fieldTypeWarning({ type: 'string' }, 'textfield')).toBeNull()
    expect(fieldTypeWarning({ type: 'boolean' }, 'switch')).toBeNull()
    expect(fieldTypeWarning({ type: 'boolean' }, 'datepicker')).toMatch(/usually edited with a Checkbox or Switch/)
  })
})

describe('resolving a field', () => {
  it('exposes every attribute the spec lists', () => {
    const p = prop('enum', { key: 'size', label: 'Size', required: true, description: 'Pick one', group: 'Style', allowedValues: ['s', 'l'], defaultValue: 's' })
    const r = resolveField(comp, p)
    expect(r).toMatchObject({
      fieldType: 'select', label: 'Size', name: './size', resourceType: 'granite/ui/components/coral/foundation/form/select',
      defaultValue: 's', required: true, description: 'Pick one', allowedValues: ['s', 'l'], group: 'Style', manual: false, edited: false,
    })
    expect(r.constraints).toBeTypeOf('object')
  })
  it('follows the property when it changes, unless the user overrode the value', () => {
    const p = prop('string', { label: 'Title' })
    const ms = setOverrides([], comp, p, { label: 'Heading text' })
    expect(resolveField(comp, p, ms[0]).label).toBe('Heading text')
    expect(resolveField(comp, { ...p, label: 'Renamed' }, undefined).label).toBe('Renamed')
    expect(resolveField(comp, p, ms[0]).edited).toBe(true)
  })
  it('converts defaults per field type and says when one cannot be carried over', () => {
    expect(defaultForField('checkbox', 'true')).toBe(true)
    expect(defaultForField('numberfield', '4')).toBe(4)
    expect(defaultForField('numberfield', 'abc')).toBeNull()
    expect(defaultForField('multifield', 'x')).toBeNull()
    const r = resolveField(comp, prop('boolean', { defaultValue: true }), { id: 'm', componentId: comp.id, propertyId: 'x', fieldType: 'numberfield', manual: true, overrides: {}, constraints: {} })
    expect(r.defaultValue).toBeNull()
    expect(r.notes.join(' ')).toMatch(/was not carried over/)
  })
  it('gives sensible default constraints', () => {
    expect(resolveField(comp, prop('image')).constraints.rootPath).toBe('/content/dam')
    expect(resolveField(comp, prop('link')).constraints.rootPath).toBe('/content')
    expect(resolveField(comp, prop('tags')).constraints).toMatchObject({ rootPath: '/content/cq:tags', multiple: true })
    expect(resolveField(comp, prop('richtext')).constraints.useFixedInlineToolbar).toBe(true)
  })
  it('resolves a whole component in property order, applying stored mappings', () => {
    const c = makeComponent({ name: 'X', properties: [prop('string', { key: 'a' }), prop('image', { key: 'b' })] })
    const ms = setFieldType([], c, c.properties[1], 'fileupload').mappings
    const fields = resolveComponent(c, ms)
    expect(fields.map((f) => [f.key, f.fieldType])).toEqual([['a', 'textfield'], ['b', 'fileupload']])
    expect(fields[1]).toMatchObject({ manual: true, edited: true })
  })
})

describe('node structure per field type', () => {
  const base = (n: AemNode, rt: string) => {
    expect(v(n, 'jcr:primaryType')).toBe('nt:unstructured')
    expect(v(n, 'sling:resourceType')).toBe(rt)
    expect(Object.keys(n.props).slice(0, 2)).toEqual(['jcr:primaryType', 'sling:resourceType'])
  }
  it('textfield and textarea', () => {
    const n = node0(prop('string', { key: 'title', label: 'Title', required: true, description: 'Shown above', defaultValue: 'Hi' }), setConstraint([], comp, prop('string'), 'maxlength', 80)[0])
    base(n, RESOURCE_TYPES.textfield)
    expect(n.name).toBe('title')
    expect(n.props).toMatchObject({ name: { v: './title' }, fieldLabel: { v: 'Title' }, fieldDescription: { v: 'Shown above' }, required: { t: 'Boolean', v: true }, value: { v: 'Hi' } })
    const t = node0(prop('text', { key: 'body' }), setConstraint([], comp, prop('text'), 'rows', 6)[0])
    base(t, RESOURCE_TYPES.textarea)
    expect(t.props.rows).toEqual({ t: 'Long', v: 6 })
  })
  it('omits optional attributes instead of emitting empty ones', () => {
    const n = node0(prop('string'))
    expect(Object.keys(n.props)).toEqual(['jcr:primaryType', 'sling:resourceType', 'name', 'fieldLabel'])
  })
  it('numberfield: typed value, limits and a type hint', () => {
    const p = prop('number', { key: 'count', defaultValue: 3 })
    let ms = setConstraint([], comp, p, 'min', 1); ms = setConstraint(ms, comp, p, 'max', 10)
    const n = node0(p, ms[0])
    base(n, RESOURCE_TYPES.numberfield)
    expect(n.props).toMatchObject({ value: { t: 'Long', v: 3 }, min: { v: 1 }, max: { v: 10 }, typeHint: { v: 'Long' } })
    expect(node0(prop('number', { defaultValue: 1.5 })).props.typeHint).toEqual({ t: 'String', v: 'Double' })
  })
  it('checkbox and switch use text, true/false values and a hidden @TypeHint sibling', () => {
    const p = prop('boolean', { key: 'showDescription', label: 'Show description', defaultValue: true })
    const nodes = fieldToNodes(resolveField(comp, p))
    expect(nodes).toHaveLength(2)
    base(nodes[0], RESOURCE_TYPES.checkbox)
    expect(nodes[0].props).toMatchObject({ name: { v: './showDescription' }, text: { v: 'Show description' }, value: { v: 'true' }, uncheckedValue: { v: 'false' }, checked: { t: 'Boolean', v: true } })
    expect(nodes[0].props.fieldLabel).toBeUndefined()
    base(nodes[1], RESOURCE_TYPES.hidden)
    expect(nodes[1]).toMatchObject({ name: 'showDescriptionTypeHint', props: { name: { v: './showDescription@TypeHint' }, value: { v: 'Boolean' } } })
    const sw = fieldToNodes(resolveField(comp, p, setFieldType([], comp, p, 'switch').mappings[0]))
    base(sw[0], RESOURCE_TYPES.switch)
  })
  it('select: an items node with one item per allowed value, default selected, optional gets an empty option', () => {
    const p = prop('enum', { key: 'size', allowedValues: ['small', 'large'], defaultValue: 'large', required: true })
    const n = node0(p)
    base(n, RESOURCE_TYPES.select)
    expect(n.children).toHaveLength(1)
    const items = n.children[0]
    expect(items.name).toBe('items')
    expect(items.children.map((i) => [i.name, v(i, 'text'), v(i, 'value'), v(i, 'selected')])).toEqual([['item0', 'small', 'small', undefined], ['item1', 'large', 'large', true]])
    expect(n.props.emptyOption).toBeUndefined()
    expect(node0(prop('enum', { allowedValues: ['a'] })).props.emptyOption).toEqual({ t: 'Boolean', v: true })
  })
  it('multifield (simple): one repeated field that carries the property name', () => {
    const p = prop('list', { key: 'items', label: 'Items' })
    const n = node0(p)
    base(n, RESOURCE_TYPES.multifield)
    expect(n.props.composite).toBeUndefined()
    expect(n.children).toHaveLength(1)
    expect(n.children[0]).toMatchObject({ name: 'field', props: { name: { v: './items' }, 'sling:resourceType': { v: RESOURCE_TYPES.textfield } } })
  })
  it('multifield picks a pathfield item for link-like names', () => {
    expect(node0(prop('list', { key: 'links', label: 'Links' })).children[0].props['sling:resourceType']).toEqual({ t: 'String', v: RESOURCE_TYPES.pathfield })
  })
  it('multifield (composite): a container field holding one field per subfield', () => {
    const p = prop('list', { key: 'links', label: 'Links' })
    let ms = setMultifield([], comp, p, { composite: true })
    ms = patchSubfield(ms, comp, p, ms[0].multifield!.subfields[1].id, { key: 'url', label: 'URL' })
    const n = node0(p, ms[0])
    expect(v(n, 'composite')).toBe(true)
    const field = n.children[0]
    expect(field).toMatchObject({ name: 'field', props: { name: { v: './links' }, 'sling:resourceType': { v: RESOURCE_TYPES.container } } })
    const items = field.children[0]
    expect(items.name).toBe('items')
    expect(items.children.map((c) => [c.name, v(c, 'name'), v(c, 'fieldLabel'), v(c, 'sling:resourceType')])).toEqual([
      ['label', './label', 'Label', RESOURCE_TYPES.textfield],
      ['url', './url', 'URL', RESOURCE_TYPES.pathfield],
    ])
  })
  it('pathfield with root path, fileupload with its parameters, colorfield, hidden, tagfield, datepicker, richtext', () => {
    const path = node0(prop('image'))
    base(path, RESOURCE_TYPES.pathfield)
    expect(path.props.rootPath).toEqual({ t: 'String', v: '/content/dam' })

    const up = node0(prop('image', { key: 'hero' }), setFieldType([], comp, prop('image', { key: 'hero' }), 'fileupload').mappings[0])
    base(up, RESOURCE_TYPES.fileupload)
    expect(up.props).toMatchObject({
      name: { v: './hero' }, fileNameParameter: { v: './heroFileName' }, fileReferenceParameter: { v: './heroFileReference' },
      autoStart: { v: false }, useHTML5: { v: true }, uploadUrl: { v: '${suffix.path}' }, multiple: { v: false }, class: { v: 'cq-droptarget' },
    })
    expect((up.props.mimeTypes as { v: string[] }).v).toContain('image/png')

    const col = node0(prop('color', { defaultValue: '#fff' }))
    base(col, RESOURCE_TYPES.colorfield)
    expect(col.props).toMatchObject({ value: { v: '#fff' }, showDefaultColors: { v: true }, showProperties: { v: false }, showSwatches: { v: true } })

    const hid = node0(prop('hidden', { defaultValue: 'x' }))
    base(hid, RESOURCE_TYPES.hidden)
    expect(hid.props).toMatchObject({ name: { v: './field' }, value: { v: 'x' } })
    expect(hid.props.fieldLabel).toBeUndefined()

    const tag = node0(prop('tags'))
    base(tag, RESOURCE_TYPES.tagfield)
    expect(tag.props).toMatchObject({ rootPath: { v: '/content/cq:tags' }, multiple: { v: true } })

    const date = node0(prop('date'))
    base(date, RESOURCE_TYPES.datepicker)
    expect(date.props).toMatchObject({ type: { v: 'date' }, displayedFormat: { v: 'YYYY-MM-DD' }, valueFormat: { v: 'YYYY-MM-DD' }, typeHint: { v: 'Date' } })
    const dt = node0(prop('date'), setConstraint([], comp, prop('date'), 'type', 'datetime')[0])
    expect(dt.props.displayedFormat).toEqual({ t: 'String', v: 'YYYY-MM-DD HH:mm' })

    const rte = node0(prop('richtext'))
    base(rte, RESOURCE_TYPES.richtext)
    expect(rte.props.useFixedInlineToolbar).toEqual({ t: 'Boolean', v: true })
  })
  it('only ever emits allowed resource types, for every field type', () => {
    const seen: string[] = []
    const walk = (n: AemNode) => { const rt = v(n, 'sling:resourceType'); if (typeof rt === 'string') seen.push(rt); n.children.forEach(walk) }
    for (const id of FIELD_TYPE_IDS) {
      const p = prop('string', { allowedValues: ['a'] })
      let ms = setFieldType([], comp, p, id).mappings
      if (id === 'multifield') ms = setMultifield(ms, comp, p, { composite: true })
      fieldToNodes(resolveField(comp, p, ms[0])).forEach(walk)
    }
    expect(seen.length).toBeGreaterThan(14)
    for (const rt of seen) expect(ALLOWED_RESOURCE_TYPES.has(rt)).toBe(true)
  })
})

describe('manual changes (mapping edits)', () => {
  const p = prop('string', { key: 'title', label: 'Title' })
  it('lets any suggestion be changed and marks it manual', () => {
    const { mappings } = setFieldType([], comp, p, 'textarea')
    expect(mappings[0]).toMatchObject({ fieldType: 'textarea', manual: true })
    expect(MappingSchema.safeParse(mappings[0]).success).toBe(true)
  })
  it('choosing the suggestion again stores nothing', () => {
    const { mappings } = setFieldType(setFieldType([], comp, p, 'textarea').mappings, comp, p, 'textfield')
    expect(mappings).toEqual([])
  })
  it('reports settings that no longer apply instead of dropping them silently', () => {
    const img = prop('image')
    let ms = setConstraint([], comp, img, 'rootPath', '/content/dam/site')
    const r = setFieldType(ms, comp, img, 'textfield')
    expect(r.dropped).toEqual(['rootPath'])
    expect(r.mappings[0].constraints).toEqual({})
    const list = prop('list')
    ms = setMultifield([], comp, list, { composite: true })
    expect(setFieldType(ms, comp, list, 'textarea').dropped).toContain('multifield items')
  })
  it('drops an override that equals the property again, and a mapping that becomes empty', () => {
    let ms = setOverrides([], comp, p, { label: 'Other', required: true })
    expect(ms[0].overrides).toEqual({ label: 'Other', required: true })
    ms = setOverrides(ms, comp, p, { label: 'Title', required: false })
    expect(ms).toEqual([])
  })
  it('overrides label, name, default, required, description, allowed values and group independently', () => {
    const e = prop('enum', { key: 'size', allowedValues: ['a'] })
    const ms = setOverrides([], comp, e, { label: 'L', name: './custom/size', defaultValue: 'b', required: true, description: 'd', allowedValues: ['a', 'b'], group: 'G' })
    expect(resolveField(comp, e, ms[0])).toMatchObject({ label: 'L', name: './custom/size', defaultValue: 'b', required: true, description: 'd', allowedValues: ['a', 'b'], group: 'G', edited: true })
  })
  it('resets and prunes', () => {
    const ms = setOverrides([], comp, p, { label: 'X' })
    expect(resetMapping(ms, p.id)).toEqual([])
    const c = makeComponent({ name: 'C', properties: [p] })
    const kept = setOverrides([], c, p, { label: 'X' })
    expect(pruneMappings(kept, [c])).toHaveLength(1)
    expect(pruneMappings(kept, [{ ...c, properties: [] }])).toEqual([])
    expect(pruneMappings(kept, [])).toEqual([])
  })
  it('edits composite subfields', () => {
    const l = prop('list', { key: 'links' })
    let ms = setMultifield([], comp, l, { composite: true })
    expect(ms[0].multifield!.subfields.map((s) => s.key)).toEqual(['label', 'link'])
    ms = addSubfield(ms, comp, l)
    expect(ms[0].multifield!.subfields.at(-1)!.key).toBe('field')
    ms = addSubfield(ms, comp, l)
    expect(ms[0].multifield!.subfields.at(-1)!.key).toBe('field2')
    ms = removeSubfield(ms, comp, l, ms[0].multifield!.subfields[0].id)
    expect(ms[0].multifield!.subfields).toHaveLength(3)
  })
})

describe('invalid configurations and missing required values', () => {
  const codes = (r: ReturnType<typeof resolveField>) => validateField(r).map((i) => i.code)
  const mapped = (p: Property, fieldType: Mapping['fieldType'], extra: Partial<Mapping> = {}) => resolveField(comp, p, { id: 'm', componentId: comp.id, propertyId: p.id, fieldType, manual: true, overrides: {}, constraints: {}, ...extra })

  it('a clean field has no issues', () => expect(validateField(resolveField(comp, prop('string')))).toEqual([]))
  it('flags a missing label and an invalid field name', () => {
    expect(codes(resolveField(comp, prop('string', { label: ' ' })))).toContain('label-empty')
    for (const name of ['title', './', './1a', './a b', '/a', './a//b']) {
      const ms = setOverrides([], comp, prop('string'), { name })
      expect(codes(resolveField(comp, prop('string'), ms[0]))).toContain('name-invalid')
    }
    for (const name of ['./title', './cq:tags', './a/b', './my-field_2']) {
      const ms = setOverrides([], comp, prop('string'), { name })
      expect(codes(resolveField(comp, prop('string'), ms[0]))).not.toContain('name-invalid')
    }
  })
  it('flags a select with no choices or a default outside them', () => {
    expect(codes(resolveField(comp, prop('enum')))).toContain('select-no-items')
    expect(codes(resolveField(comp, prop('enum', { allowedValues: ['a'], defaultValue: 'z' })))).toContain('default-not-allowed')
  })
  it('flags required hidden fields, bad limits and unknown settings', () => {
    expect(validateField(resolveField(comp, prop('hidden', { required: true }))).find((i) => i.code === 'required-hidden')?.level).toBe('warning')
    const n = prop('number', { defaultValue: 50 })
    let ms = setConstraint([], comp, n, 'max', 10)
    expect(codes(resolveField(comp, n, ms[0]))).toContain('constraint-range')
    ms = setConstraint([], comp, n, 'min', 5); ms = setConstraint(ms, comp, n, 'max', 1)
    expect(validateField(resolveField(comp, prop('number'), ms[0])).map((i) => i.message).join(' ')).toMatch(/Minimum cannot be greater/)
    expect(codes(resolveField(comp, prop('string'), setConstraint([], comp, prop('string'), 'maxlength', 0)[0]))).toContain('constraint-range')
    expect(codes(resolveField(comp, prop('string'), setConstraint([], comp, prop('string'), 'step', 2)[0]))).toContain('constraint-unknown')
  })
  it('flags a default that does not fit the chosen field type', () => {
    expect(codes(mapped(prop('boolean'), 'checkbox', { overrides: { defaultValue: 'yes' } }))).toContain('default-type')
    expect(codes(mapped(prop('number'), 'numberfield', { overrides: { defaultValue: 'many' } }))).toContain('default-type')
    expect(codes(mapped(prop('date'), 'datepicker', { overrides: { defaultValue: '31/01/2025' } }))).toContain('date-format')
  })
  it('a composite multifield needs valid, unique subfields', () => {
    const l = prop('list', { key: 'links' })
    const none = mapped(l, 'multifield', { multifield: { composite: true, itemFieldType: 'textfield', subfields: [] } })
    expect(codes(none)).toContain('composite-no-subfields')
    const bad = mapped(l, 'multifield', { multifield: { composite: true, itemFieldType: 'textfield', subfields: [
      { id: '1', key: 'a', label: 'A', fieldType: 'textfield', allowedValues: [] },
      { id: '2', key: 'a', label: 'A2', fieldType: 'textfield', allowedValues: [] },
      { id: '3', key: '9x', label: 'X', fieldType: 'textfield', allowedValues: [] },
      { id: '4', key: 'pick', label: 'Pick', fieldType: 'select', allowedValues: [] },
    ] } })
    expect(codes(bad)).toEqual(expect.arrayContaining(['subfield-duplicate', 'subfield-key', 'subfield-select-no-items']))
  })
  it('flags two fields that save to the same name', () => {
    const c = makeComponent({ name: 'X', properties: [prop('string', { key: 'a' }), prop('string', { key: 'b' })] })
    const ms = setOverrides([], c, c.properties[1], { name: './a' })
    const issues = validateFields(resolveComponent(c, ms))
    expect(issues.filter((i) => i.code === 'name-duplicate').map((i) => i.propertyId).sort()).toEqual(c.properties.map((x) => x.id).sort())
  })
  it('surfaces notes about carried-over problems as warnings', () => {
    const r = mapped(prop('boolean', { defaultValue: true }), 'numberfield')
    expect(validateField(r).some((i) => i.code === 'note' && /was not carried over/.test(i.message))).toBe(true)
  })
  it('rejects a stored mapping with an unknown field type', () => {
    expect(MappingSchema.safeParse({ id: 'a', componentId: 'c', propertyId: 'p', fieldType: 'slider' }).success).toBe(false)
  })
})
