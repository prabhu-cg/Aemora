import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { FolderUp, Plus, Archive, Lock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageFrame } from './PageFrame'
import { Button } from '../../components/ui/Button'
import { db } from '../../features/projects/db'
import {
  ProjectError, deleteProject, duplicateProject, exportBackupJson, exportProjectJson,
  importFromText, recoverProjects, renameProject, MAX_IMPORT_BYTES,
} from '../../features/projects/repo'
import { NewProjectDrawer } from '../../features/projects/NewProjectDrawer'
import { ProjectRow } from '../../features/projects/ProjectRow'
import { downloadText, slug } from '../../lib/download'
import type { Project } from '../../features/projects/schema'

type Notice = { tone: 'success' | 'error' | 'info'; text: string }

export function ProjectsPage() {
  const navigate = useNavigate()
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), [])
  const [drawer, setDrawer] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    recoverProjects()
      .then((r) => {
        if (r.restored.length) setNotice({ tone: 'info', text: `Recovered ${r.restored.join(', ')} from the last good save after an interrupted write.` })
        else if (r.quarantined.length) setNotice({ tone: 'error', text: `${r.quarantined.join(', ')} could not be read and was set aside. It is kept in browser storage, not deleted.` })
      })
      .catch(() => setNotice({ tone: 'error', text: 'Browser storage is unavailable, so projects cannot be loaded. Check that site data is allowed for this page.' }))
  }, [])

  const open = (p: Project) => navigate(`/app/generator/${p.id}`)

  async function guard(fn: () => Promise<void>, fallback: string) {
    try { await fn() } catch (e) { setNotice({ tone: 'error', text: e instanceof ProjectError ? e.message : fallback }) }
  }

  const onImport = async (file: File | undefined) => {
    if (!file) return
    await guard(async () => {
      if (file.size > MAX_IMPORT_BYTES) throw new ProjectError('That file is larger than 10 MB. Aemora imports project JSON up to that size.')
      const res = await importFromText(await file.text())
      const skipped = res.skipped.length ? ` ${res.skipped.length} could not be read and were skipped.` : ''
      setNotice({ tone: 'success', text: `Imported ${res.imported.length} project${res.imported.length === 1 ? '' : 's'}.${skipped}` })
    }, 'Import failed. Your existing projects are untouched.')
    if (fileRef.current) fileRef.current.value = ''
  }

  const tone = {
    success: 'bg-success-soft text-success',
    error: 'bg-danger-soft text-danger',
    info: 'bg-info-soft text-info',
  }

  return (
    <PageFrame title="Projects" lede="Every project holds its components, mappings, dialog structure and generated XML. Everything is stored in this browser.">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button onClick={() => setDrawer(true)}><Plus size={16} aria-hidden="true" />New project</Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()}><FolderUp size={16} aria-hidden="true" />Import</Button>
        <Button
          variant="outline"
          disabled={!projects?.length}
          onClick={() => guard(async () => downloadText(`aemora-backup-${new Date().toISOString().slice(0, 10)}.json`, await exportBackupJson()), 'Could not create the backup.')}
        >
          <Archive size={16} aria-hidden="true" />Export backup
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Import project or backup file" onChange={(e) => onImport(e.target.files?.[0])} />
      </div>

      {notice && (
        <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`mb-4 flex items-start justify-between gap-3 rounded-lg p-3 text-[13px] font-semibold ${tone[notice.tone]}`}>
          <span>{notice.text}</span>
          <button type="button" className="underline cursor-pointer" onClick={() => setNotice(null)}>Dismiss</button>
        </p>
      )}

      <section aria-label="Sample project" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline-strong bg-sand p-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base"><Lock size={15} aria-hidden="true" />Sample: component library <span className="rounded-full border border-hairline-strong px-2 py-0.5 text-[11px] font-bold text-ink-muted">Read-only</span></h2>
          <p className="mt-0.5 max-w-[62ch] text-[13px] text-ink-muted">Five components (Button, Card, Image, Text, Container) already mapped, laid out and turned into XML. A quick way to see what a finished project looks like.</p>
        </div>
        <Link to="/app/sample" className="inline-flex h-10 items-center rounded-lg border border-hairline-strong bg-surface px-4 text-sm font-bold text-ink-strong hover:bg-bg">Open the sample</Link>
      </section>

      {projects === undefined ? (
        <p className="text-ink-muted">Loading projects…</p>
      ) : projects.length === 0 ? (
        <section className="rounded-xl border border-dashed border-hairline-strong p-8">
          <h2 className="text-lg">No projects yet</h2>
          <p className="mt-1 max-w-[56ch] text-ink-muted">Create a project for the AEM component you want a dialog for, or import a project or backup file you exported earlier.</p>
          <p className="mt-3 text-[13px] text-ink-muted">Use <strong>New project</strong> above to start.</p>
        </section>
      ) : (
        <ul aria-label="Projects" className="rounded-xl border border-hairline px-4">
          {projects.map((p) => (
            <ProjectRow
              key={p.id}
              project={p}
              onOpen={() => open(p)}
              onRename={async (name) => { await renameProject(p.id, name) }}
              onDuplicate={() => guard(async () => { await duplicateProject(p.id); setNotice({ tone: 'success', text: `Duplicated “${p.name}”.` }) }, 'Could not duplicate the project.')}
              onExport={() => downloadText(`${slug(p.aemComponentName || p.name)}.aemora.json`, exportProjectJson(p))}
              onDelete={() => guard(() => deleteProject(p.id), 'Could not delete the project.')}
            />
          ))}
        </ul>
      )}

      <NewProjectDrawer open={drawer} onClose={() => setDrawer(false)} onCreated={(p) => { setDrawer(false); open(p) }} />
    </PageFrame>
  )
}
