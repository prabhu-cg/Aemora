import { describe, expect, it } from 'vitest'
import { makeComponent, makeProperty } from '../components/factory'
import {
  addSection, addTab, buildDialog, containers, excludeField, includeField, locate, moveField, moveItem, moveSection, moveTab,
  parseGroup, placedIds, placeField, pruneDialogs, reconcile, removeSection, removeTab, renameSection, renameTab, resolveDialog, setTitle, validateDialog,
} from './ops'
import { ComponentDialogSchema, DialogStoreSchema } from './schema'

const prop = (key: string, group = '') => makeProperty({ key, label: key, group })
const comp = (...ps: ReturnType<typeof prop>[]) => makeComponent({ name: 'Card', properties: ps })
const names = (c: ReturnType<typeof comp>, ids: string[]) => ids.map((id) => c.properties.find((p) => p.id === id)!.key)
const tabOf = (d: ReturnType<typeof buildDialog>, i = 0) => d.tabs[i]

describe('building a dialog from groups', () => {
  it('parses "Tab › Section" and tolerates a plain >', () => {
    expect(parseGroup('Content › Link')).toEqual({ tab: 'Content', section: 'Link' })
    expect(parseGroup('Content > Link')).toEqual({ tab: 'Content', section: 'Link' })
    expect(parseGroup('Content')).toEqual({ tab: 'Content', section: '' })
    expect(parseGroup('')).toEqual({ tab: '', section: '' })
  })
  it('puts ungrouped properties in a Properties tab', () => {
    const c = comp(prop('a'), prop('b'))
    const d = buildDialog(c)
    expect(d.title).toBe('Card')
    expect(d.tabs.map((t) => t.title)).toEqual(['Properties'])
    expect(tabOf(d).items.map((i) => i.kind)).toEqual(['field', 'field'])
  })
  it('makes tabs and sections in first-use order, keeping field order', () => {
    const c = comp(prop('title', 'Content'), prop('cta', 'Content › Link'), prop('theme', 'Style'), prop('url', 'Content › Link'), prop('alt'))
    const d = buildDialog(c)
    expect(d.tabs.map((t) => t.title)).toEqual(['Content', 'Style', 'Properties'])
    const content = tabOf(d, 0).items
    expect(content.map((i) => i.kind)).toEqual(['field', 'section'])
    const sec = content[1] as Extract<(typeof content)[number], { kind: 'section' }>
    expect(sec.title).toBe('Link')
    expect(names(c, sec.fieldIds)).toEqual(['cta', 'url'])
  })
  it('is deterministic: building twice gives identical ids, so a click and its save agree', () => {
    const c = comp(prop('a', 'T › S'), prop('b'))
    expect(buildDialog(c)).toEqual(buildDialog(c))
    expect(buildDialog(comp())).toEqual(buildDialog(comp()))
  })
  it('places every property exactly once and always has a tab', () => {
    const c = comp(prop('a', 'X'), prop('b', 'X › Y'), prop('c'))
    expect(placedIds(buildDialog(c)).sort()).toEqual(c.properties.map((p) => p.id).sort())
    expect(buildDialog(comp()).tabs).toHaveLength(1)
  })
  it('produces a dialog that validates against the schema', () => {
    expect(ComponentDialogSchema.safeParse(buildDialog(comp(prop('a', 'T › S')))).success).toBe(true)
  })
})

