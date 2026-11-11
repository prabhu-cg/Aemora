import { describe, expect, it } from 'vitest'
import { convertDiffVectors, convertVectors, graphicOfVector, inferPositions, MAX_PATH_CHARS, prepareLayers } from './vectors'

const shape = { windingRule: 'EVENODD', data: 'M0 0 L1 1 Z' }

describe('DesignMD vector shapes', () => {
  it('reads vector fill and stroke paths as a graphic', () => {
    expect(graphicOfVector({ fill: [shape], stroke: [] })).toEqual({ fills: [{ d: 'M0 0 L1 1 Z', rule: 'EVENODD' }] })
    expect(graphicOfVector({ fill: [], stroke: [{ data: 'M0 0 L2 2 Z' }] })?.strokes).toEqual([{ d: 'M0 0 L2 2 Z', rule: 'NONZERO' }])
  })
  it('keeps nothing for empty or oversized shapes', () => {
    expect(graphicOfVector({ fill: [], stroke: [] })).toBeUndefined()
    expect(graphicOfVector({ fill: [{ data: 'M' + '0 '.repeat(MAX_PATH_CHARS) }], stroke: [] })).toBeUndefined()
  })
  it('renames vector to graphic through the tree and variant diffs, and can be repeated', () => {
    const tree = { children: [{ vector: { fill: [shape], stroke: [] }, children: [] }] }
    const diffs = [{ layers: [{ path: 'a', changes: { vector: { fill: [shape], stroke: [] } } }], added: [{ layer: { vector: { fill: [shape], stroke: [] } } }] }]
    expect(convertVectors(tree)).toBe(0)
    expect(convertDiffVectors(diffs)).toBe(0)
    expect(JSON.stringify([tree, diffs])).not.toContain('"vector"')
    expect((tree.children[0] as { graphic?: unknown }).graphic).toBeTruthy()
    expect(convertVectors(tree)).toBe(0)
  })
})

describe('inferred positions', () => {
  it('centres a lone layer and puts a full-size one at 0, 0', () => {
    const tree = { type: 'FRAME', size: { width: 24, height: 24 }, children: [{ type: 'INSTANCE', size: { width: 12, height: 10 } }] }
    expect(inferPositions(tree)).toBe(1)
    expect((tree.children[0] as { position?: unknown }).position).toEqual({ x: 6, y: 7 })
    const full = { type: 'FRAME', size: { width: 6, height: 66 }, children: [{ type: 'RECTANGLE', size: { width: 6, height: 66 } }, { type: 'RECTANGLE', size: { width: 2, height: 2 } }] }
    inferPositions(full)
    expect((full.children[0] as { position?: unknown }).position).toEqual({ x: 0, y: 0 })
    expect((full.children[1] as { position?: unknown }).position).toBeUndefined()
  })
  it('leaves auto layout frames alone', () => {
    const tree = { type: 'FRAME', layout: { mode: 'HORIZONTAL' }, size: { width: 24, height: 24 }, children: [{ type: 'INSTANCE', size: { width: 12, height: 12 } }] }
    expect(inferPositions(tree)).toBe(0)
  })
})

describe('placement, rotation and added layer positions', () => {
  it('turns placement into sizing and fill, and rotation into a transform', () => {
    const tree = {
      name: 'Root', type: 'COMPONENT', layout: { mode: 'HORIZONTAL', sizingH: 'FIXED', sizingV: 'FIXED' },
      children: [
        { name: 'Text', type: 'TEXT', placement: { positioning: 'AUTO', grow: 1, align: 'STRETCH', sizingH: 'HUG', sizingV: 'HUG' } },
        { name: 'Line', type: 'INSTANCE', rotation: 90, placement: { positioning: 'ABSOLUTE', grow: 0, align: 'INHERIT', sizingH: 'FIXED', sizingV: 'FIXED' } },
      ],
    }
    prepareLayers(tree, [])
    const [text, line] = tree.children as { sizing?: unknown; layoutPositioning?: string; transform?: number[]; placement?: unknown; rotation?: unknown }[]
    expect(text.sizing).toEqual({ h: 'FILL', v: 'FILL' })
    expect(line.layoutPositioning).toBe('ABSOLUTE')
    expect(line.transform).toEqual([0, -1, 1, 0].map((n) => n + 0))
    expect(text.placement).toBeUndefined()
    expect(line.rotation).toBeUndefined()
  })
  it('puts a layer a variant adds where the one it removes was', () => {
    const tree = { name: 'Alert', type: 'COMPONENT', children: [{ name: 'Icon', type: 'FRAME' }, { name: 'Text', type: 'FRAME' }, { name: 'Close', type: 'FRAME' }] }
    const diffs = [{ layers: [], removed: ['Alert/Text'], added: [{ parentPath: 'Alert', layer: { name: 'Content', type: 'FRAME' } }] }]
    prepareLayers(tree, diffs)
    expect((diffs[0].added[0] as { index?: number }).index).toBe(1)
  })
})

describe('layers added in several looks', () => {
  it('gives each added layer its own place, one after another, starting where the removed ones were', () => {
    const tree = { name: 'Tab', type: 'COMPONENT', children: [{ name: 'Content', type: 'FRAME' }, { name: 'Border', type: 'FRAME' }] }
    const diffs = [{ layers: [], removed: ['Tab/Content', 'Tab/Border'], added: ['Icon', 'Label', 'Badge'].map((n) => ({ parentPath: 'Tab', layer: { name: n, type: 'FRAME' } })) }]
    prepareLayers(tree, diffs)
    expect(diffs[0].added.map((a) => (a as { index?: number }).index)).toEqual([0, 1, 2])
  })
})
