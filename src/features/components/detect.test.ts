import { describe, expect, it } from 'vitest'
import { classifyComponent, inferPropertyType, normalizeTypeAlias, suggestMissingProperties, toKey } from './detect'
import { makeComponent, makeProperty } from './factory'

describe('toKey', () => {
  it('camel-cases display names', () => {
    expect(toKey('Icon position')).toBe('iconPosition')
    expect(toKey('Show-description')).toBe('showDescription')
    expect(toKey('CTA Link')).toBe('ctaLink')
  })
  it('strips Figma property id suffixes and fixes leading digits', () => {
    expect(toKey('Label#12:0')).toBe('label')
    expect(toKey('3 column')).toMatch(/^[a-z]/)
    expect(toKey('###')).toBe('property')
  })
})

describe('inferPropertyType', () => {
  it.each([
    ['Label', 'string'], ['Heading', 'string'], ['Alt text', 'string'], ['Description', 'text'],
    ['Size', 'enum'], ['Variant', 'enum'], ['Image', 'image'], ['Icon reference', 'image'],
    ['Link', 'link'], ['CTA URL', 'link'], ['Show description', 'boolean'], ['Opens in new tab', 'boolean'],
    ['Background color', 'color'], ['Publish date', 'date'], ['Tags', 'tags'], ['Links', 'list'], ['Column count', 'number'],
    ['Rich text', 'richtext'],
  ])('%s -> %s', (name, type) => expect(inferPropertyType(name)).toBe(type))
  it('uses sample values over names', () => {
    expect(inferPropertyType('Whatever', true)).toBe('boolean')
    expect(inferPropertyType('Whatever', 3)).toBe('number')
  })
  it('falls back to string', () => expect(inferPropertyType('Zorp')).toBe('string'))
})

describe('normalizeTypeAlias', () => {
  it('maps aliases and rejects unknowns', () => {
    expect(normalizeTypeAlias('select')).toBe('enum')
    expect(normalizeTypeAlias('TextArea')).toBe('text')
    expect(normalizeTypeAlias('multifield')).toBe('list')
    expect(normalizeTypeAlias('slider')).toBeNull()
  })
})

describe('classifyComponent', () => {
  it.each([
    ['Button', 'button'], ['Primary CTA', 'button'], ['Card', 'card'], ['TeaserCard', 'card'], ['Hero Image', 'image'],
    ['Text', 'text'], ['Heading', 'text'], ['Container', 'container'], ['Grid Layout', 'container'], ['Accordion', 'custom'],
  ])('%s -> %s', (name, type) => expect(classifyComponent(name)).toBe(type))
  it('falls back to the property signature', () => {
    expect(classifyComponent('Thing', ['Label', 'Link'])).toBe('button')
    expect(classifyComponent('Thing', ['Image', 'Heading', 'CTA'])).toBe('card')
    expect(classifyComponent('Thing', ['Gap'])).toBe('container')
  })
})

describe('suggestMissingProperties', () => {
  it('suggests only template properties the component lacks, flagged as suggested', () => {
    const c = makeComponent({ name: 'Button', type: 'button', properties: [makeProperty({ key: 'label' }), makeProperty({ key: 'size', type: 'enum' })] })
    const s = suggestMissingProperties(c)
    expect(s.map((p) => p.key)).not.toContain('label')
    expect(s.map((p) => p.key)).toEqual(expect.arrayContaining(['variant', 'state', 'iconPosition', 'iconReference', 'accessibilityLabel', 'link']))
    expect(s.every((p) => p.origin.suggested && p.origin.kind === 'template')).toBe(true)
  })
  it('suggests nothing for custom components', () => {
    expect(suggestMissingProperties(makeComponent({ name: 'X' }))).toEqual([])
  })
})
