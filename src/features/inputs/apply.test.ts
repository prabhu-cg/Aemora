import { beforeEach, describe, expect, it } from 'vitest'
import { applyImport } from './apply'
import { parseComponentJson } from './json'
import { buildScreenshotResult, clampRegion, emptyDraft, newDraftProperty } from './screenshotDraft'
import { MAX_IMAGE_BYTES, readScreenshot, sniffImageType } from './screenshot'
import { InputError } from './types'
import { db } from '../projects/db'
import { createProject, deleteProject, exportProjectJson, getProject, importFromText, saveProject } from '../projects/repo'
import { ProjectSchema } from '../projects/schema'
import { makeComponent } from '../components/factory'

const samples = import.meta.glob('./samples/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const sample = (n: string) => samples[`./samples/${n}.json`]

// 1x1 transparent PNG
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))
const file = (bytes: Uint8Array, name = 'shot.png', type = 'image/png') => new File([bytes as BlobPart], name, { type })

beforeEach(async () => { await Promise.all([db.projects.clear(), db.previous.clear(), db.quarantine.clear()]) })

describe('applyImport', () => {
  it('merges components, stamps the source, and never overwrites same-named components', async () => {
    const p = await createProject({ name: 'P' })
    const first = applyImport(p, parseComponentJson(sample('button')))
    expect(first.project.components).toHaveLength(1)
    expect(first.project.inputSource.kind).toBe('json')
    const second = applyImport(first.project, parseComponentJson(sample('button')))
    expect(second.project.components.map((c) => c.name)).toEqual(['Button', 'Button 2'])
    expect(second.notes[0].message).toMatch(/already exists/)
    expect(new Set(second.project.components.map((c) => c.id)).size).toBe(2)
  })
  it('produces a project that still validates against the schema', async () => {
    const p = await createProject({ name: 'P' })
    const { project } = applyImport(p, parseComponentJson(sample('card')))
    expect(ProjectSchema.safeParse(project).success).toBe(true)
  })
})

describe('project persistence of imported components', () => {
  it('survives a database reopen', async () => {
    const p = await createProject({ name: 'Persist' })
    await saveProject(applyImport(p, parseComponentJson(sample('container'))).project)
    db.close(); await db.open()
    const back = (await getProject(p.id))!
    expect(back.components[0].name).toBe('Container')
    expect(back.components[0].children[0]).toMatchObject({ name: 'Content', approach: 'reference-component' })
  })
  it('round-trips through project export and import, including unsupported items and assets', async () => {
    const p = await createProject({ name: 'RT' })
    const withJson = applyImport(p, parseComponentJson(sample('image'))).project
    const asset = await readScreenshot(file(PNG))
    const withShot = applyImport(withJson, buildScreenshotResult({ ...emptyDraft(), name: 'Banner', properties: [{ ...newDraftProperty(), name: 'Title' }] }, [], asset)).project
    const saved = await saveProject(withShot)
    const json = exportProjectJson(saved)
    await deleteProject(p.id)
    const res = await importFromText(json)
    const back = res.imported[0]
    expect(back.components.map((c) => c.name)).toEqual(['Image', 'Banner'])
    expect(back.components[0].unsupported[0].name).toBe('Focal point.cropRatio')
    expect(back.assets).toHaveLength(1)
    expect(back.assets[0].dataUrl).toBe(asset.dataUrl)
  })
  it('exports never contain Figma tokens', async () => {
    const p = await createProject({ name: 'X' })
    expect(exportProjectJson(p)).not.toMatch(/figd_|X-Figma-Token/i)
  })
  it('rejects a project whose asset is not a raster image data URL', async () => {
    const p = await createProject({ name: 'Bad' })
    const evil = { ...p, assets: [{ id: 'a', name: 'x.svg', mime: 'image/png', bytes: 1, dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }] }
    await expect(saveProject(evil as never)).rejects.toThrow()
  })
})

