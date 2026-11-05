import { describe, expect, it, vi } from 'vitest'
import { makeComponent } from '../../components/factory'
import type { ImportResult } from '../types'
import { PREVIEW_MAX_BYTES, PREVIEW_MAX_COUNT, attachFigmaPreviews, fetchFigmaPreviews, figmaOpenUrl, isFigmaImageUrl, previewScale } from './previews'

const KEY = 'AbC123xyz789QwErTy'
const ref = { fileKey: KEY }
const S3 = 'https://figma-alpha-api.s3.us-west-2.amazonaws.com/images'
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))

type Call = { url: string; init?: RequestInit }
/** A fake Figma: the images endpoint plus the image storage. Records every call. */
function fake(opts: { images?: (ids: string[]) => Record<string, unknown>; body?: (url: string) => Uint8Array | Response; status?: number; headers?: Record<string, string> } = {}) {
  const calls: Call[] = []
  const impl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    if (url.startsWith('https://api.figma.com/v1/images/')) {
      if (opts.status) return new Response('{}', { status: opts.status, headers: opts.headers })
      const ids = decodeURIComponent(new URL(url).searchParams.get('ids') ?? '').split(',')
      const images = opts.images ? opts.images(ids) : Object.fromEntries(ids.map((i) => [i, `${S3}/${i.replace(/:/g, '-')}`]))
      return new Response(JSON.stringify({ err: null, images }), { status: 200 })
    }
    const out = opts.body ? opts.body(url) : PNG
    return out instanceof Response ? out : new Response(out as BlobPart, { status: 200 })
  }) as unknown as typeof fetch
  return { impl, calls }
}
const node = (id: string, name = `C${id}`, width = 300) => ({ nodeId: id, name, width })

describe('preview scale and links', () => {
  it('shrinks big components to about 720px wide, never enlarges, and handles bad sizes', () => {
    expect(previewScale(300)).toBe(1)
    expect(previewScale(720)).toBe(1)
    expect(previewScale(1440)).toBe(0.5)
    expect(previewScale(7200)).toBe(0.1)
    expect(previewScale(1_000_000)).toBe(0.05)
    for (const bad of [undefined, 0, -5, NaN, 'wide']) expect(previewScale(bad)).toBe(1)
  })
  it('only trusts https links to Figma or its image storage', () => {
    expect(isFigmaImageUrl(`${S3}/x`)).toBe(true)
    expect(isFigmaImageUrl('https://www.figma.com/file/x.png')).toBe(true)
    for (const bad of ['http://figma-alpha-api.s3.amazonaws.com/x', 'https://evil.example/x.png', 'https://amazonaws.com.evil.example/x', 'javascript:alert(1)', 'data:image/png;base64,AAAA', '', null, 5]) expect(isFigmaImageUrl(bad)).toBe(false)
  })
  it('builds an "Open in Figma" link only from a well-formed origin', () => {
    expect(figmaOpenUrl(`${KEY}:1:10`)).toBe(`https://www.figma.com/design/${KEY}?node-id=1-10`)
    for (const bad of [undefined, '', 'short:1:2', `${KEY}:abc`, `${KEY}`, `<script>:1:2`]) expect(figmaOpenUrl(bad)).toBeNull()
  })
})

