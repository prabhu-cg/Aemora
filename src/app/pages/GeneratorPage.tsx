import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { PageFrame, Upcoming } from './PageFrame'
import { InputPanel } from '../../features/inputs/ui/InputPanel'
import { ComponentWorkspace } from '../../features/components/inspector/ComponentWorkspace'
import { applyImport } from '../../features/inputs/apply'
import { saveProject } from '../../features/projects/repo'
import type { ImportResult } from '../../features/inputs/types'
import { db } from '../../features/projects/db'
import { buttonClass } from '../../components/ui/buttonClass'
import { relativeTime } from '../../lib/time'

export function GeneratorPage() {
  const { projectId } = useParams()
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const project = useLiveQuery(async () => (projectId ? ((await db.projects.get(projectId)) ?? null) : null), [projectId])
  const recent = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().limit(8).toArray(), [])

  if (!projectId) {
    return (
      <PageFrame title="Dialog Generator" lede="Choose a project to work on its input, properties, mapping, dialog structure, preview and XML.">
        {recent === undefined ? null : recent.length === 0 ? (
          <p className="text-ink-muted">You have no projects yet. <Link className="font-bold text-accent-text underline" to="/app">Create one on the Projects page.</Link></p>
        ) : (
          <ul className="rounded-xl border border-hairline px-4" aria-label="Recent projects">
            {recent.map((p) => (
              <li key={p.id} className="flex items-center justify-between border-t border-hairline py-3 first:border-t-0">
                <Link to={`/app/generator/${p.id}`} className="font-extrabold tracking-tight text-ink-strong hover:text-accent-text">{p.name}</Link>
                <time dateTime={p.updatedAt} className="tabular text-[12px] text-ink-muted">{relativeTime(p.updatedAt)}</time>
              </li>
            ))}
          </ul>
        )}
      </PageFrame>
    )
  }

  if (project === undefined) return <PageFrame title="Dialog Generator" lede="Loading project…" />
  if (project === null) {
    return (
      <PageFrame title="Project not found" lede="This project does not exist in this browser. It may have been deleted, or it was created on another device.">
        <Link to="/app" className={buttonClass('outline')}>Back to projects</Link>
      </PageFrame>
    )
  }

  const add = async (r: ImportResult) => {
    setBusy(true)
    try {
      const { project: next, notes } = applyImport(project, r)
      await saveProject(next)
      setNotice({ tone: 'success', text: `Added ${r.components.length} component${r.components.length === 1 ? '' : 's'}.${notes.length ? ' ' + notes.map((n) => n.message).join(' ') : ''}` })
    } catch {
      setNotice({ tone: 'error', text: 'Could not save to this browser. Nothing was added. Check that site storage is allowed and try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageFrame title={project.name} lede={project.description || 'No description yet.'}>
      <dl className="mb-8 grid max-w-xl grid-cols-[10rem_1fr] gap-y-2 text-[14px]">
        <dt className="font-bold text-ink-strong">AEM component</dt><dd>{project.aemComponentName || 'Not set'}</dd>
        <dt className="font-bold text-ink-strong">Input</dt><dd>{project.inputSource.kind === 'none' ? 'None yet' : `${project.inputSource.kind}${project.inputSource.label ? ` · ${project.inputSource.label}` : ''}`}</dd>
        <dt className="font-bold text-ink-strong">Components</dt><dd className="tabular">{project.components.length}</dd>
        <dt className="font-bold text-ink-strong">Last saved</dt><dd><time dateTime={project.updatedAt}>{relativeTime(project.updatedAt)}</time></dd>
      </dl>

      <section aria-labelledby="input-h" className="mb-10">
        <h2 id="input-h" className="mb-3 text-xl">Bring in a design</h2>
        <InputPanel onAdd={add} busy={busy} />
      </section>

      <section aria-labelledby="comp-h" className="mb-10">
        <h2 id="comp-h" className="mb-3 text-xl">Components in this project</h2>
        {notice && (
          <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`mb-3 rounded-lg p-3 text-[13px] font-semibold ${notice.tone === 'error' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'}`}>{notice.text}</p>
        )}
        <ComponentWorkspace project={project} />
      </section>

      <Upcoming chunk="chunks 6 and 7" items={['A simulated preview of the authoring dialog', 'XML generation, editing and validation']} />
    </PageFrame>
  )
}
