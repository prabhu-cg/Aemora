// Throwaway measuring page. Not part of the app and not committed.
import { importDesignMd, parseDesignMdText } from './features/inputs/designmd/parse'
import { generateMarkup } from './features/markup'
import { toKey } from './features/components/detect'
import { readDesign } from './features/markup/layers'
import { buildStructure } from './features/markup/structure'
import { renderHtl } from './features/markup/render/render'
import { buildModel, defaultSamples } from './features/markup/render/samples'
import { paintFrame } from './features/preview/paintFrame'

const frame = document.createElement('iframe')
frame.style.cssText = 'width:1400px;height:2400px;border:0'
document.body.appendChild(frame)

type Size = { width: number; height: number }
;(window as unknown as { __measure: (text: string, pinText: boolean) => unknown }).__measure = (text: string, pinText: boolean) => {
  const cat = parseDesignMdText(text)
  const out: unknown[] = []
  const res = importDesignMd(cat, cat.entries.map((e) => e.id))
  for (const c of res.components) {
    const design = readDesign(c)
    if (!design?.tree) continue
    const m = generateMarkup(c)
    const st = buildStructure(design, c.properties, [])!
    const states = st.factors.filter((f) => f.isState)
    const defaults = design.defaultVariantProperties ?? {}
    const doc = frame.contentDocument!
    for (const vp of [null, ...design.variantDiffs.map((d) => d.variantProperties)]) {
      const full = { ...defaults, ...(vp ?? {}) }
      if (states.some((f) => full[f.name] !== f.default)) continue
      const diff = vp ? design.variantDiffs.find((d) => JSON.stringify(d.variantProperties) === JSON.stringify(vp)) : undefined
      const samples = defaultSamples(c.properties)
      for (const p of c.properties) {
        if (p.type === 'boolean') samples[p.key] = true
        const f = st.factors.find((x) => x.key === p.key)
        if (f) samples[p.key] = full[f.name]
      }
      // A yes/no property is on when the layer it switches is visible in this variant of the design.
      const shows = new Map<string, boolean>()
      for (const n of st.nodes) {
        const ref = n.layer.propertyRefs?.visible
        if (!ref) continue
        const v = diff?.layers.find((l) => l.path === n.path)?.changes.visible ?? n.layer.visible
        const key = toKey(ref)
        shows.set(key, (shows.get(key) ?? false) || v !== false)
      }
      for (const [key, on] of shows) if (c.properties.some((p) => p.key === key && p.type === 'boolean')) samples[key] = on
      const body = renderHtl(m.files[0].content, buildModel(c.properties, samples)).body
      paintFrame(doc, { css: m.files[1].content, body, state: 'default', bg: 'light', zoom: '1' })
      const expectedSize = (path: string, layer: { size?: Size }): Size | undefined => diff?.layers.find((l) => l.path === path)?.changes.size ?? layer.size
      const seenEl = new Set<string>()
      for (const n of st.nodes) {
        const cls = n.el ? `${m.blockClass}__${n.el}` : m.blockClass
        const el = [...doc.getElementsByClassName(cls)].find((e) => !seenEl.has(`${cls}|${[...doc.getElementsByClassName(cls)].indexOf(e)}`)) as HTMLElement | undefined
        if (!el || !n.layer.size) continue
        const exp = expectedSize(n.path, n.layer)
        if (!exp) continue
        if (pinText && n.layer.type === 'TEXT' && doc.defaultView!.getComputedStyle(el).display !== 'none') { el.style.display = 'inline-block'; el.style.flex = 'none'; el.style.width = `${exp.width}px`; el.style.height = `${exp.height}px`; el.style.overflow = 'hidden' }
      }
      const hidden: string[] = []
      for (const n of st.nodes) {
        const cls = n.el ? `${m.blockClass}__${n.el}` : m.blockClass
        const el = doc.getElementsByClassName(cls)[0] as HTMLElement | undefined
        const exp = n.layer.size && expectedSize(n.path, n.layer)
        const vis = diff?.layers.find((l) => l.path === n.path)?.changes.visible ?? n.layer.visible
        if ((vis === false && !n.layer.propertyRefs?.visible) || n.showIn?.length) hidden.push(n.path)
        if (!el || !exp || hidden.some((h) => n.path === h || n.path.startsWith(`${h}/`))) continue
        const r = el.getBoundingClientRect()
        out.push({
          comp: c.name, variant: vp, path: n.path, type: n.layer.type, role: n.layer.role,
          exp: [exp.width, exp.height], act: [Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10],
          parent: n.parent ? { mode: n.parent.layer.layout?.mode ?? 'NONE', type: n.parent.layer.type } : null,
          self: n.layer.layout ? { mode: n.layer.layout.mode, h: n.layer.layout.sizingH, v: n.layer.layout.sizingV, pa: n.layer.layout.primaryAlign, ca: n.layer.layout.counterAlign, wrap: n.layer.layout.wrap } : null,
          kids: n.children.length,
        })
      }
    }
  }
  return out
}
;(window as unknown as { __ready: boolean }).__ready = true

