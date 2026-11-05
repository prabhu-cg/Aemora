import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { AemoraDB } from './db'
import { applyImport } from '../inputs/apply'
import { parseComponentJson } from '../inputs/json'
import { ProjectSchema } from './schema'

describe('database migration', () => {
  it('upgrades projects saved before chunk 2 so they gain assets and can take imports', async () => {
    const name = 'aemora-migration-test'
    const old = new Dexie(name)
    old.version(1).stores({ projects: 'id, updatedAt, name', previous: 'id', quarantine: '++qid, id' })
    await old.open()
    const t = new Date().toISOString()
    await old.table('projects').add({
      schemaVersion: 1, id: 'old-1', name: 'Legacy', description: '', aemComponentName: '', inputSource: { kind: 'none' },
      components: [], mappings: [], dialog: {}, generatedXml: null, validation: [], createdAt: t, updatedAt: t,
    })
    old.close()

    const upgraded = new AemoraDB(name)
    const row = await upgraded.projects.get('old-1')
    expect(row?.assets).toEqual([])
    expect(row?.dialog).toEqual({ components: {} })
    expect(row?.generatedXml).toEqual({})
    const merged = applyImport(row!, parseComponentJson('{"name":"Button","properties":[{"name":"Label"}]}')).project
    expect(ProjectSchema.safeParse(merged).success).toBe(true)
    upgraded.close()
    await Dexie.delete(name)
  })
})
