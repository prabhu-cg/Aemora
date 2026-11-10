import { describe, expect, it } from 'vitest'
import { generateMarkup } from '../../markup'
import { importDesignMd, parseDesignMdText } from './parse'
import { treeOfVariant } from './resolve'
import { DmComponentSchema } from './schema'

const L = (name: string, extra: object = {}, children: object[] = []) => ({ id: name, name, type: 'FRAME', role: 'container', visible: true, children, ...extra })
const T = (name: string, characters: string) => ({ id: name, name, type: 'TEXT', role: 'text', visible: true, text: { characters } })
const V = (name: string) => ({ id: name, name, type: 'VECTOR', role: 'icon', visible: true, size: { width: 16, height: 16 }, fills: [{ type: 'SOLID', hex: '#000000', alpha: 1 }] })
const inst = (name: string, componentId: string, extra: object = {}) => ({ id: name, name, type: 'INSTANCE', role: 'unknown', visible: true, instanceOf: { componentId, componentName: name }, children: [], ...extra })
const comp = (id: string, name: string, tree: object, extra: object = {}) => ({
  id, key: id, name, isComponentSet: false, pageName: 'P', properties: [], states: [], sizes: [], variants: [{ id, name, variantProperties: {} }],
  defaultVariantId: id, tree, variantDiffs: [], treeTruncated: false, ...extra,
})
const file = (...components: object[]) => JSON.stringify({ schema: 'designmd.components/v1', metadata: { fileName: 'Lib' }, index: { componentCount: components.length }, tokens: {}, components, warnings: [] })
const importOne = (text: string, name: string) => {
  const cat = parseDesignMdText(text)
  return { cat, res: importDesignMd(cat, [cat.entries.find((e) => e.name === name)!.id]) }
}
const tree = (c: { meta: Record<string, unknown> }) => (c.meta.design as { tree: { name: string; children: { name: string; children?: unknown[]; fills?: unknown; layout?: unknown; size?: unknown }[] } }).tree
const names = (l: { name: string; children?: unknown[] }): string[] => [l.name, ...(l.children ?? []).flatMap((c) => names(c as never))]

