import { describe, expect, it } from 'vitest'
import { makeComponent, makeProperty } from '../components/factory'
import type { Property, PropertyType } from '../components/schema'
import { resolveField, type ResolvedField } from '../mapping/engine'
import { hasEmptyOption } from '../mapping/nodes'
import { setConstraint, setFieldType, setMultifield, patchSubfield } from '../mapping/ops'
import { coerceValue, initialValue, isEmpty, toSaved, validateValue, type Value } from './values'
import { samplePaths } from './samples'

const comp = makeComponent({ name: 'C' })
const field = (type: PropertyType, extra: Partial<Property> = {}, edit?: (p: Property) => ReturnType<typeof setConstraint>) => {
  const p = makeProperty({ key: 'f', label: 'F', type, ...extra })
  return resolveField(comp, p, edit?.(p)[0])
}
const constrained = (type: PropertyType, key: string, value: string | number | boolean, extra: Partial<Property> = {}) =>
  field(type, extra, (p) => setConstraint([], comp, p, key, value))

describe('initial values', () => {
  it('starts from the configured default', () => {
    expect(initialValue(field('string', { defaultValue: 'Hi' }))).toBe('Hi')
    expect(initialValue(field('boolean', { defaultValue: true }))).toBe(true)
    expect(initialValue(field('boolean'))).toBe(false)
    expect(initialValue(field('number', { defaultValue: 3 }))).toBe('3')
    expect(initialValue(field('number'))).toBe('')
    expect(initialValue(field('list'))).toEqual([])
    expect(initialValue(field('tags'))).toEqual([])
  })
  it('a select shows its default, else an empty choice when optional, else its first item', () => {
    expect(initialValue(field('enum', { allowedValues: ['a', 'b'], defaultValue: 'b' }))).toBe('b')
    expect(initialValue(field('enum', { allowedValues: ['a', 'b'] }))).toBe('')
    expect(initialValue(field('enum', { allowedValues: ['a', 'b'], required: true }))).toBe('a')
    expect(initialValue(constrained('enum', 'multiple', true, { allowedValues: ['a'] }))).toEqual([])
  })
  it('uses the same empty-choice rule as the generated dialog', () => {
    expect(hasEmptyOption(field('enum', { allowedValues: ['a'] }))).toBe(true)
    expect(hasEmptyOption(field('enum', { allowedValues: ['a'], required: true }))).toBe(false)
    expect(hasEmptyOption(field('enum', { allowedValues: ['a'], defaultValue: 'a' }))).toBe(false)
    expect(hasEmptyOption(constrained('enum', 'emptyOption', true, { allowedValues: ['a'], required: true }))).toBe(true)
  })
  it('repairs a stored value whose field type changed', () => {
    const text = field('string')
    expect(coerceValue(text, true as Value)).toBe('')
    expect(coerceValue(field('boolean'), 'x' as Value)).toBe(false)
    expect(coerceValue(field('tags'), 'x' as Value)).toEqual([])
    expect(coerceValue(field('list'), ['x'] as Value)).toEqual([])
    expect(coerceValue(text, undefined)).toBe('')
    expect(coerceValue(text, 'kept')).toBe('kept')
  })
})

describe('simulated validation', () => {
  const v = (f: ResolvedField, value: Value) => validateValue(f, value)
  it('required: empty text, empty list, unchecked box', () => {
    expect(v(field('string', { required: true }), '  ')).toBe('This field is required.')
    expect(v(field('string', { required: true }), 'x')).toBeNull()
    expect(v(field('tags', { required: true }), [])).toBe('This field is required.')
    expect(v(field('boolean', { required: true }), false)).toBe('This must be switched on.')
    expect(v(field('boolean', { required: true }), true)).toBeNull()
    expect(v(field('string'), '')).toBeNull()
  })
  it('maximum length', () => {
    const f = constrained('string', 'maxlength', 3)
    expect(v(f, 'abcd')).toBe('Use at most 3 characters.')
    expect(v(f, 'abc')).toBeNull()
  })
  it('number: type, range and step', () => {
    let f = field('number', {}, (p) => setConstraint(setConstraint(setConstraint([], comp, p, 'min', 0), comp, p, 'max', 10), comp, p, 'step', 2))
    expect(v(f, '4')).toBeNull()
    expect(v(f, '3')).toBe('Use steps of 2.')
    expect(v(f, '-2')).toBe('Enter 0 or more.')
    expect(v(f, '12')).toBe('Enter 10 or less.')
    expect(v(f, 'abc')).toBe('Enter a number.')
    f = constrained('number', 'step', 0.5)
    expect(v(f, '1.5')).toBeNull()
    expect(v(f, '1.2')).toBe('Use steps of 0.5.')
  })
  it('hidden fields are never validated', () => expect(v(field('hidden', { required: true }), '')).toBeNull())
  it('isEmpty understands each shape', () => {
    expect(isEmpty(field('string'), '')).toBe(true)
    expect(isEmpty(field('boolean'), false)).toBe(true)
    expect(isEmpty(field('boolean'), true)).toBe(false)
    expect(isEmpty(field('tags'), ['a'])).toBe(false)
  })
})

describe('values the dialog would save', () => {
  it('uses field names and the types a type hint would store', () => {
    const num = field('number', { key: 'count' })
    const flag = field('boolean', { key: 'flag' })
    const txt = field('string', { key: 'title' })
    const tags = field('tags', { key: 'tags' })
    const hid = field('hidden', { key: 'secret', defaultValue: 'abc' })
    const empty = field('string', { key: 'blank' })
    const fields = [txt, num, flag, tags, hid, empty]
    const values = new Map<string, Value>([[txt.propertyId, 'Hi'], [num.propertyId, '4'], [flag.propertyId, true], [tags.propertyId, ['a', 'b']]])
    expect(toSaved(fields, values)).toEqual({ './title': 'Hi', './count': 4, './flag': true, './tags': ['a', 'b'], './secret': 'abc' })
  })
  it('saves a simple multifield as a list of values and a composite one as a list of objects', () => {
    const p = makeProperty({ key: 'links', label: 'Links', type: 'list' })
    const simple = resolveField(comp, p)
    expect(toSaved([simple], new Map([[p.id, [{ value: 'a' }, { value: 'b' }] as Value]]))).toEqual({ './links': ['a', 'b'] })
    let ms = setMultifield([], comp, p, { composite: true })
    ms = patchSubfield(ms, comp, p, ms[0].multifield!.subfields[1].id, { fieldType: 'checkbox', key: 'newTab' })
    const composite = resolveField(comp, p, ms[0])
    expect(toSaved([composite], new Map([[p.id, [{ label: 'Home', newTab: true }, { label: 'Docs', newTab: false }] as Value]]))).toEqual({
      './links': [{ label: 'Home', newTab: true }, { label: 'Docs', newTab: false }],
    })
  })
  it('switch and checkbox always save true or false', () => {
    const p = makeProperty({ key: 'on', label: 'On', type: 'boolean' })
    const sw = resolveField(comp, p, setFieldType([], comp, p, 'switch').mappings[0])
    expect(toSaved([sw], new Map())).toEqual({ './on': false })
  })
})

describe('sample paths', () => {
  it('are clearly under the configured root', () => {
    expect(samplePaths('/content').every((p) => p.startsWith('/content/'))).toBe(true)
    expect(samplePaths('/content/dam').every((p) => p.startsWith('/content/dam/'))).toBe(true)
    expect(samplePaths('/content/cq:tags').every((p) => p.startsWith('/content/cq:tags/'))).toBe(true)
    expect(samplePaths('').length).toBeGreaterThan(0)
  })
})