describe('reconciling with property changes', () => {
  it('adds new properties by group (or the first tab) and drops removed ones, touching nothing else', () => {
    const c = comp(prop('a', 'Content'), prop('b', 'Style'))
    let d = addTab(buildDialog(c), 'Extra').dialog
    d = moveField(d, c.properties[1].id, { tabId: d.tabs[2].id })
    const n = prop('n', 'Style')
    const grown = reconcile(d, { properties: [...c.properties, n, prop('z')] })
    expect(locate(grown, n.id)!.tabId).toBe(d.tabs[1].id)
    expect(grown.tabs[0].items.some((i) => i.kind === 'field' && i.id === grown.tabs[0].items.at(-1)!.id)).toBe(true)
    const shrunk = reconcile(d, { properties: [c.properties[0]] })
    expect(placedIds(shrunk)).toEqual([c.properties[0].id])
    expect(shrunk.tabs.map((t) => t.title)).toEqual(['Content', 'Style', 'Extra'])
  })
  it('does not re-add excluded properties, and forgets excluded ids that no longer exist', () => {
    const c = comp(prop('a'), prop('b'))
    const d = excludeField(buildDialog(c), c.properties[1].id)
    expect(placedIds(reconcile(d, c))).toEqual([c.properties[0].id])
    expect(reconcile(d, { properties: [c.properties[0]] }).excluded).toEqual([])
  })
  it('never lists a property twice', () => {
    const c = comp(prop('a'))
    const d = buildDialog(c)
    const dup = { ...d, tabs: [{ ...d.tabs[0], items: [...d.tabs[0].items, ...d.tabs[0].items] }] }
    expect(placedIds(reconcile(dup, c))).toEqual([c.properties[0].id])
  })
  it('resolveDialog builds when nothing is stored and reconciles when it is', () => {
    const c = comp(prop('a'))
    expect(resolveDialog(c).tabs[0].title).toBe('Properties')
    const stored = setTitle(buildDialog(c), 'Mine')
    expect(resolveDialog(comp(prop('a')), stored).title).toBe('Mine')
  })
})

describe('tabs and sections', () => {
  const c = comp(prop('a'), prop('b'), prop('c'))
  it('adds, renames, reorders tabs', () => {
    let { dialog: d, tab } = addTab(buildDialog(c), 'Second')
    expect(d.tabs.map((t) => t.title)).toEqual(['Properties', 'Second'])
    d = renameTab(d, tab.id, 'Behaviour')
    d = moveTab(d, tab.id, -1)
    expect(d.tabs.map((t) => t.title)).toEqual(['Behaviour', 'Properties'])
    expect(moveTab(d, d.tabs[0].id, -1)).toBe(d)
    expect(moveTab(d, d.tabs[1].id, 1)).toBe(d)
  })
  it('removing a tab moves its content to a neighbour and the last tab cannot be removed', () => {
    let d = buildDialog(c)
    const { dialog, tab } = addTab(d, 'Second')
    d = placeField(dialog, c.properties[2].id, { tabId: tab.id })
    const after = removeTab(d, tab.id)
    expect(after.tabs).toHaveLength(1)
    expect(placedIds(after).sort()).toEqual(c.properties.map((p) => p.id).sort())
    expect(removeTab(after, after.tabs[0].id)).toBe(after)
  })
  it('adds, renames and removes sections, keeping fields when a section goes', () => {
    let d = buildDialog(c)
    const t = d.tabs[0].id
    const added = addSection(d, t, 'Link')
    d = renameSection(added.dialog, added.section.id, 'Call to action')
    d = placeField(d, c.properties[1].id, { tabId: t, sectionId: added.section.id })
    d = placeField(d, c.properties[2].id, { tabId: t, sectionId: added.section.id })
    const sec = d.tabs[0].items.find((i) => i.kind === 'section')!
    expect(sec.kind === 'section' && sec.title).toBe('Call to action')
    const gone = removeSection(d, added.section.id)
    expect(gone.tabs[0].items.map((i) => i.kind)).toEqual(['field', 'field', 'field'])
    expect(placedIds(gone).sort()).toEqual(c.properties.map((p) => p.id).sort())
  })
})

