import { describe, expect, it } from 'vitest'
import { makeComponent, makeProperty } from '../components/factory'
import { validateComponent } from '../components/validate'
import { buildDialog } from '../dialog/ops'
import { validateDialog } from '../dialog/ops'
import { fixDialog, fixProperties } from './autofix'

describe('fixProperties', () => {
  it('repairs keys, labels, repeats, defaults and hidden-required, and leaves nothing for the design checks', () => {
    const c = makeComponent({ name: 'Card', properties: [
      makeProperty({ key: '', label: 'Icon position' }),
      makeProperty({ key: 'bad key!', label: 'Odd' }),
      makeProperty({ key: 'title', label: 'Title' }),
      makeProperty({ key: 'title', label: 'Title again' }),
      makeProperty({ key: 'subTitle', label: '' }),
      makeProperty({ key: 'tone', label: 'Tone', type: 'enum', allowedValues: ['a', 'b', 'a'], defaultValue: 'zzz' }),
      makeProperty({ key: 'secret', label: 'Secret', type: 'hidden', required: true }),
    ] })
    c.properties[4] = { ...c.properties[4], label: '' } // the factory fills in a label, so blank it again
    const { component, notes } = fixProperties(c)
    expect(component.properties.map((p) => p.key)).toEqual(['iconPosition', 'badKey', 'title', 'title2', 'subTitle', 'tone', 'secret'])
    expect(component.properties[4].label).toBe('Sub Title')
    expect(component.properties[5]).toMatchObject({ allowedValues: ['a', 'b'], defaultValue: null })
    expect(component.properties[6].required).toBe(false)
    expect(notes.length).toBe(7)
    expect(validateComponent(component).filter((i) => i.level === 'error')).toEqual([])
    expect(validateComponent(component)).toEqual([])
  })

  it('does not invent choices for an empty select, and changes nothing that is fine', () => {
    const c = makeComponent({ name: 'Card', properties: [makeProperty({ key: 'tone', label: 'Tone', type: 'enum', allowedValues: [] }), makeProperty({ key: 'a', label: 'A' })] })
    const r = fixProperties(c)
    expect(r.notes).toEqual([])
    expect(r.component).toEqual(c)
  })

  it('keeps ids and every other value, and is idempotent', () => {
    const c = makeComponent({ name: 'Card', properties: [makeProperty({ key: 'x y', label: 'X', description: 'keep me' })] })
    const once = fixProperties(c)
    expect(once.component.properties[0]).toMatchObject({ id: c.properties[0].id, description: 'keep me', label: 'X' })
    expect(fixProperties(once.component).notes).toEqual([])
  })
})

describe('fixDialog', () => {
  it('titles things, drops empty tabs and sections, and never discards a field', () => {
    const c = makeComponent({ name: 'Card', properties: [makeProperty({ key: 'a', label: 'A' }), makeProperty({ key: 'b', label: 'B', group: 'More' })] })
    const d = buildDialog(c)
    const messy = { ...d, title: ' ', tabs: [...d.tabs.map((t) => ({ ...t, title: '' })), { id: 'empty', title: 'Nothing', items: [] }, { id: 'e2', title: 'Sec', items: [{ kind: 'section' as const, id: 's1', title: '', fieldIds: [] }] }] }
    const before = messy.tabs.flatMap((t) => t.items).length
    const { dialog, notes } = fixDialog(c, messy)
    expect(dialog.title).toBe('Card')
    expect(dialog.tabs.every((t) => t.title.trim())).toBe(true)
    expect(dialog.tabs.find((t) => t.id === 'empty')).toBeUndefined()
    expect(notes.length).toBeGreaterThan(2)
    expect(validateDialog(dialog).filter((i) => i.level === 'error')).toEqual([])
    expect(dialog.tabs.flatMap((t) => t.items).length).toBeLessThanOrEqual(before)
    expect(JSON.stringify(dialog)).toContain(c.properties[0].id)
  })

  it('keeps the last tab even when it is empty', () => {
    const c = makeComponent({ name: 'Card', properties: [] })
    const { dialog } = fixDialog(c, { ...buildDialog(c), tabs: [{ id: 't', title: 'Only', items: [] }] })
    expect(dialog.tabs).toHaveLength(1)
  })
})
