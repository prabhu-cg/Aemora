import { db } from './db'
import { newId } from '../../lib/id'
import {
  BackupEnvelopeSchema,
  NewProjectInputSchema,
  ProjectEnvelopeSchema,
  ProjectSchema,
  SCHEMA_VERSION,
  type NewProjectInput,
  type Project,
} from './schema'

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024

export class ProjectError extends Error {}

const now = () => new Date().toISOString()

/** Drop keys that could pollute prototypes if a consumer ever merges the data. */
function safeReviver(key: string, value: unknown) {
  return key === '__proto__' || key === 'constructor' || key === 'prototype' ? undefined : value
}

export async function listProjects(): Promise<Project[]> {
  return db.projects.orderBy('updatedAt').reverse().toArray()
}

export async function getProject(id: string): Promise<Project | undefined> {
  return db.projects.get(id)
}

/** Atomic save: the prior version moves to `previous` in the same transaction as the write. */
export async function saveProject(project: Project): Promise<Project> {
  const parsed = ProjectSchema.parse({ ...project, updatedAt: now() })
  await db.transaction('rw', db.projects, db.previous, async () => {
    const existing = await db.projects.get(parsed.id)
    if (existing) await db.previous.put(existing)
    await db.projects.put(parsed)
  })
  return parsed
}

/**
 * Apply a change to the freshly stored row inside one transaction, so rapid edits never
 * overwrite each other with stale data. The previous version is kept like any other save.
 */
export async function mutateProject(id: string, fn: (p: Project) => Project): Promise<Project> {
  return db.transaction('rw', db.projects, db.previous, async () => {
    const existing = await db.projects.get(id)
    if (!existing) throw new ProjectError('That project no longer exists.')
    const next = ProjectSchema.parse({ ...fn(structuredClone(existing)), updatedAt: now() })
    await db.previous.put(existing)
    await db.projects.put(next)
    return next
  })
}

export async function createProject(input: NewProjectInput): Promise<Project> {
  const data = NewProjectInputSchema.parse(input)
  const t = now()
  const project = ProjectSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    ...data,
    createdAt: t,
    updatedAt: t,
  })
  await db.projects.add(project)
  return project
}

export async function renameProject(id: string, name: string): Promise<Project> {
  const trimmed = NewProjectInputSchema.shape.name.parse(name)
  const existing = await db.projects.get(id)
  if (!existing) throw new ProjectError('That project no longer exists.')
  return saveProject({ ...existing, name: trimmed })
}

export async function updateProjectDetails(
  id: string,
  patch: Partial<Pick<Project, 'name' | 'description' | 'aemComponentName'>>,
): Promise<Project> {
  const existing = await db.projects.get(id)
  if (!existing) throw new ProjectError('That project no longer exists.')
  return saveProject({ ...existing, ...patch })
}

export async function duplicateProject(id: string): Promise<Project> {
  const existing = await db.projects.get(id)
  if (!existing) throw new ProjectError('That project no longer exists.')
  const t = now()
  const copy = ProjectSchema.parse({
    ...structuredClone(existing),
    id: newId(),
    name: `${existing.name} (copy)`.slice(0, 120),
    createdAt: t,
    updatedAt: t,
  })
  await db.projects.add(copy)
  return copy
}

/** Store a copy of any project (such as the built-in sample) as a new, editable project of the user's own. */
export async function copyProject(source: Project, name?: string): Promise<Project> {
  const t = now()
  const copy = ProjectSchema.parse({ ...structuredClone(source), id: newId(), name: (name ?? `${source.name} (my copy)`).slice(0, 120), createdAt: t, updatedAt: t })
  await db.projects.add(copy)
  return copy
}

export async function deleteProject(id: string): Promise<void> {
  await db.transaction('rw', db.projects, db.previous, async () => {
    await db.projects.delete(id)
    await db.previous.delete(id)
  })
}

// ---------- export / import ----------

export function exportProjectJson(project: Project): string {
  return JSON.stringify(
    { format: 'aemora.project', schemaVersion: SCHEMA_VERSION, exportedAt: now(), project },
    null,
    2,
  )
}

