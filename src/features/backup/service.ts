import { db, type Snapshot } from '../projects/db'
import { ProjectError, exportBackupJson, parseImport, importFromText, type ImportResult } from '../projects/repo'
import type { Project } from '../projects/schema'

/** Restore points are whole-library backups kept in this browser. Oldest ones are pruned past this many. */
export const MAX_SNAPSHOTS = 15
/** An automatic restore point is made at most this often, and only if something changed. */
export const AUTO_INTERVAL_MS = 6 * 60 * 60 * 1000

export type SnapshotMeta = Omit<Snapshot, 'json'> & { id: number }

const meta = ({ json: _json, ...rest }: Snapshot): SnapshotMeta => rest as SnapshotMeta

export async function createSnapshot(kind: Snapshot['kind'], label = ''): Promise<SnapshotMeta | null> {
  const count = await db.projects.count()
  if (count === 0) {
    if (kind === 'manual') throw new ProjectError('There are no projects to back up yet.')
    return null
  }
  const json = await exportBackupJson()
  const row: Snapshot = {
    createdAt: new Date().toISOString(), kind, projectCount: count, bytes: new TextEncoder().encode(json).length, json,
    label: label.trim().slice(0, 80) || (kind === 'auto' ? 'Automatic' : kind === 'before-restore' ? 'Before a restore' : 'Restore point'),
  }
  const id = (await db.snapshots.add(row)) as number
  const all = await db.snapshots.orderBy('createdAt').reverse().primaryKeys()
  if (all.length > MAX_SNAPSHOTS) await db.snapshots.bulkDelete(all.slice(MAX_SNAPSHOTS))
  return meta({ ...row, id })
}

export async function listSnapshots(): Promise<SnapshotMeta[]> {
  return (await db.snapshots.orderBy('createdAt').reverse().toArray()).map(meta)
}

export async function deleteSnapshot(id: number): Promise<void> {
  await db.snapshots.delete(id)
}

export async function snapshotJson(id: number): Promise<string> {
  const row = await db.snapshots.get(id)
  if (!row) throw new ProjectError('That restore point no longer exists.')
  return row.json
}

let autoInFlight: Promise<SnapshotMeta | null> | null = null

/**
 * Make an automatic restore point when there is something new to protect. Safe to call on every start:
 * concurrent calls share one run, and the check and the save happen in a single transaction, so two
 * tabs (or React's double effect in development) cannot each decide to make one.
 */
export function maybeAutoSnapshot(nowMs = Date.now()): Promise<SnapshotMeta | null> {
  autoInFlight ??= db.transaction('rw', db.projects, db.snapshots, async () => {
    const projects = await db.projects.toArray()
    if (!projects.length) return null
    const last = await db.snapshots.orderBy('createdAt').reverse().first()
    if (last) {
      const lastMs = Date.parse(last.createdAt)
      if (nowMs - lastMs < AUTO_INTERVAL_MS) return null
      if (!projects.some((p) => Date.parse(p.updatedAt) > lastMs)) return null
    }
    return createSnapshot('auto')
  }).finally(() => { autoInFlight = null })
  return autoInFlight
}

export type RestoreMode = 'copies' | 'replace'

export interface RestoreResult { restored: Project[]; skipped: ImportResult['skipped']; mode: RestoreMode }

/**
 * Restore from backup text (a file, or a restore point).
 *  - copies: add everything as new projects. Nothing existing is touched.
 *  - replace: swap the whole library for the backup. A restore point of the current state is made first,
 *    and nothing is cleared until the backup has been read and validated in full.
 */
export async function restoreFromText(text: string, mode: RestoreMode): Promise<RestoreResult> {
  if (mode === 'copies') {
    const r = await importFromText(text)
    return { restored: r.imported, skipped: r.skipped, mode }
  }
  const { projects, skipped } = parseImport(text) // throws before anything is changed
  await createSnapshot('before-restore', 'Before restoring a backup')
  await db.transaction('rw', db.projects, db.previous, async () => {
    await db.projects.clear()
    await db.previous.clear()
    for (const p of projects) await db.projects.add(p)
  })
  return { restored: projects, skipped, mode }
}

export async function restoreSnapshot(id: number, mode: RestoreMode): Promise<RestoreResult> {
  return restoreFromText(await snapshotJson(id), mode)
}
