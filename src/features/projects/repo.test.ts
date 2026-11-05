import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  createProject, deleteProject, duplicateProject, exportBackupJson, exportProjectJson, getProject,
  importFromText, listProjects, recoverProjects, renameProject, saveProject, MAX_IMPORT_BYTES,
} from './repo'
import { ProjectSchema, SCHEMA_VERSION } from './schema'

beforeEach(async () => {
  await Promise.all([db.projects.clear(), db.previous.clear(), db.quarantine.clear()])
})

describe('project CRUD', () => {
  it('creates a project with defaults and a stable id', async () => {
    const p = await createProject({ name: '  Card teaser ', aemComponentName: 'card-teaser' })
    expect(p.name).toBe('Card teaser')
    expect(p.schemaVersion).toBe(SCHEMA_VERSION)
    expect(p.inputSource.kind).toBe('none')
    expect(p.components).toEqual([])
    expect((await getProject(p.id))?.name).toBe('Card teaser')
  })
  it('rejects empty names and invalid component names', async () => {
    await expect(createProject({ name: '   ' })).rejects.toThrow()
    await expect(createProject({ name: 'x', aemComponentName: 'Card Teaser!' })).rejects.toThrow()
  })
  it('lists most recently updated first', async () => {
    const a = await createProject({ name: 'A' })
    const b = await createProject({ name: 'B' })
    await new Promise((r) => setTimeout(r, 5))
    await renameProject(a.id, 'A2')
    expect((await listProjects()).map((p) => p.id)).toEqual([a.id, b.id])
  })
  it('renames, and refuses a blank name', async () => {
    const p = await createProject({ name: 'One' })
    expect((await renameProject(p.id, 'Two')).name).toBe('Two')
    await expect(renameProject(p.id, ' ')).rejects.toThrow()
    expect((await getProject(p.id))?.name).toBe('Two')
  })
  it('duplicates with a new id and independent data', async () => {
    const p = await saveProject({ ...(await createProject({ name: 'Base' })), components: [{ id: 'c1' }] })
    const d = await duplicateProject(p.id)
    expect(d.id).not.toBe(p.id)
    expect(d.name).toBe('Base (copy)')
    expect(d.components).toEqual([{ id: 'c1' }])
    await saveProject({ ...d, components: [] })
    expect((await getProject(p.id))?.components).toHaveLength(1)
  })
  it('deletes a project and its previous copy', async () => {
    const p = await createProject({ name: 'Gone' })
    await renameProject(p.id, 'Gone 2')
    await deleteProject(p.id)
    expect(await getProject(p.id)).toBeUndefined()
    expect(await db.previous.get(p.id)).toBeUndefined()
  })
})

describe('persistence', () => {
  it('survives closing and reopening the database', async () => {
    const p = await createProject({ name: 'Persist' })
    db.close()
    await db.open()
    expect((await getProject(p.id))?.name).toBe('Persist')
  })
})

