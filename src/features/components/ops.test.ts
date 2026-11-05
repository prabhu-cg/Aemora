import { beforeEach, describe, expect, it } from 'vitest'
import {
  addProperty, addSuggested, coerceDefault, confirmSuggested, dismissUnsupported, groupsOf, insertProperty, moveProperty,
  movePropertyById, parseDefaultInput, patchChild, patchProperty, promoteUnsupported, removeProperty, removeSuggested, renameGroup, uniqueKey,
} from './ops'
import { suggestMissingProperties } from './detect'
import { makeComponent, makeProperty } from './factory'
import { validateComponent, issuesFor } from './validate'
import { db } from '../projects/db'
import { createProject, mutateProject } from '../projects/repo'

const comp = () => makeComponent({
  name: 'Button', type: 'button',
  properties: [
    makeProperty({ key: 'label', label: 'Label', required: true }),
    makeProperty({ key: 'size', label: 'Size', type: 'enum', allowedValues: ['small', 'large'], defaultValue: 'small' }),
    makeProperty({ key: 'link', label: 'Link', type: 'link', group: 'Link' }),
  ],
})

describe('defaults', () => {
  it('coerces to the new type without inventing values', () => {
    expect(coerceDefault('boolean', 'true')).toBe(true)
    expect(coerceDefault('boolean', 'maybe')).toBeNull()
    expect(coerceDefault('number', '3')).toBe(3)
    expect(coerceDefault('number', 'abc')).toBeNull()
    expect(coerceDefault('string', 5)).toBe('5')
    expect(coerceDefault('string', null)).toBeNull()
  })
  it('parses typed input with an error message when it does not fit', () => {
    expect(parseDefaultInput('number', '12.5')).toEqual({ value: 12.5 })
    expect(parseDefaultInput('number', 'x').error).toMatch(/number/)
    expect(parseDefaultInput('boolean', 'TRUE')).toEqual({ value: true })
    expect(parseDefaultInput('boolean', 'yes').error).toMatch(/true or false/)
    expect(parseDefaultInput('string', '')).toEqual({ value: null })
    expect(parseDefaultInput('string', ' hi ')).toEqual({ value: ' hi ' })
  })
})

describe('property edits', () => {
  it('renames, retypes, sets required, description and group, and keeps the other properties untouched', () => {
    const c = comp()
    const id = c.properties[0].id
    const next = patchProperty(c, id, { label: 'Button text', required: false, description: 'Visible text', group: 'Content', type: 'text' })
    expect(next.properties[0]).toMatchObject({ label: 'Button text', required: false, description: 'Visible text', group: 'Content', type: 'text', key: 'label' })
    expect(next.properties.slice(1)).toEqual(c.properties.slice(1))
    expect(c.properties[0].label).toBe('Label') // input not mutated
  })
  it('coerces the default when the type changes and keeps allowed values', () => {
    const c = comp()
    const size = c.properties[1]
    const next = patchProperty(c, size.id, { type: 'boolean' })
    expect(next.properties[1].defaultValue).toBeNull()
    expect(next.properties[1].allowedValues).toEqual(['small', 'large'])
  })
  it('treats editing a suggested property as confirming it', () => {
    const c = makeComponent({ name: 'X', properties: [makeProperty({ key: 'a', origin: { kind: 'figma-rest', suggested: true } })] })
    expect(patchProperty(c, c.properties[0].id, { label: 'A' }).properties[0].origin.suggested).toBe(false)
  })
  it('adds properties with unique keys and removes them with an undo path', () => {
    let c = comp()
    const a = addProperty(c, { label: 'Label' })
    expect(a.property.key).toBe('label2')
    c = a.component
    const r = removeProperty(c, c.properties[1].id)!
    expect(r.component.properties.map((p) => p.key)).toEqual(['label', 'link', 'label2'])
    const back = insertProperty(r.component, r.removed, r.index)
    expect(back.properties.map((p) => p.key)).toEqual(['label', 'size', 'link', 'label2'])
    expect(removeProperty(c, 'nope')).toBeNull()
  })
  it('keeps keys unique when a removed property is restored after a clash', () => {
    const c = comp()
    const r = removeProperty(c, c.properties[0].id)!
    const withClash = addProperty(r.component, { key: 'label', label: 'Label' }).component
    const restored = insertProperty(withClash, r.removed, 0)
    expect(new Set(restored.properties.map((p) => p.key)).size).toBe(restored.properties.length)
  })
  it('reorders by index and by id, ignoring out-of-range moves', () => {
    const c = comp()
    expect(moveProperty(c, 0, 2).properties.map((p) => p.key)).toEqual(['size', 'link', 'label'])
    expect(movePropertyById(c, c.properties[2].id, -1).properties.map((p) => p.key)).toEqual(['label', 'link', 'size'])
    expect(movePropertyById(c, c.properties[0].id, -1)).toBe(c)
    expect(moveProperty(c, 0, 9)).toBe(c)
  })
  it('generates unique keys', () => {
    const c = comp()
    expect(uniqueKey(c, 'label')).toBe('label2')
    expect(uniqueKey(c, 'label', c.properties[0].id)).toBe('label')
  })
})

