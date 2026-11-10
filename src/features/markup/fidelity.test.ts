import { describe, expect, it } from 'vitest'
import { importDesignMd, parseDesignMdText } from '../inputs/designmd/parse'
import type { ComponentDef } from '../components/schema'
import { generateMarkup } from './index'
import { childPath, readDesign, type Layer } from './layers'
import { renderHtl } from './render/render'
import { buildModel, defaultSamples } from './render/samples'
import { buildStructure } from './structure'
import type { MarkupNote } from './types'

const raws = import.meta.glob('../../test/fixtures/designmd-*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const components: ComponentDef[] = Object.entries(raws)
  .filter(([k]) => /designmd-(rayna|chip|message)\.json$/.test(k))
  .flatMap(([, text]) => { const cat = parseDesignMdText(text); return importDesignMd(cat, cat.entries.map((e) => e.id)).components })

/** The sibling-index suffix the plugin adds to same-name layers is dropped, so layers are compared by name path and count. */
const norm = (p: string) => p.replace(/\[\d+\]/g, '')
const counts = (xs: string[]) => { const m = new Map<string, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return m }

/** The layers Figma has in one variant, from the default variant's tree and that variant's differences. */
function layersIn(design: NonNullable<ReturnType<typeof readDesign>>, vp: Record<string, string> | null): string[] {
  let out: string[] = []
  const walk = (l: Layer, path: string, indexed: boolean) => { out.push(path); const kids = l.children ?? []; kids.forEach((c) => walk(c, indexed ? childPath(path, c, kids) : `${path}/${c.name}`, indexed)) }
  walk(design.tree!, design.tree!.name, true)
  if (vp) {
    const d = design.variantDiffs.find((x) => JSON.stringify(x.variantProperties) === JSON.stringify(vp))!
    for (const r of d.removed) out = out.filter((p) => !(p === r || p.startsWith(`${r}/`)))
    for (const a of d.added) walk(a.layer, `${a.parentPath}/${a.layer.name}`, false)
  }
  return out.map(norm)
}

describe('the preview shows the layers Figma has, for every look of a component', () => {
  it('has real components to check', () => {
    expect(components.map((c) => c.name)).toEqual(expect.arrayContaining(['Button / primary', 'Chip', 'Message bubbles', 'Alert', 'Input']))
  })

  it.each(components.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const design = readDesign(c)!
    const m = generateMarkup(c)
    const st = buildStructure(design, c.properties, [] as MarkupNote[])!
    const pathOfClass = new Map(st.nodes.map((n) => [n.el ?? '', n.path]))
    // Layers the design has only in an interaction state are in the markup, hidden by the CSS until that state.
    const stateOnly = st.nodes.filter((n) => n.showIn).map((n) => norm(n.path))
    const states = st.factors.filter((f) => f.isState)
    const defaults = design.defaultVariantProperties ?? {}
    let checked = 0

    for (const vp of [null, ...design.variantDiffs.map((d) => d.variantProperties)]) {
      const full = { ...defaults, ...(vp ?? {}) }
      if (states.some((f) => full[f.name] !== f.default)) continue // interaction states are shown with the State buttons
      const samples = defaultSamples(c.properties)
      for (const p of c.properties) {
        if (p.type === 'boolean') samples[p.key] = true
        const f = st.factors.find((x) => x.key === p.key)
        if (f) samples[p.key] = full[f.name]
      }
      const html = renderHtl(m.files[0].content, buildModel(c.properties, samples))
      const shown: string[] = []
      html.body.querySelectorAll('[class]').forEach((el) => {
        for (const cl of el.className.split(/\s+/)) if (cl.startsWith(`${m.blockClass}__`)) shown.push(norm(pathOfClass.get(cl.slice(m.blockClass.length + 2)) ?? cl))
      })
      const want = layersIn(design, vp).filter((p) => p !== norm(design.tree!.name))
      const sc = counts(shown), wc = counts(want)
      const missing = [...wc].filter(([p, n]) => (sc.get(p) ?? 0) < n).map(([p]) => p)
      const extra = [...sc].filter(([p, n]) => (wc.get(p) ?? 0) < n && !stateOnly.some((x) => p === x || p.startsWith(`${x}/`))).map(([p]) => p)
      expect({ look: vp, missing, extra }).toEqual({ look: vp, missing: [], extra: [] })
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })
})
