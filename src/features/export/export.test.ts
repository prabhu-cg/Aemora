import { describe, expect, it } from 'vitest'
import { readZip } from '../../test/zipReader'
import { db } from '../projects/db'
import { copyProject, createProject, exportBackupJson, exportProjectJson, getProject, importFromText, listProjects, mutateProject, parseImport } from '../projects/repo'
import { restoreFromText } from '../backup/service'
import { sampleProject } from '../sample/sample'
import { figmaSession } from '../inputs/figma/client'
import { makeComponent, makeProperty } from '../components/factory'
import { checkSyntax } from '../xml/validate'
import { bundleName, buildBundle, componentExports, componentFolders, hasProblems, readme } from './bundle'
import type { Project } from '../projects/schema'

const sample = () => sampleProject()
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

describe('what gets exported', () => {
  const items = componentExports(sample())

  it('one dialog per component, at the path AEM expects', () => {
    expect(items.map((i) => i.component.name)).toEqual(['Button', 'Card', 'Image', 'Text', 'Container'])
    expect(items.map((i) => i.folder)).toEqual(['button', 'card', 'image', 'text', 'container'])
    expect(items[1].aemPath).toBe('/apps/sample-component-library/components/card/_cq_dialog/.content.xml')
    expect(items[1].zipPath).toBe('jcr_root/apps/sample-component-library/components/card/_cq_dialog/.content.xml')
    expect(items[1].filename).toBe('card.cq_dialog.content.xml')
  })
  it('every sample dialog is well-formed and passes all checks', () => {
    for (const i of items) {
      expect(checkSyntax(i.xml).ok).toBe(true)
      expect(hasProblems(i)).toBe(false)
      expect(i.counts).toMatchObject({ syntaxOk: true, generatorErrors: 0, aemErrors: 0 })
    }
  })
  it('uses hand-edited XML when there is some, keeps its chosen format, and says so', async () => {
    const p = await createProject({ name: 'Site' })
    const c = makeComponent({ name: 'Card Teaser', properties: [makeProperty({ key: 'a', label: 'A' })] })
    await mutateProject(p.id, (x) => ({ ...x, components: [c], generatedXml: { [c.id]: { xml: '<jcr:root>hand</jcr:root>', base: 'x', generatedAt: 't', edited: true, format: 'inline' } } }))
    const [e] = componentExports((await getProject(p.id))!)
    expect(e.xml).toBe('<jcr:root>hand</jcr:root>')
    expect(e.edited).toBe(true)
    expect(e.format).toBe('inline')
    expect(e.aemPath).toBe('/apps/site/components/card-teaser/.content.xml')
    expect(e.filename).toBe('card-teaser.content.xml')
    expect(hasProblems(e)).toBe(true) // the edit is not a valid dialog
  })
  it('gives repeated names their own folders and honours the project component name when there is one component', () => {
    const mk = (n: string) => makeComponent({ name: n })
    expect(componentFolders({ components: [mk('Card'), mk('card'), mk('CARD')], aemComponentName: '' })).toEqual(['card', 'card-2', 'card-3'])
    expect(componentFolders({ components: [mk('Card')], aemComponentName: 'teaser-card' })).toEqual(['teaser-card'])
    expect(componentFolders({ components: [mk('A'), mk('B')], aemComponentName: 'teaser-card' })).toEqual(['a', 'b'])
    expect(componentFolders({ components: [mk('')], aemComponentName: '' })).toEqual(['component'])
  })
})