describe('moving and excluding fields', () => {
  const c = comp(prop('a'), prop('b'), prop('c'))
  const [a, b, cc] = c.properties.map((p) => p.id)
  it('moves up and down inside a container and stops at the ends', () => {
    const d = buildDialog(c)
    expect(placedIds(moveItem(d, a, 1))).toEqual([b, a, cc])
    expect(placedIds(moveItem(d, cc, -1))).toEqual([a, cc, b])
    expect(moveItem(d, a, -1)).toEqual(d)
    expect(moveItem(d, cc, 1)).toEqual(d)
  })
  it('moves inside a section too', () => {
    let d = buildDialog(c)
    const { dialog, section } = addSection(d, d.tabs[0].id, 'S')
    d = placeField(placeField(dialog, a, { tabId: d.tabs[0].id, sectionId: section.id }), b, { tabId: d.tabs[0].id, sectionId: section.id })
    d = moveItem(d, b, -1)
    const sec = d.tabs[0].items.find((i) => i.kind === 'section')!
    expect(sec.kind === 'section' && sec.fieldIds).toEqual([b, a])
  })
  it('moves a field to another container at an index, removing it from the old place', () => {
    let d = buildDialog(c)
    const { dialog, tab } = addTab(d)
    d = placeField(dialog, cc, { tabId: tab.id })
    d = moveField(d, a, { tabId: tab.id }, 0)
    expect(d.tabs[1].items.map((i) => i.id)).toEqual([a, cc])
    expect(d.tabs[0].items.map((i) => i.id)).toEqual([b])
    expect(locate(d, a)).toEqual({ tabId: tab.id, index: 0 })
    expect(locate(d, 'nope')).toBeNull()
  })
  it('reorders sections among a tab\'s items and across tabs', () => {
    let d = buildDialog(c)
    const t = d.tabs[0].id
    const s1 = addSection(d, t, 'One'); const s2 = addSection(s1.dialog, t, 'Two')
    d = moveSection(s2.dialog, s2.section.id, t, 0)
    expect(d.tabs[0].items[0]).toMatchObject({ kind: 'section', title: 'Two' })
    const withTab = addTab(d)
    d = moveSection(withTab.dialog, s1.section.id, withTab.tab.id)
    expect(d.tabs[1].items).toHaveLength(1)
    expect(d.tabs[0].items.filter((i) => i.kind === 'section')).toHaveLength(1)
  })
  it('excludes a field from the dialog without deleting the property, and can bring it back', () => {
    let d = excludeField(buildDialog(c), b)
    expect(placedIds(d)).toEqual([a, cc])
    expect(d.excluded).toEqual([b])
    expect(excludeField(d, b).excluded).toEqual([b])
    d = includeField(d, b)
    expect(placedIds(d)).toContain(b)
    expect(d.excluded).toEqual([])
  })
  it('lists every place a field can go', () => {
    const base = buildDialog(c)
    const { dialog, section } = addSection(base, base.tabs[0].id, 'Link')
    expect(containers(dialog).map((x) => x.label)).toEqual(['Properties', 'Properties › Link'])
    expect(containers(dialog)[1]).toMatchObject({ sectionId: section.id })
  })
})

describe('dialog validation', () => {
  const c = comp(prop('a'))
  it('passes a clean dialog', () => expect(validateDialog(buildDialog(c))).toEqual([]))
  it('flags empty titles, duplicate tab names, and empty tabs, sections and dialogs', () => {
    let d = buildDialog(c)
    d = setTitle(d, ' ')
    const t2 = addTab(d, 'Properties'); d = t2.dialog
    const t3 = addTab(d, ' '); d = t3.dialog
    const s = addSection(d, d.tabs[0].id, ' '); d = s.dialog
    const codes = validateDialog(d).map((i) => i.code)
    expect(codes).toEqual(expect.arrayContaining(['dialog-title-empty', 'tab-title-duplicate', 'tab-title-empty', 'tab-empty', 'section-title-empty', 'section-empty']))
    expect(validateDialog(buildDialog(comp())).map((i) => i.code)).toContain('no-fields')
  })
})

describe('store', () => {
  it('prunes dialogs of deleted components and validates the shape', () => {
    const d = buildDialog(comp(prop('a')))
    expect(DialogStoreSchema.safeParse({ components: { x: d } }).success).toBe(true)
    expect(DialogStoreSchema.safeParse({}).success).toBe(true)
    expect(Object.keys(pruneDialogs({ components: { x: d, y: d } }, [{ id: 'x' }]).components)).toEqual(['x'])
    expect(ComponentDialogSchema.safeParse({ title: 't', tabs: [] }).success).toBe(false)
  })
})