describe('nested components the export left empty', () => {
  const avatar = comp('a:1', 'Avatar', L('Avatar', { layout: { mode: 'HORIZONTAL', gap: 4 }, fills: [{ type: 'SOLID', hex: '#ccddee', alpha: 1 }], radius: 20 }, [T('Initials', 'JD')]))
  const card = comp('c:1', 'Card', L('Card', {}, [inst('Avatar', 'a:1', { size: { width: 40, height: 40 } }), T('Title', 'Hello')]))

  it('are filled in from the same file, keeping the use’s own size', () => {
    const { res } = importOne(file(card, avatar), 'Card')
    const t = tree(res.components[0])
    const slot = t.children[0]
    expect(names(t)).toEqual(['Card', 'Avatar', 'Initials', 'Title'])
    expect(slot.size).toEqual({ width: 40, height: 40 })
    expect(slot.layout).toEqual({ mode: 'HORIZONTAL', gap: 4 })
    expect(slot.fills).toEqual([{ type: 'SOLID', hex: '#ccddee', alpha: 1 }])
    expect(res.warnings.some((w) => w.where === 'Card' && /1 nested component was filled in from the same file \(Avatar\)/.test(w.message) && /Include layers inside nested instances/.test(w.message))).toBe(true)
  })

  it('then show up in the generated markup', () => {
    const { res } = importOne(file(card, avatar), 'Card')
    const m = generateMarkup(res.components[0])
    expect(m.files[0].content).toMatch(/__avatar[\s\S]*__initials/)
    // The nested text becomes a suggested field, with the design's text as its default.
    expect(m.files[2].content).toContain('@Default(values = "JD")')
  })

  it('leave the file’s own data alone, so another import still sees the empty slot', () => {
    const cat = parseDesignMdText(file(card, avatar))
    importDesignMd(cat, [cat.entries[0].id])
    const raw = DmComponentSchema.parse(cat.components.get('c:1'))
    expect((raw.tree as { children: { children: unknown[] }[] }).children[0].children).toEqual([])
  })

  it('are not touched when the export already carries their insides', () => {
    const own = comp('c:2', 'Card2', L('Card2', {}, [inst('Avatar', 'a:1', { children: [T('Mine', 'XY')] })]))
    const { res } = importOne(file(own, avatar), 'Card2')
    expect(names(tree(res.components[0]))).toEqual(['Card2', 'Avatar', 'Mine'])
    expect(res.warnings.some((w) => /filled in/.test(w.message))).toBe(false)
  })

  it('use the look of the variant the instance points at', () => {
    const badge = comp('b:set', 'Badge', L('Badge', {}, [T('Label', 'New'), L('Dot')]), {
      isComponentSet: true, defaultVariantId: 'b:1',
      variants: [{ id: 'b:1', name: 'tone=a', variantProperties: { tone: 'a' } }, { id: 'b:2', name: 'tone=b', variantProperties: { tone: 'b' } }],
      variantDiffs: [{ variantId: 'b:2', variantProperties: { tone: 'b' }, layers: [{ path: 'Badge/Label', changes: { text: { characters: 'Sale' } } }], added: [{ parentPath: 'Badge', layer: T('Extra', '!') }], removed: ['Badge/Dot'] }],
    })
    const row = comp('r:1', 'Row', L('Row', {}, [inst('Badge', 'b:2', { id: 'i1' }), inst('Badge', 'b:1', { id: 'i2' })]))
    const { res } = importOne(file(row, badge), 'Row')
    const t = tree(res.components[0])
    expect(names(t.children[0] as never)).toEqual(['Badge', 'Label', 'Extra'])
    expect(names(t.children[1] as never)).toEqual(['Badge', 'Label', 'Dot'])
    const m = generateMarkup(res.components[0])
    expect(m.files[2].content).toContain('@Default(values = "Sale")') // the first Label becomes the field
    expect(m.files[0].content).toContain('New') // the second has the same name, so its text stays fixed
  })

  it('keep unique layer ids when the same component is used twice, so each copy keeps its own text', () => {
    const tag = comp('t:1', 'Tag', L('Tag', {}, [T('Name', 'one')]))
    const pair = comp('p:1', 'Pair', L('Pair', {}, [inst('Tag', 't:1', { id: 'i1' }), inst('Tag', 't:1', { id: 'i2' })]))
    const { res } = importOne(file(pair, tag), 'Pair')
    const ids: string[] = []
    const collect = (l: { id?: string; children?: unknown[] }) => { ids.push(l.id as string); (l.children ?? []).forEach((c) => collect(c as never)) }
    collect(tree(res.components[0]) as never)
    expect(new Set(ids).size).toBe(ids.length)
    const html = generateMarkup(res.components[0]).files[0].content
    expect(html).toMatch(/__name" data-sly-test="\$\{model\.name\}">\$\{model\.name\}<\/span>/)
    expect(html).toMatch(/__name-2">one<\/span>/) // the second copy is not tied to the first copy's field
  })

  it('are not filled when they are icons, which have no shape in the export, and say so', () => {
    const icon = comp('i:1', 'icon / check', L('icon / check', {}, [V('Vector')]))
    const btn = comp('b:1', 'Btn', L('Btn', {}, [inst('icon / check', 'i:1'), T('Label', 'Go')]))
    const { res } = importOne(file(btn, icon), 'Btn')
    expect(names(tree(res.components[0]))).toEqual(['Btn', 'icon / check', 'Label'])
    expect(res.warnings.some((w) => w.where === 'Btn' && /^1 icon inside nested components are shown as boxes/.test(w.message))).toBe(true)
  })

  it('say when the file does not hold a nested component', () => {
    const lone = comp('l:1', 'Lone', L('Lone', {}, [inst('Ghost', 'nope:1')]))
    const { res } = importOne(file(lone), 'Lone')
    expect(res.warnings.some((w) => /1 nested component could not be filled in/.test(w.message))).toBe(true)
  })

  it('cannot loop when components contain each other', () => {
    const a = comp('x:1', 'A', L('A', {}, [inst('B', 'y:1'), T('ta', 'a')]))
    const b = comp('y:1', 'B', L('B', {}, [inst('A', 'x:1'), T('tb', 'b')]))
    const { res } = importOne(file(a, b), 'A')
    const n = names(tree(res.components[0]))
    expect(n.length).toBeLessThan(20)
    expect(n.filter((x) => x === 'A')).toHaveLength(2) // the root, and A inside B: B is filled once, then A is not filled again
  })

  it('stops at a size limit instead of growing without end', () => {
    const big = comp('g:1', 'Big', L('Big', {}, Array.from({ length: 150 }, (_, i) => T(`t${i}`, 'x'))))
    const host = comp('h:1', 'Host', L('Host', {}, Array.from({ length: 6 }, (_, i) => inst(`Big${i}`, 'g:1'))))
    const { res } = importOne(file(host, big), 'Host')
    const n = names(tree(res.components[0])).length
    expect(n).toBeLessThan(700)
    expect(res.warnings.some((w) => w.where === 'Host' && /could not be filled in/.test(w.message))).toBe(true)
  })
})

describe('treeOfVariant', () => {
  it('returns a copy of the default tree for the default variant', () => {
    const c = DmComponentSchema.parse(comp('z:1', 'Z', L('Z', {}, [T('t', 'x')])))
    const t = treeOfVariant(c, 'z:1')!
    expect(t).not.toBe(c.tree)
    expect(t).toEqual(c.tree)
  })
})