describe('the ZIP', () => {
  const p = sample()
  const { zip, exports } = buildBundle(p)
  const entries = readZip(zip)
  const get = (name: string) => entries.find((e) => e.name === name)!

  it('holds a README, every dialog under jcr_root, and the project, with valid checksums', () => {
    expect(entries.map((e) => e.name)).toEqual(['README.txt', ...exports.map((e) => e.zipPath), 'aemora-project.json'])
    expect(entries.every((e) => e.crcOk)).toBe(true)
    expect(entries.filter((e) => e.name.startsWith('jcr_root/')).every((e) => e.name.endsWith('_cq_dialog/.content.xml'))).toBe(true)
  })
  it('each dialog in the archive is exactly the XML the tool shows', () => {
    for (const e of exports) expect(get(e.zipPath).text).toBe(e.xml)
  })
  it('the README says what this is, that it is untested on AEM, and where each dialog goes', () => {
    const t = get('README.txt').text
    expect(t).toMatch(/NOT been tested on a running AEM instance/)
    expect(t).toMatch(/Merge it into ui\.apps\/src\/main\/content/)
    expect(t).toContain('/apps/sample-component-library/components/card/_cq_dialog/.content.xml')
    expect(t).not.toMatch(/HAS PROBLEMS/)
  })
  it('the project inside imports back as the same project', () => {
    const back = parseImport(get('aemora-project.json').text)
    expect(back.projects).toHaveLength(1)
    expect(back.projects[0]).toEqual(p)
  })
  it('names the file after the project', () => expect(bundleName(p)).toBe('sample-component-library-dialogs.zip'))
  it('lists problems in the README when a dialog has them', async () => {
    const proj = await createProject({ name: 'Broken' })
    const c = makeComponent({ name: 'Thing', properties: [makeProperty({ key: 'e', label: 'E', type: 'enum' })] }) // select with no choices
    await mutateProject(proj.id, (x) => ({ ...x, components: [c] }))
    const full = (await getProject(proj.id))!
    const t = readme(full, componentExports(full))
    expect(t).toMatch(/HAS PROBLEMS/)
    expect(t).toMatch(/PROBLEMS FOUND BY AEMORA'S OWN CHECKS/)
    expect(t).toMatch(/A select needs at least one choice/)
  })
  it('an empty project still gives a valid ZIP with a README and the project', async () => {
    const e = await createProject({ name: 'Empty' })
    const z = readZip(buildBundle((await getProject(e.id))!).zip)
    expect(z.map((x) => x.name)).toEqual(['README.txt', 'aemora-project.json'])
  })
})

describe('round trips keep everything', () => {
  const rich = async (): Promise<Project> => {
    const base = await copyProject(sample(), 'Rich project')
    const card = base.components[1]
    await mutateProject(base.id, (x) => ({
      ...x,
      description: 'Has everything',
      assets: [{ id: 'asset-1', name: 'shot.png', mime: 'image/png', bytes: 70, dataUrl: PNG }],
      generatedXml: { [card.id]: { xml: '<jcr:root>edited</jcr:root>', base: 'b', generatedAt: '2025-01-01T00:00:00.000Z', edited: true, format: 'standalone' } },
    }))
    return (await getProject(base.id))!
  }

  it('a project survives export and import unchanged: components, mappings, dialog, XML edits, screenshots', async () => {
    const p = await rich()
    const json = exportProjectJson(p)
    await db.projects.clear()
    const r = await importFromText(json)
    expect(r.imported[0]).toEqual(p)
    expect(await getProject(p.id)).toEqual(p)
  })
  it('a whole backup survives and restores unchanged', async () => {
    const a = await rich()
    const b = await createProject({ name: 'Second' })
    const before = [a, (await getProject(b.id))!].sort((x, y) => x.id.localeCompare(y.id))
    const backup = await exportBackupJson()
    await restoreFromText(backup, 'replace') // replace with itself
    const after = (await listProjects()).sort((x, y) => x.id.localeCompare(y.id))
    expect(after).toEqual(before)
    await db.projects.clear()
    await restoreFromText(backup, 'replace')
    expect((await listProjects()).sort((x, y) => x.id.localeCompare(y.id))).toEqual(before)
  })
  it('exports are deterministic apart from the timestamp', async () => {
    const p = await rich()
    const strip = (s: string) => s.replace(/"exportedAt": "[^"]+"/, '')
    expect(strip(exportProjectJson(p))).toBe(strip(exportProjectJson(p)))
  })
  it('an export made before later features existed still imports (missing parts take their defaults)', async () => {
    const old = {
      format: 'aemora.project', schemaVersion: 1, exportedAt: '2025-01-01T00:00:00.000Z',
      project: { schemaVersion: 1, id: 'old-1', name: 'Early export', description: '', aemComponentName: '', inputSource: { kind: 'none' }, components: [], mappings: [], dialog: {}, generatedXml: null, validation: [], createdAt: 't', updatedAt: 't' },
    }
    const r = await importFromText(JSON.stringify(old))
    expect(r.imported[0]).toMatchObject({ id: 'old-1', assets: [], generatedXml: {}, dialog: { components: {} } })
  })
  it('a failed import leaves the existing library alone', async () => {
    const p = await rich()
    await expect(importFromText('{"format":"aemora.project","schemaVersion":1,"exportedAt":"x","project":{"id":"z"}}')).rejects.toThrow()
    await expect(importFromText('not json')).rejects.toThrow()
    expect(await listProjects()).toEqual([p])
  })
  it('never carries a Figma token into any export, backup or ZIP', async () => {
    figmaSession.set('figd_super_secret_token')
    const p = await rich()
    const everything = [exportProjectJson(p), await exportBackupJson(), ...readZip(buildBundle(p).zip).map((e) => e.text)].join('\n')
    expect(everything).not.toContain('figd_super_secret_token')
    expect(everything.toLowerCase()).not.toContain('x-figma-token')
    figmaSession.clear()
  })
})