export async function exportBackupJson(): Promise<string> {
  const projects = await listProjects()
  return JSON.stringify(
    { format: 'aemora.backup', schemaVersion: SCHEMA_VERSION, exportedAt: now(), projects },
    null,
    2,
  )
}

export interface ImportResult {
  imported: Project[]
  skipped: { index: number; reason: string }[]
}

function describeIssues(err: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return err.issues
    .slice(0, 3)
    .map((i) => (i.path.length ? `${i.path.map(String).join('.')}: ${i.message}` : i.message))
    .join('; ')
}

/**
 * Parse and validate everything first, then write in a single transaction.
 * A failed import never touches existing projects. Imported projects always get a
 * fresh id when it collides, so nothing is overwritten.
 */
export async function importFromText(text: string): Promise<ImportResult> {
  if (text.length > MAX_IMPORT_BYTES) {
    throw new ProjectError(`That file is larger than ${MAX_IMPORT_BYTES / 1024 / 1024} MB. Aemora imports project JSON up to that size.`)
  }
  let data: unknown
  try {
    data = JSON.parse(text, safeReviver)
  } catch {
    throw new ProjectError('That file is not valid JSON. Export a project from Aemora and import that file.')
  }

  let rawProjects: unknown[]
  const backup = BackupEnvelopeSchema.safeParse(data)
  const single = ProjectEnvelopeSchema.safeParse(data)
  if (backup.success) {
    if (backup.data.schemaVersion > SCHEMA_VERSION) throw newerVersionError(backup.data.schemaVersion)
    rawProjects = backup.data.projects
  } else if (single.success) {
    if (single.data.schemaVersion > SCHEMA_VERSION) throw newerVersionError(single.data.schemaVersion)
    rawProjects = [single.data.project]
  } else {
    throw new ProjectError('This is not an Aemora project or backup file. Expected format "aemora.project" or "aemora.backup".')
  }

  const valid: Project[] = []
  const skipped: ImportResult['skipped'] = []
  rawProjects.forEach((raw, index) => {
    const parsed = ProjectSchema.safeParse(raw)
    if (parsed.success) valid.push(parsed.data)
    else skipped.push({ index, reason: describeIssues(parsed.error) })
  })
  if (!valid.length) {
    throw new ProjectError(
      skipped.length
        ? `No project in the file could be imported. First problem: ${skipped[0].reason}`
        : 'The file contains no projects.',
    )
  }

  const imported = await db.transaction('rw', db.projects, async () => {
    const out: Project[] = []
    for (const p of valid) {
      const taken = await db.projects.get(p.id)
      const t = now()
      const project = taken ? { ...p, id: newId(), name: `${p.name} (imported)`.slice(0, 120), updatedAt: t } : p
      await db.projects.add(project)
      out.push(project)
    }
    return out
  })
  return { imported, skipped }
}

function newerVersionError(v: number) {
  return new ProjectError(`This file was made by a newer version of Aemora (schema ${v}). Update Aemora and try again.`)
}

// ---------- recovery ----------

export interface RecoveryReport {
  restored: string[]
  quarantined: string[]
}

/**
 * Run at startup. Any stored row that no longer validates (e.g. a write interrupted by
 * closing the tab) is moved to `quarantine`, never deleted, and replaced by the last
 * known-good copy from `previous` when one exists.
 */
export async function recoverProjects(): Promise<RecoveryReport> {
  const report: RecoveryReport = { restored: [], quarantined: [] }
  const rows = await db.projects.toArray()
  for (const row of rows) {
    const ok = ProjectSchema.safeParse(row)
    if (ok.success) continue
    const reason = describeIssues(ok.error)
    await db.transaction('rw', db.projects, db.previous, db.quarantine, async () => {
      await db.quarantine.add({ id: String((row as { id?: unknown }).id ?? ''), reason, quarantinedAt: now(), raw: row })
      await db.projects.delete((row as Project).id)
      const prev = await db.previous.get((row as Project).id)
      if (prev && ProjectSchema.safeParse(prev).success) {
        await db.projects.put(prev)
        report.restored.push(prev.name)
      } else {
        report.quarantined.push(String((row as { name?: unknown }).name ?? (row as { id?: unknown }).id))
      }
    })
  }
  return report
}
