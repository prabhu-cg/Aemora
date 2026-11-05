import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, Lock } from 'lucide-react'
import { PageFrame } from './PageFrame'
import { Button } from '../../components/ui/Button'
import { InputPanel } from '../../features/inputs/ui/InputPanel'
import { ExportPanel } from '../../features/export/ui/ExportPanel'
import { ComponentWorkspace } from '../../features/components/inspector/ComponentWorkspace'
import { applyImport } from '../../features/inputs/apply'
import { copyProject, saveProject } from '../../features/projects/repo'
import type { ImportResult } from '../../features/inputs/types'
import type { Project } from '../../features/projects/schema'
import { relativeTime } from '../../lib/time'

/** A project's workspace. With readOnly it is a guided tour: everything can be opened, nothing can be changed. */
export function ProjectView({ project, readOnly = false }: { project: Project; readOnly?: boolean }) {
  const navigate = useNavigate()
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

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

  const duplicate = async () => {
    setBusy(true)
    try {
      const copy = await copyProject(project, 'Component library (from the sample)')
      navigate(`/app/generator/${copy.id}`)
    } catch {
      setNotice({ tone: 'error', text: 'Could not save a copy to this browser. Check that site storage is allowed and try again.' })
      setBusy(false)
    }
  }

  return (
    <PageFrame title={project.name} lede={project.description || 'No description yet.'}>
      {readOnly && (
        <div role="note" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline-strong bg-sand p-4">
          <p className="flex max-w-[60ch] items-start gap-2 text-[14px] text-ink-strong">
            <Lock size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span><strong>Read-only sample.</strong> Open any component and walk through Properties, AEM fields, Dialog, Preview and XML. Nothing here can be changed or is saved. To try edits, make a copy.</span>
          </p>
          <Button onClick={duplicate} disabled={busy}><Copy size={16} aria-hidden="true" />Make my own copy</Button>
        </div>
      )}
      {notice && readOnly && <p role="alert" className="mb-4 rounded-lg bg-danger-soft p-3 text-[13px] font-semibold text-danger">{notice.text}</p>}

      <dl className="mb-8 grid max-w-xl grid-cols-[10rem_1fr] gap-y-2 text-[14px]">
        <dt className="font-bold text-ink-strong">AEM component</dt><dd>{project.aemComponentName || 'Not set'}</dd>
        <dt className="font-bold text-ink-strong">Input</dt><dd>{project.inputSource.kind === 'none' ? 'None yet' : `${project.inputSource.kind}${project.inputSource.label ? ` · ${project.inputSource.label}` : ''}`}</dd>
        <dt className="font-bold text-ink-strong">Components</dt><dd className="tabular">{project.components.length}</dd>
        {!readOnly && <><dt className="font-bold text-ink-strong">Last saved</dt><dd><time dateTime={project.updatedAt}>{relativeTime(project.updatedAt)}</time></dd></>}
      </dl>

      {!readOnly && (
        <section aria-labelledby="input-h" className="mb-10">
          <h2 id="input-h" className="mb-3 text-xl">Bring in a design</h2>
          <InputPanel onAdd={add} busy={busy} />
        </section>
      )}

      <section aria-labelledby="comp-h" className="mb-10">
        <h2 id="comp-h" className="mb-3 text-xl">Components in this project</h2>
        {notice && !readOnly && (
          <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`mb-3 rounded-lg p-3 text-[13px] font-semibold ${notice.tone === 'error' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'}`}>{notice.text}</p>
        )}
        <ComponentWorkspace project={project} readOnly={readOnly} />
      </section>

      <ExportPanel project={project} />
    </PageFrame>
  )
}
