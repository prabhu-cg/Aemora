import Dexie, { type EntityTable } from 'dexie'
import type { Project } from './schema'

export interface QuarantinedRow {
  qid?: number
  id: string
  reason: string
  quarantinedAt: string
  raw: unknown
}

class AemoraDB extends Dexie {
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
  }
}

export const db = new AemoraDB()
