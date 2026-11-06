import { useMemo, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, Download, Lock, Pencil, Plus } from 'lucide-react'
import { PageFrame } from './PageFrame'
import { Button } from '../../components/ui/Button'
import { ActionMenu } from '../../components/ui/ActionMenu'
import { Drawer } from '../../components/ui/Drawer'
import { EditProjectDrawer } from '../../features/projects/EditProjectDrawer'
import { componentExports, hasProblems } from '../../features/export/bundle'
import { downloadText, slug } from '../../lib/download'
import { InputPanel } from '../../features/inputs/ui/InputPanel'
import { ExportPanel } from '../../features/export/ui/ExportPanel'
import { ComponentWorkspace, type WorkspaceFocus } from '../../features/components/inspector/ComponentWorkspace'
import { applyImport } from '../../features/inputs/apply'
import { copyProject, duplicateProject, exportProjectJson, saveProject } from '../../features/projects/repo'
import type { ImportResult } from '../../features/inputs/types'
import type { Project } from '../../features/projects/schema'
import { relativeTime } from '../../lib/time'

/** A project's workspace. With readOnly it is a guided tour: everything can be opened, nothing can be changed. */
export function ProjectView({ project, readOnly = false }: { project: Project; readOnly?: boolean }) {
  const navigate = useNavigate()
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [focus, setFocus] = useState<WorkspaceFocus | null>(null)
  const [tab, setTab] = useState<'components' | 'export'>('components')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)
  const toFix = useMemo(() => componentExports(project).filter(hasProblems).length, [project])

  const add = async (r: ImportResult) => {
    setBusy(true)
    try {
      const { project: next, notes } = applyImport(project, r)
      await saveProject(next)
      setAdding(false); setTab('components')
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

  const tabs = [
    { id: 'components', label: 'Components', badge: String(project.components.length), warn: false },
    { id: 'export', label: 'Export', badge: toFix ? `${toFix} to fix` : '', warn: toFix > 0 },
  ] as const
  const onTabKey = (e: KeyboardEvent, i: number) => {
    const j = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1
    if (j < 0) return
    e.preventDefault(); setTab(tabs[j].id); document.getElementById(`ptab-${tabs[j].id}`)?.focus()
  }
  const inputLabel = project.inputSource.kind === 'none' ? 'No input yet' : `${project.inputSource.kind}${project.inputSource.label ? ` · ${project.inputSource.label}` : ''}`

  return (
    <PageFrame
      title={project.name}
      lede={project.description || 'No description yet.'}
      actions={!readOnly && (
        <>
          <Button onClick={() => setAdding(true)}><Plus size={16} aria-hidden="true" />Bring in a design</Button>
          <ActionMenu
            label="Project actions"
            items={[
              { label: 'Edit project', icon: <Pencil size={15} />, onSelect: () => setEditing(true) },
              { label: 'Duplicate project', icon: <Copy size={15} />, onSelect: () => { duplicateProject(project.id).then((c) => navigate(`/app/generator/${c.id}`)).catch(() => setNotice({ tone: 'error', text: 'Could not duplicate the project.' })) } },
              { label: 'Export project JSON', icon: <Download size={15} />, onSelect: () => downloadText(`${slug(project.aemComponentName || project.name)}.aemora.json`, exportProjectJson(project)) },
            ]}
          />
        </>
      )}
    >
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

      <dl aria-label="Project details" className="-mt-3 mb-6 flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
        <div><dt className="text-ink-muted">AEM component</dt><dd className="font-semibold text-ink-strong">{project.aemComponentName ? <code className="font-mono text-[13px]">{project.aemComponentName}</code> : 'Not set'}</dd></div>
        <div><dt className="text-ink-muted">Input</dt><dd className="font-semibold text-ink-strong">{inputLabel}</dd></div>
        {!readOnly && <div><dt className="text-ink-muted">Last saved</dt><dd className="font-semibold text-ink-strong"><time dateTime={project.updatedAt}>{relativeTime(project.updatedAt)}</time></dd></div>}
      </dl>

      <div role="tablist" aria-label="Project sections" className="flex gap-1 border-b border-hairline">
        {tabs.map((t, i) => (
          <button
            key={t.id} id={`ptab-${t.id}`} role="tab" type="button" aria-selected={tab === t.id} aria-controls={`ppanel-${t.id}`} tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)} onKeyDown={(e) => onTabKey(e, i)}
            className={`-mb-px flex h-11 cursor-pointer items-center gap-2 border-b-2 px-4 text-[15px] font-bold ${tab === t.id ? 'border-accent text-accent-text' : 'border-transparent text-ink hover:text-ink-strong'}`}
          >
            {t.label}
            {t.badge && <span className={`tabular rounded-full px-2 py-0.5 text-[12px] font-bold ${t.warn ? 'bg-danger-soft text-danger' : 'bg-sand text-ink-muted'}`}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* Both panels stay mounted so the open component and unsaved typing survive a switch of tab. */}
      <div id="ppanel-components" role="tabpanel" aria-labelledby="ptab-components" hidden={tab !== 'components'} className="pt-6">
        <h2 id="comp-h" className="sr-only">Components in this project</h2>
        {notice && !readOnly && (
          <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`mb-4 flex items-start justify-between gap-3 rounded-lg p-3 text-[13px] font-semibold ${notice.tone === 'error' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'}`}>
            <span>{notice.text}</span>
            <button type="button" className="cursor-pointer underline" onClick={() => setNotice(null)}>Dismiss</button>
          </p>
        )}
        {project.components.length === 0 ? (
          <section className="rounded-xl border border-dashed border-hairline-strong p-8">
            <h3 className="text-lg">No components yet</h3>
            <p className="mt-1 max-w-[56ch] text-ink-muted">{readOnly ? 'This project has no components.' : 'Bring in a design: paste JSON or a description, read a Figma file, or annotate a screenshot. Its components will appear here.'}</p>
            {!readOnly && <div className="mt-4"><Button onClick={() => setAdding(true)}><Plus size={16} aria-hidden="true" />Bring in your first design</Button></div>}
          </section>
        ) : (
          <ComponentWorkspace project={project} readOnly={readOnly} focus={focus} />
        )}
      </div>
      <div id="ppanel-export" role="tabpanel" aria-labelledby="ptab-export" hidden={tab !== 'export'} className="pt-6">
        <ExportPanel project={project} readOnly={readOnly} onGoTo={(componentId, view) => { setTab('components'); setFocus({ componentId, view, nonce: Date.now() + Math.random() }) }} />
      </div>

      {!readOnly && (
        <>
          <Drawer open={adding} title="Bring in a design" onClose={() => setAdding(false)} size="wide">
            <InputPanel onAdd={add} busy={busy} />
          </Drawer>
          <EditProjectDrawer open={editing} project={project} onClose={() => setEditing(false)} />
        </>
      )}
    </PageFrame>
  )
}