;(window as unknown as { __inspect: (text: string, compName: string, pathPart: string) => unknown }).__inspect = (text: string, compName: string, pathPart: string) => {
  const cat = parseDesignMdText(text)
  const res = importDesignMd(cat, cat.entries.filter((e) => e.name === compName).map((e) => e.id))
  const c = res.components[0]
  const design = readDesign(c)!
  const m = generateMarkup(c)
  const st = buildStructure(design, c.properties, [])!
  const samples = defaultSamples(c.properties)
  for (const p of c.properties) if (p.type === 'boolean') samples[p.key] = true
  const body = renderHtl(m.files[0].content, buildModel(c.properties, samples)).body
  const doc = frame.contentDocument!
  paintFrame(doc, { css: m.files[1].content, body, state: 'default', bg: 'light', zoom: '1' })
  const out: unknown[] = []
  for (const n of st.nodes) {
    if (!n.path.includes(pathPart)) continue
    const cls = n.el ? `${m.blockClass}__${n.el}` : m.blockClass
    const el = doc.getElementsByClassName(cls)[0] as HTMLElement | undefined
    const chain: string[] = []
    let p: HTMLElement | null = el?.parentElement ?? null
    while (p && p !== doc.body) { const cs = doc.defaultView!.getComputedStyle(p); chain.push(`${p.className.split(' ')[0].replace(m.blockClass + '__', '')}:${cs.display}:${Math.round(p.getBoundingClientRect().width)}x${Math.round(p.getBoundingClientRect().height)}`); p = p.parentElement }
    const cs = el ? doc.defaultView!.getComputedStyle(el) : null
    const rule = m.files[1].content.split('\n\n').find((r) => r.startsWith(`.${cls} {`)) ?? ''
    out.push({ path: n.path, cls, layer: { type: n.layer.type, role: n.layer.role, size: n.layer.size, visible: n.layer.visible, refs: n.layer.propertyRefs, layout: n.layer.layout }, found: !!el, tag: el?.tagName, display: cs?.display, w: cs?.width, h: cs?.height, rect: el ? [el.getBoundingClientRect().width, el.getBoundingClientRect().height] : null, chain, rule, presence: n.presence ? 'cond' : '' })
  }
  return { html: m.files[0].content.split('\n').filter((l) => l.includes(pathPart.split('/').pop()!.toLowerCase().replace(/[^a-z0-9]+/g, '-'))).slice(0, 4), out }
}

;(window as unknown as { __show: (text: string, name: string, vp: Record<string, string> | null, zoom: string, state?: string) => number }).__show = (text, name, vp, zoom, state) => {
  const cat = parseDesignMdText(text)
  const c = importDesignMd(cat, cat.entries.filter((e) => e.name === name).map((e) => e.id))[ 'components' ][0]
  const design = readDesign(c)!
  const m = generateMarkup(c)
  const st = buildStructure(design, c.properties, [])!
  const defaults = design.defaultVariantProperties ?? {}
  const full = { ...defaults, ...(vp ?? {}) }
  const diff = vp ? design.variantDiffs.find((d) => JSON.stringify(d.variantProperties) === JSON.stringify(vp)) : undefined
  const samples = defaultSamples(c.properties)
  for (const p of c.properties) { const f = st.factors.find((x) => x.key === p.key); if (f) samples[p.key] = full[f.name] }
  const shows = new Map<string, boolean>()
  for (const n of st.nodes) { const ref = n.layer.propertyRefs?.visible; if (!ref) continue; const v = diff?.layers.find((l) => l.path === n.path)?.changes.visible ?? n.layer.visible; shows.set(toKey(ref), (shows.get(toKey(ref)) ?? false) || v !== false) }
  for (const [k, on] of shows) if (c.properties.some((p) => p.key === k && p.type === 'boolean')) samples[k] = on
  const body = renderHtl(m.files[0].content, buildModel(c.properties, samples)).body
  paintFrame(frame.contentDocument!, { css: m.files[1].content, body, state: (state ?? 'default') as 'default', bg: 'light', zoom })
  return 1
}

import { parseFigmaResponse } from './features/inputs/figma/parse'
;(window as unknown as { __rest: (json: unknown, zoom: string, state?: string, over?: Record<string, string | boolean>) => string[] }).__rest = (json, zoom, state, over) => {
  const res = parseFigmaResponse(json, { fileKey: 'K', requestedNodeId: '1:1' })
  const c = res.components[0]
  const m = generateMarkup(c)
  const body = renderHtl(m.files[0].content, buildModel(c.properties, { ...defaultSamples(c.properties), ...(over ?? {}) })).body
  paintFrame(frame.contentDocument!, { css: m.files[1].content, body, state: (state ?? 'default') as 'default', bg: 'light', zoom })
  return [m.files[0].content, m.files[1].content]
}
