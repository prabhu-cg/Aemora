import Dexie, { type EntityTable } from 'dexie'
import type { Project } from './schema'

export interface QuarantinedRow {
  qid?: number
  id: string
  reason: string
  quarantinedAt: string
  raw: unknown
}

export interface Snapshot {
  id?: number
  createdAt: string
  kind: 'manual' | 'auto' | 'before-restore'
  label: string
  projectCount: number
  bytes: number
  /** A complete aemora.backup file. */
  json: string
}

export class AemoraDB extends Dexie {
  projects!: EntityTable<Project, 'id'>
  /** Last known-good copy of each project, written in the same transaction as every save. */
  previous!: EntityTable<Project, 'id'>
  quarantine!: EntityTable<QuarantinedRow, 'qid'>
  /** Restore points: whole-library backups kept in this browser. */
  snapshots!: EntityTable<Snapshot, 'id'>

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
    // v4 (chunk 7): generated XML is kept per component. It used to be a single value or null.
    this.version(4).stores({}).upgrade(async (tx) => {
      for (const name of ['projects', 'previous'] as const) {
        await tx.table(name).toCollection().modify((row: Record<string, unknown>) => {
          const g = row.generatedXml
          if (g === null || g === undefined || typeof g !== 'object' || Array.isArray(g)) row.generatedXml = {}
        })
      }
    })
    // v5 (chunk 8): restore points.
    this.version(5).stores({ snapshots: '++id, createdAt' })
  }
}

export const db = new AemoraDB()