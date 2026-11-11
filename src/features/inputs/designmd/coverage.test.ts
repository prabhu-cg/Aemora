import { describe, expect, it } from 'vitest'
import { scanCoverage } from './coverage'

describe('what the export holds that is not drawn', () => {
  it('names known gaps in plain words and counts layers once', () => {
    const tree = { children: [
      { name: 'a', type: 'FRAME', cornerSmoothing: 0.6, fills: [{ type: 'IMAGE', visible: true }], children: [] },
      { name: 'b', type: 'TEXT', text: { alignVertical: 'CENTER', fontSize: 12 }, fills: [{ type: 'GRADIENT_LINEAR' }, { type: 'GRADIENT_ANGULAR', stops: [] }, { type: 'GRADIENT_LINEAR', stops: [{ position: 0 }] }] },
    ] }
    const c = scanCoverage([tree])
    expect(c.notApplied.map((n) => n.feature).join('|')).toMatch(/squircle/)
    expect(c.notApplied.find((n) => /pictures/.test(n.feature))?.layers).toBe(1)
    // The linear gradient with its stops is drawn; the other two are not.
    expect(c.notApplied.find((n) => /gradients/.test(n.feature))?.layers).toBe(1)
    expect(c.unknown).toEqual([])
  })
  it('reports a field it has never heard of, and ignores hidden fills and fields it reads', () => {
    const c = scanCoverage([{ name: 'x', type: 'FRAME', hologram: 1, fills: [{ type: 'IMAGE', visible: false }], size: { width: 1, height: 1 }, children: [{ name: 'y', type: 'FRAME', hologram: 2 }] }])
    expect(c.unknown).toEqual([{ field: 'hologram', layers: 2 }])
    expect(c.notApplied).toEqual([])
  })
})
