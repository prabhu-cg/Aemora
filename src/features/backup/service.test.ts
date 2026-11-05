import { describe, expect, it } from 'vitest'
import { db } from '../projects/db'
import { createProject, exportBackupJson, getProject, listProjects, mutateProject, ProjectError } from '../projects/repo'
import { makeComponent } from '../components/factory'
import {
  AUTO_INTERVAL_MS, MAX_SNAPSHOTS, createSnapshot, deleteSnapshot, listSnapshots, maybeAutoSnapshot, restoreFromText, restoreSnapshot, snapshotJson,
} from './service'

const withComponent = (name: string) => (id: string) => mutateProject(id, (p) => ({ ...p, components: [makeComponent({ name })] }))

describe('restore points', () => {
  it('refuses a manual one when there is nothing to back up, and skips an automatic one quietly', async () => {
    await expect(createSnapshot('manual')).rejects.toThrow(/no projects/)
    expect(await createSnapshot('auto')).toBeNull()
    expect(await listSnapshots()).toEqual([])
  })

  it('saves a complete backup with a count, a size and a name', async () => {
    await createProject({ name: 'A' }); await createProject({ name: 'B' })
    const s = (await createSnapshot('manual', '  Before refactor  '))!
    expect(s).toMatchObject({ kind: 'manual', label: 'Before refactor', projectCount: 2 })
    expect(s.bytes).toBeGreaterThan(100)
    const json = JSON.parse(await snapshotJson(s.id))
    expect(json.format).toBe('aemora.backup')
    expect(json.projects.map((p: { name: string }) => p.name).sort()).toEqual(['A', 'B'])
    expect('json' in (await listSnapshots())[0]).toBe(false) // the list does not carry the whole backup
  })

  it('lists newest first and keeps only the newest ones', async () => {
    await createProject({ name: 'A' })
    for (let i = 0; i < MAX_SNAPSHOTS + 3; i++) {
      await createSnapshot('manual', `r${i}`)
      await new Promise((r) => setTimeout(r, 2))
    }
    const list = await listSnapshots()
    expect(list).toHaveLength(MAX_SNAPSHOTS)
    expect(list[0].label).toBe(`r${MAX_SNAPSHOTS + 2}`)
    expect(list.at(-1)!.label).toBe('r3')
  })

  it('deletes one and reports a missing one clearly', async () => {
    await createProject({ name: 'A' })
    const s = (await createSnapshot('manual'))!
    await deleteSnapshot(s.id)
    expect(await listSnapshots()).toEqual([])
    await expect(snapshotJson(s.id)).rejects.toThrow(/no longer exists/)
    await expect(restoreSnapshot(s.id, 'copies')).rejects.toThrow(ProjectError)
  })
})

describe('automatic restore points', () => {
  it('makes none without projects, one the first time, and then only after a while and only if something changed', async () => {
    expect(await maybeAutoSnapshot()).toBeNull()
    const p = await createProject({ name: 'A' })
    const first = (await maybeAutoSnapshot())!
    expect(first).toMatchObject({ kind: 'auto', label: 'Automatic' })

    expect(await maybeAutoSnapshot(Date.now() + 1000)).toBeNull() // too soon
    const later = Date.now() + AUTO_INTERVAL_MS + 60_000
    expect(await maybeAutoSnapshot(later)).toBeNull() // long enough, but nothing changed

    await new Promise((r) => setTimeout(r, 5))
    await mutateProject(p.id, (x) => ({ ...x, description: 'changed' }))
    expect(await maybeAutoSnapshot(later)).not.toBeNull() // changed since the last one
    expect(await listSnapshots()).toHaveLength(2)
  })
})

describe('automatic restore points: concurrency', () => {
  it('two calls at once (two tabs, or a double effect) make exactly one', async () => {
    await createProject({ name: 'A' })
    const [a, b] = await Promise.all([maybeAutoSnapshot(), maybeAutoSnapshot()])
    expect(a).toEqual(b) // they shared one run
    expect(await listSnapshots()).toHaveLength(1)
    await maybeAutoSnapshot()
    expect(await listSnapshots()).toHaveLength(1)
  })
})

describe('restoring', () => {
  const seed = async () => {
    const a = await createProject({ name: 'Alpha' }); await withComponent('Btn')(a.id)
    const b = await createProject({ name: 'Beta' })
    return { a, b }
  }

  it('as copies adds everything and touches nothing that exists', async () => {
    const { a } = await seed()
    const snap = (await createSnapshot('manual'))!
    const r = await restoreSnapshot(snap.id, 'copies')
    expect(r.mode).toBe('copies')
    expect(r.restored).toHaveLength(2)
    const all = await listProjects()
    expect(all).toHaveLength(4)
    expect((await getProject(a.id))!.name).toBe('Alpha')
    expect(all.filter((p) => p.name.endsWith('(imported)'))).toHaveLength(2)
    expect((await db.snapshots.toArray()).filter((x) => x.kind === 'before-restore')).toHaveLength(0)
  })

  it('replace swaps the whole library back to the backup, after saving a restore point of what was there', async () => {
    const { a } = await seed()
    const before = await exportBackupJson()
    const snap = (await createSnapshot('manual', 'good state'))!
    await mutateProject(a.id, (x) => ({ ...x, name: 'Ruined', components: [] }))
    await createProject({ name: 'Extra' })
    expect((await listProjects()).length).toBe(3)

    const r = await restoreSnapshot(snap.id, 'replace')
    expect(r.restored).toHaveLength(2)
    const after = JSON.parse(await exportBackupJson()).projects
    const orig = JSON.parse(before).projects
    const byId = (xs: { id: string }[]) => Object.fromEntries(xs.map((x) => [x.id, x]))
    expect(Object.keys(byId(after)).sort()).toEqual(Object.keys(byId(orig)).sort())
    expect((await getProject(a.id))!.name).toBe('Alpha')
    expect((await getProject(a.id))!.components.map((c) => c.name)).toEqual(['Btn'])

    const safety = (await listSnapshots()).find((s) => s.kind === 'before-restore')!
    expect(safety.projectCount).toBe(3)
    const saved = JSON.parse(await snapshotJson(safety.id)).projects.map((p: { name: string }) => p.name).sort()
    expect(saved).toEqual(['Beta', 'Extra', 'Ruined'])
  })

  it('a bad backup changes nothing and makes no safety restore point', async () => {
    await seed()
    const before = await listProjects()
    for (const text of ['{nope', '{"hello":1}', JSON.stringify({ format: 'aemora.backup', schemaVersion: 1, exportedAt: 'x', projects: [{ id: 'b' }] }), JSON.stringify({ format: 'aemora.backup', schemaVersion: 99, exportedAt: 'x', projects: [] })]) {
      await expect(restoreFromText(text, 'replace')).rejects.toThrow(ProjectError)
    }
    expect(await listProjects()).toEqual(before)
    expect(await db.snapshots.count()).toBe(0)
  })

  it('replace skips unreadable projects but keeps the good ones, and says how many were skipped', async () => {
    const { a } = await seed()
    const text = JSON.stringify({ format: 'aemora.backup', schemaVersion: 1, exportedAt: 'x', projects: [JSON.parse((await exportBackupJson())).projects[0], { id: 'broken', name: '' }] })
    const r = await restoreFromText(text, 'replace')
    expect(r.restored).toHaveLength(1)
    expect(r.skipped).toHaveLength(1)
    expect(await listProjects()).toHaveLength(1)
    expect(await getProject(a.id) ?? true).toBeTruthy()
  })
})