describe('screenshot input', () => {
  it('identifies formats by content, not by name or declared type', () => {
    expect(sniffImageType(PNG)).toBe('image/png')
    expect(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    const webp = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ')
    expect(sniffImageType(webp)).toBe('image/webp')
    expect(sniffImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull()
  })
  it('reads a valid image into an asset data URL', async () => {
    const a = await readScreenshot(file(PNG, 'card.png'))
    expect(a).toMatchObject({ name: 'card.png', mime: 'image/png', bytes: PNG.length })
    expect(a.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
  })
  it('rejects disguised SVG/HTML files and oversize images with clear messages', async () => {
    await expect(readScreenshot(file(new TextEncoder().encode('<svg onload="alert(1)"/>'), 'x.png', 'image/png'))).rejects.toThrow(/Only PNG, JPG and WebP/)
    await expect(readScreenshot(new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'big.png', { type: 'image/png' }))).rejects.toThrow(/up to 8 MB/)
  })
  it('builds a component from manual annotations with regions and typed properties', async () => {
    const asset = await readScreenshot(file(PNG))
    const region = { id: 'r1', x: 10, y: 20, w: 30, h: 15 }
    const res = buildScreenshotResult({
      name: 'Hero Card', type: 'auto',
      properties: [
        { ...newDraftProperty(), name: 'Heading', type: 'string', required: true, regionId: 'r1' },
        { ...newDraftProperty(), name: 'Size', type: 'enum', values: 'small, large', defaultValue: 'small' },
        { ...newDraftProperty(), name: 'Show badge', type: 'boolean', defaultValue: 'true' },
        { ...newDraftProperty(), name: 'Columns', type: 'number', defaultValue: '3' },
      ],
    }, [region], asset)
    const c = res.components[0]
    expect(c.type).toBe('card')
    expect(c.properties.map((p) => p.key)).toEqual(['heading', 'size', 'showBadge', 'columns'])
    expect(c.properties[0].origin).toMatchObject({ kind: 'screenshot', assetId: asset.id, region: { x: 10, y: 20, w: 30, h: 15 } })
    expect(c.properties[1]).toMatchObject({ allowedValues: ['small', 'large'], defaultValue: 'small' })
    expect(c.properties[2].defaultValue).toBe(true)
    expect(c.properties[3].defaultValue).toBe(3)
    expect(res.source).toMatchObject({ kind: 'screenshot' })
    expect(res.assets).toEqual([asset])
    expect(res.warnings[0].message).toMatch(/does not read pixels/)
  })
  it('works without an image (manual entry only) and reports every missing field', () => {
    expect(buildScreenshotResult({ ...emptyDraft(), name: 'X', properties: [{ ...newDraftProperty(), name: 'A' }] }, [], null).assets).toEqual([])
    try { buildScreenshotResult(emptyDraft(), [], null); throw new Error('no') } catch (e) {
      expect(e).toBeInstanceOf(InputError)
      expect((e as InputError).issues).toEqual(['Give the component a name.', 'Add at least one property.'])
    }
    try { buildScreenshotResult({ ...emptyDraft(), name: 'X', properties: [newDraftProperty()] }, [], null) } catch (e) {
      expect((e as InputError).issues).toEqual(['Property 1 needs a name.'])
    }
  })
  it('keeps regions inside the image', () => {
    expect(clampRegion({ id: 'a', x: 90, y: -5, w: 50, h: 200 })).toEqual({ id: 'a', x: 90, y: 0, w: 10, h: 100 })
  })
})

describe('invalid configurations', () => {
  it('rejects a component with an unknown property type at the schema level', async () => {
    const p = await createProject({ name: 'P' })
    const bad = { ...p, components: [{ ...makeComponent({ name: 'X' }), properties: [{ id: 'p', key: 'k', label: 'K', type: 'slider', origin: { kind: 'manual' } }] }] }
    await expect(saveProject(bad as never)).rejects.toThrow()
  })
})