describe('export and import', () => {
  it('round-trips a single project', async () => {
    const p = await saveProject({ ...(await createProject({ name: 'RT', description: 'd' })), components: [{ id: 'c1', n: 1 }] })
    const json = exportProjectJson(p)
    await deleteProject(p.id)
    const res = await importFromText(json)
    expect(res.imported).toHaveLength(1)
    expect(res.imported[0].id).toBe(p.id)
    expect(res.imported[0].components).toEqual([{ id: 'c1', n: 1 }])
  })
  it('gives a colliding import a new id and never overwrites', async () => {
    const p = await createProject({ name: 'Orig' })
    const res = await importFromText(exportProjectJson(p))
    expect(res.imported[0].id).not.toBe(p.id)
    expect(res.imported[0].name).toBe('Orig (imported)')
    expect((await getProject(p.id))?.name).toBe('Orig')
    expect(await listProjects()).toHaveLength(2)
  })
  it('round-trips a whole-backup restore', async () => {
    await createProject({ name: 'A' })
    await createProject({ name: 'B' })
    const backup = await exportBackupJson()
    await db.projects.clear()
    const res = await importFromText(backup)
    expect(res.imported.map((p) => p.name).sort()).toEqual(['A', 'B'])
  })
  it('explains invalid JSON and leaves existing projects intact', async () => {
    await createProject({ name: 'Keep' })
    await expect(importFromText('{nope')).rejects.toThrow(/not valid JSON/)
    await expect(importFromText('{"hello":1}')).rejects.toThrow(/not an Aemora/)
    expect(await listProjects()).toHaveLength(1)
  })
  it('skips bad projects in a backup but imports the good ones, reporting the reason', async () => {
    const good = await createProject({ name: 'Good' })
    const text = JSON.stringify({
      format: 'aemora.backup', schemaVersion: 1, exportedAt: 'x',
      projects: [{ ...good, id: 'new-good' }, { id: 'bad', name: '' }],
    })
    const res = await importFromText(text)
    expect(res.imported).toHaveLength(1)
    expect(res.skipped).toHaveLength(1)
    expect(res.skipped[0].reason).toMatch(/name|schemaVersion/)
  })
  it('fails entirely, writing nothing, when no project is valid', async () => {
    const text = JSON.stringify({ format: 'aemora.backup', schemaVersion: 1, exportedAt: 'x', projects: [{ id: 'b' }] })
    await expect(importFromText(text)).rejects.toThrow(/No project/)
    expect(await listProjects()).toHaveLength(0)
  })
  it('rejects files from a newer schema and oversize input', async () => {
    const text = JSON.stringify({ format: 'aemora.project', schemaVersion: 99, exportedAt: 'x', project: {} })
    await expect(importFromText(text)).rejects.toThrow(/newer version/)
    await expect(importFromText('x'.repeat(MAX_IMPORT_BYTES + 1))).rejects.toThrow(/larger than/)
  })
  it('strips prototype-pollution keys from imported data', async () => {
    const p = await createProject({ name: 'Poison' })
    const json = exportProjectJson({ ...p, dialog: {} }).replace('"dialog": {}', '"dialog": {"__proto__": {"polluted": true}, "ok": 1}')
    const res = await importFromText(json)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.keys(res.imported[0].dialog)).toEqual(['ok'])
  })
  it('never contains Figma credentials in exports', async () => {
    const p = await createProject({ name: 'Secrets' })
    expect(exportProjectJson(p).toLowerCase()).not.toMatch(/token|x-figma/)
  })
})

describe('interrupted-save recovery', () => {
  it('keeps the previous good copy on every save', async () => {
    const p = await createProject({ name: 'v1' })
    await renameProject(p.id, 'v2')
    expect((await db.previous.get(p.id))?.name).toBe('v1')
  })
  it('restores the last good copy when the stored row is corrupt, and quarantines the bad one', async () => {
    const p = await createProject({ name: 'v1' })
    await renameProject(p.id, 'v2')
    await db.projects.put({ ...p, name: '', components: 'broken' } as never)
    const report = await recoverProjects()
    expect(report.restored).toEqual(['v1'])
    expect((await getProject(p.id))?.name).toBe('v1')
    expect(await db.quarantine.count()).toBe(1)
    expect(ProjectSchema.safeParse(await getProject(p.id)).success).toBe(true)
  })
  it('quarantines (never deletes) a corrupt row with no previous copy', async () => {
    await db.projects.put({ id: 'orphan', name: 5 } as never)
    const report = await recoverProjects()
    expect(report.quarantined).toHaveLength(1)
    expect(await getProject('orphan')).toBeUndefined()
    expect((await db.quarantine.toArray())[0].raw).toMatchObject({ id: 'orphan' })
  })
  it('does nothing when everything is healthy', async () => {
    await createProject({ name: 'ok' })
    expect(await recoverProjects()).toEqual({ restored: [], quarantined: [] })
  })
})