describe('fetching previews', () => {
  it('asks Figma for PNG renders at the right scale, with the token only on the Figma API call', async () => {
    const { impl, calls } = fake()
    const { previews, problems } = await fetchFigmaPreviews({ ref, token: 'figd_tok', nodes: [node('1:10', 'Button'), node('2:10', 'Card')], fetchImpl: impl })
    expect(problems).toEqual([])
    expect([...previews.keys()]).toEqual(['1:10', '2:10'])
    const api = calls[0]
    expect(api.url).toBe(`https://api.figma.com/v1/images/${KEY}?ids=1%3A10,2%3A10&format=png&scale=1`)
    expect((api.init!.headers as Record<string, string>)['X-Figma-Token']).toBe('figd_tok')
    for (const c of calls.slice(1)) {
      expect(c.init?.headers).toBeUndefined() // nothing sent to the image storage
      expect(c.init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' })
      expect(c.url.startsWith(S3)).toBe(true)
    }
  })
  it('turns each download into a valid PNG asset', async () => {
    const { impl } = fake()
    const { previews } = await fetchFigmaPreviews({ ref, token: 't', nodes: [node('1:10', 'Button')], fetchImpl: impl })
    const a = previews.get('1:10')!
    expect(a).toMatchObject({ name: 'Button (Figma preview).png', mime: 'image/png', bytes: PNG.length })
    expect(a.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
  })
  it('makes one request per scale', async () => {
    const { impl, calls } = fake()
    await fetchFigmaPreviews({ ref, token: 't', nodes: [node('1:1', 'A', 300), node('1:2', 'B', 1440), node('1:3', 'C', 400)], fetchImpl: impl })
    const api = calls.filter((c) => c.url.startsWith('https://api.figma.com'))
    expect(api.map((c) => new URL(c.url).searchParams.get('scale')).sort()).toEqual(['0.5', '1'])
  })
  it('reports a component Figma could not render, and keeps the others', async () => {
    const { impl } = fake({ images: (ids) => ({ [ids[0]]: null, [ids[1]]: `${S3}/ok` }) })
    const { previews, problems } = await fetchFigmaPreviews({ ref, token: 't', nodes: [node('1:1', 'A'), node('1:2', 'B')], fetchImpl: impl })
    expect([...previews.keys()]).toEqual(['1:2'])
    expect(problems).toEqual(['Figma returned no picture for A.'])
  })
  it('never downloads from a host it does not trust', async () => {
    const { impl, calls } = fake({ images: (ids) => ({ [ids[0]]: 'https://evil.example/a.png' }) })
    const { previews, problems } = await fetchFigmaPreviews({ ref, token: 't', nodes: [node('1:1', 'A')], fetchImpl: impl })
    expect(previews.size).toBe(0)
    expect(problems[0]).toMatch(/not from Figma's image storage/)
    expect(calls.some((c) => c.url.includes('evil.example'))).toBe(false)
  })
  it('skips pictures that are too big or not really PNGs', async () => {
    const big = fake({ body: () => new Uint8Array(PREVIEW_MAX_BYTES + 1) })
    expect((await fetchFigmaPreviews({ ref, token: 't', nodes: [node('1:1', 'Huge')], fetchImpl: big.impl })).problems[0]).toMatch(/Huge is 1\.5 MB, over the 1\.5 MB limit|over the/)
    const svg = fake({ body: () => new TextEncoder().encode('<svg onload="alert(1)"/>') })
    const r = await fetchFigmaPreviews({ ref, token: 't', nodes: [node('1:1', 'Vec')], fetchImpl: svg.impl })
    expect(r.previews.size).toBe(0)
    expect(r.problems[0]).toMatch(/not a PNG image/)
  })
  it('survives a blocked download (for example by CORS)', async () => {
    const { impl } = fake({ body: () => { throw new TypeError('Failed to fetch') } })
    const r = await fetchFigmaPreviews({ ref, token: 't', nodes: [node('1:1', 'A')], fetchImpl: impl })
    expect(r.previews.size).toBe(0)
    expect(r.problems[0]).toMatch(/Could not download the preview for A\. The browser may have blocked/)
  })
  it('reports Figma errors in plain language and stops on rate limits and permission problems', async () => {
    const limited = fake({ status: 429, headers: { 'Retry-After': '30' } })
    const a = await fetchFigmaPreviews({ ref, token: 'figd_secret', nodes: [node('1:1', 'A', 300), node('1:2', 'B', 1440)], fetchImpl: limited.impl })
    expect(a.problems).toHaveLength(1)
    expect(a.problems[0]).toMatch(/Try again in 30 seconds/)
    expect(limited.calls).toHaveLength(1) // did not hammer the API for the second scale
    for (const status of [401, 403]) {
      const f = fake({ status })
      const r = await fetchFigmaPreviews({ ref, token: 't', nodes: [node('1:1', 'A', 300), node('1:2', 'B', 1440)], fetchImpl: f.impl })
      expect(r.problems).toHaveLength(1)
      expect(f.calls).toHaveLength(1)
    }
    expect(JSON.stringify(a.problems)).not.toContain('figd_secret')
  })
  it('treats an err field from Figma as a failure, not as success', async () => {
    const impl = vi.fn(async () => new Response(JSON.stringify({ err: 'Render timeout', images: {} }), { status: 200 })) as unknown as typeof fetch
    const r = await fetchFigmaPreviews({ ref, token: 't', nodes: [node('1:1', 'A')], fetchImpl: impl })
    expect(r.previews.size).toBe(0)
    expect(r.problems[0]).toMatch(/could not render previews/)
  })
  it('previews at most a dozen components and says so', async () => {
    const { impl } = fake()
    const many = Array.from({ length: PREVIEW_MAX_COUNT + 3 }, (_, i) => node(`9:${i}`, `N${i}`))
    const r = await fetchFigmaPreviews({ ref, token: 't', nodes: many, fetchImpl: impl })
    expect(r.previews.size).toBe(PREVIEW_MAX_COUNT)
    expect(r.problems[0]).toMatch(/Only the first 12 components got a preview/)
  })
  it('needs a token', async () => {
    const r = await fetchFigmaPreviews({ ref, token: '  ', nodes: [node('1:1', 'A')], fetchImpl: fake().impl })
    expect(r.previews.size).toBe(0)
    expect(r.problems[0]).toMatch(/personal access token/)
  })
})

describe('attaching previews to an import', () => {
  const base = (): ImportResult => ({
    components: [
      { ...makeComponent({ name: 'Button' }), meta: { figmaNodeId: '1:10', size: { width: 320, height: 120 } } },
      { ...makeComponent({ name: 'Plain' }), meta: {} },
    ],
    warnings: [], uncertain: [], assets: [], source: { kind: 'figma-rest' },
  })
  it('adds the pictures and links them to their components, leaving others alone', async () => {
    const r = await attachFigmaPreviews(base(), ref, 't', fake().impl)
    expect(r.assets).toHaveLength(1)
    expect(r.components[0].previewAssetId).toBe(r.assets[0].id)
    expect(r.components[1].previewAssetId).toBeUndefined()
    expect(r.warnings.some((w) => w.level === 'info' && /do not update by themselves/.test(w.message))).toBe(true)
  })
  it('keeps every component and shows a warning when previews fail', async () => {
    const r = await attachFigmaPreviews(base(), ref, 't', fake({ status: 403 }).impl)
    expect(r.components).toHaveLength(2)
    expect(r.assets).toEqual([])
    expect(r.components.every((c) => !c.previewAssetId)).toBe(true)
    expect(r.warnings.some((w) => w.level === 'warning' && /cannot read that file/.test(w.message))).toBe(true)
  })
  it('does nothing, and makes no request, when there is nothing to render', async () => {
    const { impl } = fake()
    const none: ImportResult = { ...base(), components: [makeComponent({ name: 'X' })] }
    expect(await attachFigmaPreviews(none, ref, 't', impl)).toBe(none)
    expect(impl).not.toHaveBeenCalled()
  })
})
