import { describe, expect, it } from 'vitest'
import { makeComponent, makeProperty } from '../components/factory'
import { buildDialog } from '../dialog/ops'
import { generateXml } from '../xml/build'
import { checkAem, checkGenerator, parseXml } from '../xml/validate'
import { setOverrides } from './ops'
import { resolveComponent } from './engine'
import { validateFields } from './validate'
import { suggestShowWhen } from './showhide'
import type { Mapping } from './schema'

const make = () => makeComponent({ name: 'Button', properties: [
  makeProperty({ key: 'iconLeft', label: 'icon left', type: 'boolean' }),
  makeProperty({ key: 'caption', label: 'Caption' }),
  makeProperty({ key: 'leftIcon', label: 'left icon', type: 'enum', allowedValues: ['1', '2', '3'] }),
  makeProperty({ key: 'kind', label: 'Kind', type: 'enum', allowedValues: ['plain', 'icon'] }),
  makeProperty({ key: 'iconSize', label: 'Icon size', type: 'enum', allowedValues: ['s', 'l'] }),
] })
const when = (c: ReturnType<typeof make>, ms: Mapping[], key: string, showWhen: { propertyId: string; value?: string } | undefined) =>
  setOverrides(ms, c, c.properties.find((p) => p.key === key)!, { showWhen })
const xmlFor = (c: ReturnType<typeof make>, ms: Mapping[]) => generateXml({ component: c, dialog: buildDialog(c), fields: resolveComponent(c, ms) })

describe('conditional show and hide', () => {
  it('a checkbox controls a field: standard markers on both, no script', () => {
    const c = make()
    const ms = when(c, [], 'leftIcon', { propertyId: c.properties[0].id })
    const xml = xmlFor(c, ms)
    expect(xml).toContain('granite:class="cq-dialog-checkbox-showhide"')
    expect(xml).toContain('cq-dialog-checkbox-showhide-target=".icon-left-showhide-target"')
    expect(xml).toContain('granite:class="hide icon-left-showhide-target"')
    expect(xml).toContain('showhidetargetvalue="true"')
    expect(xml).toMatch(/xmlns:granite=/)
    expect(xml).toMatch(/Conditional fields use Granite UI/)
    const { doc, result } = parseXml(xml)
    expect(result.ok).toBe(true)
    expect(checkAem(doc!).filter((i) => i.level === 'error')).toEqual([])
  })

  it('a select controls fields by value, one controller with two targets', () => {
    const c = make()
    let ms = when(c, [], 'caption', { propertyId: c.properties[3].id, value: 'plain' })
    ms = when(c, ms, 'iconSize', { propertyId: c.properties[3].id, value: 'icon' })
    const xml = xmlFor(c, ms)
    expect(xml).toContain('granite:class="cq-dialog-dropdown-showhide"')
    expect(xml.match(/kind-showhide-target/g)!.length).toBe(3) // one on the controller, one on each target
    expect(xml).toContain('showhidetargetvalue="plain"')
    expect(xml).toContain('showhidetargetvalue="icon"')
    expect(validateFields(resolveComponent(c, ms))).toEqual([])
  })

  it('a conditional field leaves everything else untouched, and no condition means no markers', () => {
    const c = make()
    expect(xmlFor(c, [])).not.toMatch(/showhide|granite:class/)
  })

  it('rejects conditions that cannot work, with a reason for each', () => {
    const c = make()
    const [icon, caption, , kind] = c.properties
    const codes = (ms: Mapping[]) => validateFields(resolveComponent(c, ms)).map((i) => i.code)
    expect(codes(when(c, [], 'leftIcon', { propertyId: c.properties[2].id }))).toContain('show-when-self')
    expect(codes(when(c, [], 'leftIcon', { propertyId: 'gone' }))).toContain('show-when-missing')
    expect(codes(when(c, [], 'leftIcon', { propertyId: caption.id }))).toContain('show-when-type')
    expect(codes(when(c, [], 'leftIcon', { propertyId: kind.id }))).toContain('show-when-value')
    expect(codes(when(c, [], 'leftIcon', { propertyId: kind.id, value: 'nope' }))).toContain('show-when-value')
    // A and B waiting on each other would stay hidden forever.
    let ms = when(c, [], 'iconLeft', { propertyId: kind.id, value: 'icon' })
    ms = when(c, ms, 'kind', { propertyId: icon.id })
    expect(codes(ms)).toContain('show-when-cycle')
  })

  it('writes no markers for a condition that is invalid, and warns when the controller is not in the dialog', () => {
    const c = make()
    const ms = when(c, [], 'leftIcon', { propertyId: c.properties[1].id })
    expect(xmlFor(c, ms)).not.toMatch(/granite:class|granite:data|showhidetargetvalue/)
    const ms2 = when(c, [], 'leftIcon', { propertyId: c.properties[0].id })
    const d = buildDialog(c)
    const out = { ...d, excluded: [c.properties[0].id], tabs: d.tabs.map((t) => ({ ...t, items: t.items.filter((i) => i.id !== c.properties[0].id) })) }
    expect(checkGenerator(c, out, resolveComponent(c, ms2), true).some((i) => /not in the dialog/.test(i.message))).toBe(true)
  })
})

describe('suggested conditions', () => {
  const pair = () => makeComponent({ name: 'Button', properties: [
    makeProperty({ key: 'iconLeft', label: 'show icon left', type: 'boolean' }),
    makeProperty({ key: 'leftIcon', label: 'left icon', type: 'enum', allowedValues: ['1'] }),
    makeProperty({ key: 'iconRight', label: 'Show icon right', type: 'boolean' }),
    makeProperty({ key: 'rightIcon', label: 'Right icon', type: 'enum', allowedValues: ['1'] }),
    makeProperty({ key: 'newTab', label: 'Open in new tab', type: 'boolean' }),
    makeProperty({ key: 'caption', label: 'Caption' }),
  ] })

  it('offers only the obvious pairs: a "Show X" checkbox and a field with the same words in any order', () => {
    const c = pair()
    const s = suggestShowWhen(resolveComponent(c, []))
    expect(s.map((x) => [x.controllerLabel, x.targetLabel])).toEqual([['show icon left', 'left icon'], ['Show icon right', 'Right icon']])
  })

  it('stops suggesting once a field has a condition, and never pairs a checkbox with another checkbox', () => {
    const c = pair()
    const ms = setOverrides([], c, c.properties[1], { showWhen: { propertyId: c.properties[0].id } })
    expect(suggestShowWhen(resolveComponent(c, ms)).map((x) => x.targetLabel)).toEqual(['Right icon'])
    const two = makeComponent({ name: 'X', properties: [makeProperty({ key: 'a', label: 'Show tab', type: 'boolean' }), makeProperty({ key: 'b', label: 'Tab', type: 'boolean' })] })
    expect(suggestShowWhen(resolveComponent(two, []))).toEqual([])
  })
})
