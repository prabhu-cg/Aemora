import { describe, expect, it } from 'vitest'
import { parseComponentJson } from './json'
import { parseClipboard } from './clipboard'
import { parseFigmaResponse } from './figma/parse'
import { parseFigmaRef } from './figma/ref'
import { FigmaError, fetchFigma, figmaSession } from './figma/client'
import { parsePluginPayload, parsePluginText, readPluginMessage, PLUGIN_MESSAGE_TYPE } from './plugin'
import { InputError } from './types'
import { ComponentSchema } from '../components/schema'

const files = import.meta.glob('../../test/fixtures/*', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const samples = import.meta.glob('./samples/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const fx = (n: string) => files[`../../test/fixtures/${n}`] ?? samples[`./samples/${n}`]

describe('JSON import', () => {
  it.each(['button', 'card', 'image', 'text', 'container'])('imports the %s fixture into valid canonical components', (n) => {
    const res = parseComponentJson(fx(`${n}.json`))
    expect(res.components).toHaveLength(1)
    for (const c of res.components) expect(ComponentSchema.safeParse(c).success).toBe(true)
    expect(res.components[0].type).toBe(n)
    expect(res.source.kind).toBe('json')
  })
  it('keeps required, defaults and allowed values', () => {
    const c = parseComponentJson(fx('button.json')).components[0]
    const size = c.properties.find((p) => p.key === 'size')!
    expect(size).toMatchObject({ type: 'enum', defaultValue: 'medium', allowedValues: ['small', 'medium', 'large'] })
    expect(c.properties.find((p) => p.key === 'label')!.required).toBe(true)
    expect(c.properties.find((p) => p.key === 'iconPosition')).toBeTruthy()
    expect(c.properties.find((p) => p.key === 'link')!.group).toBe('Link')
  })
  it('records the card child as an exposed-properties approach', () => {
    const c = parseComponentJson(fx('card.json')).components[0]
    expect(c.children[0]).toMatchObject({ name: 'Primary Button', approach: 'expose-properties', exposedKeys: ['label', 'link', 'variant'] })
  })
  it('never silently discards unsupported fields', () => {
    const res = parseComponentJson(fx('image.json'))
    const c = res.components[0]
    expect(c.unsupported.map((u) => u.name)).toContain('Focal point.cropRatio')
    expect(res.warnings.some((w) => /cropRatio/.test(w.message))).toBe(true)
  })
  it('replaces unsupported property types with a guess and records them', () => {
    const res = parseComponentJson(JSON.stringify({ schema: 'aemora.components/v1', components: [{ name: 'X', properties: [{ name: 'Rating', type: 'slider' }] }] }))
    expect(res.components[0].properties[0].type).toBe('string')
    expect(res.components[0].unsupported[0]).toMatchObject({ rawType: 'slider' })
    expect(res.warnings.some((w) => /not supported/.test(w.message))).toBe(true)
  })
  it('makes duplicate property names unique', () => {
    const res = parseComponentJson(JSON.stringify({ schema: 'aemora.components/v1', components: [{ name: 'X', properties: [{ name: 'Title' }, { name: 'title' }] }] }))
    expect(res.components[0].properties.map((p) => p.key)).toEqual(['title', 'title2'])
  })
  it('accepts a bare component and a bare list, with an info note', () => {
    expect(parseComponentJson('{"name":"Button","properties":[{"name":"Label"}]}').components[0].name).toBe('Button')
    expect(parseComponentJson('[{"name":"A"},{"name":"B"}]').components).toHaveLength(2)
  })
  it('lists every problem with a readable path', () => {
    const bad = JSON.stringify({ schema: 'aemora.components/v1', components: [{ properties: [{ required: 'yes' }] }, { name: '' }] })
    try { parseComponentJson(bad); throw new Error('should fail') } catch (e) {
      expect(e).toBeInstanceOf(InputError)
      const issues = (e as InputError).issues.join('\n')
      expect(issues).toMatch(/components\[0\]\.name/)
      expect(issues).toMatch(/components\[0\]\.properties\[0\]\.name/)
      expect(issues).toMatch(/components\[1\]\.name/)
    }
  })
  it('gives plain errors for invalid JSON, empty input, wrong format and oversize', () => {
    expect(() => parseComponentJson('{oops')).toThrow(/not valid JSON/)
    expect(() => parseComponentJson('   ')).toThrow(/Nothing to import/)
    expect(() => parseComponentJson('{"schema":"other","components":[]}')).toThrow(/Aemora component format/)
    expect(() => parseComponentJson('x'.repeat(3 * 1024 * 1024))).toThrow(/larger than 2 MB/)
  })
  it('removes prototype-pollution keys', () => {
    const res = parseComponentJson('{"schema":"aemora.components/v1","components":[{"name":"X","meta":{"__proto__":{"p":1},"ok":1}}]}')
    expect(Object.keys(res.components[0].meta)).toEqual(['ok'])
    expect(({} as Record<string, unknown>).p).toBeUndefined()
  })
})

describe('clipboard input', () => {
  it('parses structured text into a component with typed properties', () => {
    const res = parseClipboard(fx('clipboard.txt'))
    const c = res.components[0]
    expect(c).toMatchObject({ name: 'Button', type: 'button', description: 'Primary call to action' })
    expect(c.properties.find((p) => p.key === 'label')).toMatchObject({ type: 'text', required: true, defaultValue: 'Learn more' })
    expect(c.properties.find((p) => p.key === 'size')).toMatchObject({ type: 'enum', allowedValues: ['small', 'medium', 'large'], defaultValue: 'medium' })
    expect(c.properties.find((p) => p.key === 'opensInNewTab')!.type).toBe('boolean')
    expect(c.properties.find((p) => p.key === 'iconPosition')).toMatchObject({ type: 'enum', allowedValues: ['none', 'left', 'right'] })
    expect(c.properties.find((p) => p.key === 'trackingId')).toBeTruthy()
  })
  it('flags what it cannot interpret instead of dropping it', () => {
    const res = parseClipboard(fx('clipboard.txt'))
    expect(res.uncertain).toEqual([{ line: 8, text: 'Some stray note that is not a property' }])
    expect(res.warnings.some((w) => /could not be interpreted/.test(w.message))).toBe(true)
    expect(res.warnings.some((w) => /No type given/.test(w.message))).toBe(true)
  })
  it('hands JSON to the JSON adapter', () => {
    const res = parseClipboard(fx('card.json'))
    expect(res.components[0].name).toBe('Card')
    expect(res.source.kind).toBe('clipboard')
  })
  it('detects the component type when none is declared', () => {
    expect(parseClipboard('Component: Hero Card\n- Heading: text').components[0].type).toBe('card')
  })
  it('errors helpfully when no component is present', () => {
    expect(() => parseClipboard('just some words')).toThrow(/No component found/)
    expect(() => parseClipboard('  ')).toThrow(/empty/)
  })
})

describe('Figma reference parsing', () => {
  it('reads keys, URLs and node ids', () => {
    expect(parseFigmaRef('AbC123xyz789QwErTy')).toEqual({ fileKey: 'AbC123xyz789QwErTy' })
    expect(parseFigmaRef('https://www.figma.com/design/AbC123xyz789QwErTy/My-file?node-id=12-34&t=x')).toEqual({ fileKey: 'AbC123xyz789QwErTy', nodeId: '12:34' })
    expect(parseFigmaRef('figma.com/file/AbC123xyz789QwErTy')).toEqual({ fileKey: 'AbC123xyz789QwErTy', nodeId: undefined })
  })
  it('rejects non-Figma input', () => {
    expect(parseFigmaRef('https://evil.example/design/AbC123xyz789QwErTy')).toBeNull()
    expect(parseFigmaRef('not a url')).toBeNull()
    expect(parseFigmaRef('')).toBeNull()
  })
})

describe('Figma adapter parsing', () => {
  const res = parseFigmaResponse(JSON.parse(fx('figma-file.json')), { fileKey: 'KEY1234567890' })
  const button = res.components.find((c) => c.name === 'Button')!
  it('finds component sets and standalone components, and ignores plain frames', () => {
    expect(res.components.map((c) => c.name).sort()).toEqual(['Button', 'Card'])
    expect(button.type).toBe('button')
    expect(res.components.find((c) => c.name === 'Card')!.type).toBe('card')
  })
  it('maps text, boolean and variant definitions', () => {
    expect(button.properties.find((p) => p.key === 'label')).toMatchObject({ type: 'string', defaultValue: 'Learn more' })
    expect(button.properties.find((p) => p.key === 'showIcon')).toMatchObject({ type: 'boolean', defaultValue: false })
    expect(button.properties.find((p) => p.key === 'size')).toMatchObject({ type: 'enum', allowedValues: ['Small', 'Medium', 'Large'], defaultValue: 'Medium' })
    expect(button.properties.find((p) => p.key === 'disabled')).toMatchObject({ type: 'boolean', defaultValue: false })
  })
  it('turns an instance swap into a text field for the component name, and says so', () => {
    expect(button.properties.find((x) => x.key === 'icon')).toMatchObject({ type: 'string', label: 'Icon' })
    expect(button.unsupported.some((u) => u.rawType === 'INSTANCE_SWAP')).toBe(false)
    expect(res.warnings.some((w) => /An instance swap \(usually an icon\) became a text field/.test(w.message))).toBe(true)
  })
  it('proposes unexposed text layers as suggestions, not the ones already exposed', () => {
    const helper = button.properties.find((p) => p.key === 'helperText')!
    expect(helper.origin.suggested).toBe(true)
    expect(button.properties.filter((p) => p.label === 'Label')).toHaveLength(1)
  })
  it('captures dimensions and hidden layers as metadata', () => {
    expect(button.meta.size).toEqual({ width: 320, height: 120 })
    expect(button.meta.hiddenLayers).toEqual(['Focus ring'])
  })
  it('derives properties from text layers on a standalone component', () => {
    const card = res.components.find((c) => c.name === 'Card')!
    expect(card.properties.map((p) => p.key)).toEqual(['heading', 'description'])
    expect(card.properties.find((p) => p.key === 'description')!.type).toBe('text')
  })
  it('stamps the source and says visual properties are read for the markup but are not fields', () => {
    expect(res.source).toMatchObject({ kind: 'figma-rest' })
    expect(res.source.label).toMatch(/Design System/)
    expect(res.warnings.some((w) => /Colors, spacing and shapes are read for the markup and preview, but they are not authoring fields/.test(w.message))).toBe(true)
  })
  it('reports missing nodes and empty results', () => {
    const missing = parseFigmaResponse(JSON.parse(fx('figma-nodes-missing.json')), { requestedNodeId: '9:9' })
    expect(missing.components).toHaveLength(0)
    expect(missing.warnings[0].message).toMatch(/did not return node 9:9/)
    const none = parseFigmaResponse({ document: { id: '0:0', type: 'DOCUMENT', name: 'D', children: [] } })
    expect(none.warnings.some((w) => /No components were found/.test(w.message))).toBe(true)
    expect(parseFigmaResponse('garbage').warnings[0].message).toMatch(/did not look like/)
  })
  it('derives variant axes from child names when definitions are absent', () => {
    const r = parseFigmaResponse({ document: { id: '0:0', type: 'DOCUMENT', name: 'D', children: [{ id: '1:1', type: 'COMPONENT_SET', name: 'Tag', children: [
      { id: '1:2', type: 'COMPONENT', name: 'Tone=Info, Size=S', children: [] }, { id: '1:3', type: 'COMPONENT', name: 'Tone=Warn, Size=S', children: [] } ] }] } })
    const tag = r.components[0]
    expect(tag.properties.find((p) => p.key === 'tone')).toMatchObject({ type: 'enum', allowedValues: ['Info', 'Warn'] })
    expect(tag.properties.find((p) => p.key === 'tone')!.origin.suggested).toBe(true)
  })
})

describe('Figma client errors and token handling', () => {
  const ref = { fileKey: 'KEY1234567890' }
  const resp = (status: number, headers: Record<string, string> = {}, body: unknown = {}) =>
    (async () => new Response(JSON.stringify(body), { status, headers })) as unknown as typeof fetch
  const kind = async (f: typeof fetch, token = 'figd_secret_token_value') => {
    try { await fetchFigma({ ref, token, fetchImpl: f }); return 'ok' } catch (e) { expect(e).toBeInstanceOf(FigmaError); expect(String((e as Error).message)).not.toContain(token); return (e as FigmaError).kind }
  }
  it('classifies each failure', async () => {
    expect(await kind(resp(401))).toBe('invalid-token')
    expect(await kind(resp(403))).toBe('forbidden')
    expect(await kind(resp(404))).toBe('not-found')
    expect(await kind(resp(500))).toBe('bad-response')
    expect(await kind((async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch)).toBe('network')
    expect(await kind(resp(200), '  ')).toBe('missing-token')
  })
  it('reports rate limits with the retry delay', async () => {
    try { await fetchFigma({ ref, token: 't', fetchImpl: resp(429, { 'Retry-After': '42' }) }) } catch (e) {
      expect((e as FigmaError).kind).toBe('rate-limit')
      expect((e as FigmaError).retryAfterSeconds).toBe(42)
      expect((e as Error).message).toMatch(/42 seconds/)
    }
  })
  it('sends the token only as a header to api.figma.com and uses the nodes endpoint for a node id', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const f = (async (url: string, init?: RequestInit) => { calls.push({ url, init }); return new Response('{}', { status: 200 }) }) as unknown as typeof fetch
    await fetchFigma({ ref: { fileKey: 'KEY1234567890', nodeId: '12:34' }, token: 'figd_abc', fetchImpl: f })
    expect(calls[0].url.startsWith('https://api.figma.com/v1/files/KEY1234567890/nodes?ids=12%3A34')).toBe(true)
    expect(calls[0].url).not.toContain('figd_abc')
    expect((calls[0].init!.headers as Record<string, string>)['X-Figma-Token']).toBe('figd_abc')
  })
  it('keeps the token in memory only', () => {
    localStorage.clear()
    figmaSession.set('  figd_mem ')
    expect(figmaSession.get()).toBe('figd_mem')
    expect(JSON.stringify({ ...localStorage })).not.toContain('figd_mem')
    figmaSession.clear()
    expect(figmaSession.has()).toBe(false)
  })
})

describe('Figma plugin interface', () => {
  const payload = { schema: 'aemora.plugin/v1', pluginVersion: '0.1.0', fileName: 'DS', components: [{ name: 'Button', properties: [{ name: 'Label' }] }] }
  it('parses a valid payload and marks the source as the plugin', () => {
    const res = parsePluginPayload(payload)
    expect(res.components[0].origin.kind).toBe('figma-plugin')
    expect(res.source).toMatchObject({ kind: 'figma-plugin', label: 'DS · plugin 0.1.0' })
    expect(parsePluginText(JSON.stringify(payload)).components).toHaveLength(1)
  })
  it('rejects malformed payloads with readable issues', () => {
    expect(() => parsePluginPayload({ schema: 'aemora.plugin/v1', components: [] })).toThrow(InputError)
    expect(() => parsePluginText('nope')).toThrow(/not valid JSON/)
  })
  it('accepts messages only from the opener window and of the right type', () => {
    const opener = {} as Window
    const msg = { type: PLUGIN_MESSAGE_TYPE, payload }
    expect(readPluginMessage({ data: msg, source: opener as MessageEventSource }, opener)?.components).toHaveLength(1)
    expect(readPluginMessage({ data: msg, source: {} as MessageEventSource }, opener)).toBeNull()
    expect(readPluginMessage({ data: { type: 'other' }, source: opener as MessageEventSource }, opener)).toBeNull()
    expect(readPluginMessage({ data: msg, source: opener as MessageEventSource }, null)).toBeNull()
  })
})
