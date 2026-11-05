import Dexie, { type EntityTable } from 'dexie'
import type { Project } from './schema'

export interface QuarantinedRow {
  qid?: number
  id: string
  reason: string
  quarantinedAt: string
  raw: unknown
}

export class AemoraDB extends Dexie {
  projects!: EntityTable<Project, 'id'>
  /** Last known-good copy of each project, written in the same transaction as every save. */
  previous!: EntityTable<Project, 'id'>
  quarantine!: EntityTable<QuarantinedRow, 'qid'>

  constructor(name = 'aemora') {
    super(name)
    this.version(1).stores({
      projects: 'id, updatedAt, name',
      previous: 'id',
      quarantine: '++qid, id',
    })
    // v2 (chunk 2): projects gained typed `assets`. Rows saved by v1 do not have it.
    this.version(2).stores({}).upgrade(async (tx) => {
      for (const name of ['projects', 'previous'] as const) {
        await tx.table(name).toCollection().modify((row: Record<string, unknown>) => {
          if (!Array.isArray(row.assets)) row.assets = []
          if (!Array.isArray(row.components)) row.components = []
        })
      }
    })
    // v3 (chunk 5): `dialog` became { components: {} } instead of an empty object.
    this.version(3).stores({}).upgrade(async (tx) => {
      for (const name of ['projects', 'previous'] as const) {
        await tx.table(name).toCollection().modify((row: Record<string, unknown>) => {
          const d = row.dialog as { components?: unknown } | undefined
          if (!d || typeof d !== 'object' || typeof d.components !== 'object' || d.components === null) row.dialog = { components: {} }
          if (!Array.isArray(row.mappings)) row.mappings = []
        })
      }
    })
  }
}

export const db = new AemoraDB()