describe('suggestions', () => {
  it('adds only the chosen template properties and counts them as confirmed', () => {
    const c = comp()
    const picks = suggestMissingProperties(c).filter((p) => ['variant', 'state'].includes(p.key))
    const next = addSuggested(c, picks)
    expect(next.properties.map((p) => p.key)).toEqual(['label', 'size', 'link', 'variant', 'state'])
    expect(next.properties.slice(3).every((p) => !p.origin.suggested)).toBe(true)
    expect(suggestMissingProperties(next).map((p) => p.key)).not.toContain('variant')
  })
  it('confirms or removes imported suggestions', () => {
    const s = (key: string) => makeProperty({ key, origin: { kind: 'figma-rest', suggested: true } })
    const c = makeComponent({ name: 'X', properties: [s('a'), s('b'), makeProperty({ key: 'c' })] })
    expect(confirmSuggested(c, [c.properties[0].id]).properties.map((p) => p.origin.suggested)).toEqual([false, true, false])
    expect(confirmSuggested(c).properties.every((p) => !p.origin.suggested)).toBe(true)
    expect(removeSuggested(c).properties.map((p) => p.key)).toEqual(['c'])
  })
})

describe('unsupported items', () => {
  const withU = () => makeComponent({
    name: 'Image',
    unsupported: [
      { id: 'u1', name: 'Focal point.cropRatio', rawType: 'string', rawValue: '16:9', reason: 'x', origin: { kind: 'json', suggested: false } },
      { id: 'u2', name: 'Icon', rawType: 'INSTANCE_SWAP', reason: 'y', origin: { kind: 'figma-rest', suggested: false } },
    ],
  })
  it('promotes an item into an editable property and removes it from the unsupported list', () => {
    const r = promoteUnsupported(withU(), 'u1')!
    expect(r.property).toMatchObject({ key: 'cropRatio', label: 'cropRatio', defaultValue: '16:9' })
    expect(r.component.unsupported.map((u) => u.id)).toEqual(['u2'])
    expect(r.component.properties).toHaveLength(1)
  })
  it('only dismisses when asked, and leaves other items', () => {
    expect(dismissUnsupported(withU(), 'u2').unsupported.map((u) => u.id)).toEqual(['u1'])
    expect(promoteUnsupported(withU(), 'missing')).toBeNull()
  })
})

describe('groups and children', () => {
  it('lists groups in first-seen order and renames one', () => {
    let c = comp()
    c = patchProperty(c, c.properties[0].id, { group: 'Content' })
    expect(groupsOf(c)).toEqual(['Content', 'Link'])
    c = renameGroup(c, 'Link', 'Behaviour › Link')
    expect(groupsOf(c)).toEqual(['Content', 'Behaviour › Link'])
  })
  it('changes the nested-component approach', () => {
    const c = makeComponent({ name: 'Card', children: [{ name: 'Primary Button', approach: 'expose-properties', exposedKeys: ['label'] }] })
    expect(patchChild(c, 0, { approach: 'reference-component' }).children[0].approach).toBe('reference-component')
  })
})

describe('validation', () => {
  it('passes a clean component', () => expect(validateComponent(comp())).toEqual([]))
  it('flags duplicate, bad and empty keys, empty labels and empty names', () => {
    const c = makeComponent({ name: ' ', properties: [
      makeProperty({ key: 'a', label: 'A' }), makeProperty({ key: 'a', label: 'A2' }),
      makeProperty({ key: '9bad key', label: 'B' }), makeProperty({ key: '', label: 'C' }), makeProperty({ key: 'd', label: ' ' }),
    ] })
    const codes = validateComponent(c).map((i) => i.code)
    expect(codes).toEqual(expect.arrayContaining(['empty-name', 'duplicate-key', 'bad-key', 'empty-key', 'empty-label']))
    expect(issuesFor(validateComponent(c), c.properties[0].id).map((i) => i.code)).toEqual(['duplicate-key'])
  })
  it('flags enum problems and hidden-but-required', () => {
    const c = makeComponent({ name: 'X', properties: [
      makeProperty({ key: 'e1', type: 'enum' }),
      makeProperty({ key: 'e2', type: 'enum', allowedValues: ['a', 'a'] }),
      makeProperty({ key: 'e3', type: 'enum', allowedValues: ['a'], defaultValue: 'z' }),
      makeProperty({ key: 'h', type: 'hidden', required: true }),
    ] })
    const by = (code: string) => validateComponent(c).find((i) => i.code === code)
    expect(by('enum-no-values')?.level).toBe('warning')
    expect(by('duplicate-values')?.level).toBe('warning')
    expect(by('default-not-allowed')?.level).toBe('error')
    expect(by('required-hidden')?.level).toBe('warning')
  })
})

describe('mutateProject', () => {
  beforeEach(async () => { await Promise.all([db.projects.clear(), db.previous.clear()]) })
  it('applies rapid edits in order without losing any (no stale overwrites)', async () => {
    const p = await createProject({ name: 'P' })
    await mutateProject(p.id, (x) => ({ ...x, components: [comp()] }))
    const id = (await db.projects.get(p.id))!.components[0].id
    const apply = (fn: (c: ReturnType<typeof comp>) => ReturnType<typeof comp>) =>
      mutateProject(p.id, (x) => ({ ...x, components: x.components.map((c) => (c.id === id ? fn(c) : c)) }))
    await Promise.all([
      apply((c) => ({ ...c, name: 'Renamed' })),
      apply((c) => addProperty(c, { label: 'Extra' }).component),
      apply((c) => movePropertyById(c, c.properties[2].id, -1)),
    ])
    const saved = (await db.projects.get(p.id))!.components[0]
    expect(saved.name).toBe('Renamed')
    expect(saved.properties).toHaveLength(4)
  })
  it('rejects a change that makes the project invalid and leaves the stored one intact', async () => {
    const p = await createProject({ name: 'P' })
    await expect(mutateProject(p.id, (x) => ({ ...x, name: '' }))).rejects.toThrow()
    expect((await db.projects.get(p.id))!.name).toBe('P')
    await expect(mutateProject('missing', (x) => x)).rejects.toThrow(/no longer exists/)
  })
})
