import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, CircleAlert, Download, FileArchive, FileJson } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { downloadBytes, downloadText, slug } from '../../../lib/download'
import { exportProjectJson, mutateProject } from '../../projects/repo'
import type { Project } from '../../projects/schema'
import { buildBundle, bundleName, componentExports, hasProblems, problemsOf, type ComponentExport } from '../bundle'
import type { WorkspaceView } from '../../components/inspector/ComponentWorkspace'

const VIEW_LABEL: Record<WorkspaceView, string> = { properties: 'Properties', fields: 'AEM fields', dialog: 'Dialog', preview: 'Preview', xml: 'XML' }

const pill = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold'

function Checks({ e }: { e: ComponentExport }) {
  const c = e.counts
  const gen = c.generatorErrors ? `${c.generatorErrors} to fix` : c.generatorWarnings ? `${c.generatorWarnings} to review` : 'ok'
  const aem = c.aemErrors === null ? 'not checked' : c.aemErrors ? `${c.aemErrors} to fix` : c.aemWarnings ? `${c.aemWarnings} to review` : 'ok'
  const tone = (bad: boolean, warn = false) => (bad ? 'bg-danger-soft text-danger' : warn ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success')
  return (
    <span className="flex flex-wrap gap-1.5">
      <span className={`${pill} ${tone(!c.syntaxOk)}`}>{c.syntaxOk ? <CheckCircle2 size={11} aria-hidden="true" /> : <CircleAlert size={11} aria-hidden="true" />}XML syntax: {c.syntaxOk ? 'ok' : 'broken'}</span>
      <span className={`${pill} ${tone(c.generatorErrors > 0, c.generatorWarnings > 0)}`}>{c.generatorErrors ? <CircleAlert size={11} aria-hidden="true" /> : c.generatorWarnings ? <AlertTriangle size={11} aria-hidden="true" /> : <CheckCircle2 size={11} aria-hidden="true" />}Generator: {gen}</span>
      <span className={`${pill} ${tone(c.aemErrors === null || c.aemErrors > 0, c.aemWarnings !== null && c.aemWarnings > 0)}`}>{c.aemErrors === null || c.aemErrors > 0 ? <CircleAlert size={11} aria-hidden="true" /> : <CheckCircle2 size={11} aria-hidden="true" />}AEM structure: {aem}</span>
    </span>
  )
}

/** Everything that leaves the app from a project: dialog XML (one file or a ready-to-merge ZIP) and the project itself. */
export function ExportPanel({ project, onGoTo, readOnly = false }: { project: Project; onGoTo?: (componentId: string, view: WorkspaceView) => void; readOnly?: boolean }) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const resetXml = (id: string) => {
    setConfirmId(null)
    mutateProject(project.id, (pr) => { const rest = { ...(pr.generatedXml ?? {}) }; delete rest[id]; return { ...pr, generatedXml: rest } })
      .then(() => flash('Reset to the generated XML.')).catch(() => flash('Could not reset the XML.'))
  }
  const items = useMemo(() => componentExports(project), [project])
  const [notice, setNotice] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(''), 3500) }
  const bad = items.filter(hasProblems)

  if (!items.length) {
    return (
      <section aria-label="Export" className="mb-10">
        <h2 className="mb-2 text-xl">Export</h2>
        <p className="text-ink-muted">Nothing to export yet. Add a component first, and its dialog XML will be listed here.</p>
        <div className="mt-3"><Button variant="outline" onClick={() => downloadText(`${slug(project.name)}.aemora.json`, exportProjectJson(project))}><FileJson size={16} aria-hidden="true" />Download project JSON</Button></div>
      </section>
    )
  }

  const zip = () => {
    try { downloadBytes(bundleName(project), buildBundle(project).zip, 'application/zip'); flash(`Downloaded ${bundleName(project)}.`) }
    catch (e) { flash(e instanceof Error ? e.message : 'Could not build the ZIP.') }
  }

  return (
    <section aria-label="Export" className="mb-10">
      <h2 className="text-xl">Export</h2>
      <p className="mt-1 max-w-[70ch] text-[13px] text-ink-muted">
        Each dialog is exported as it appears in the XML tab, including any hand edits. The ZIP follows an AEM project’s folder layout, so you can merge <code className="rounded bg-sand px-1 font-mono text-[12px]">jcr_root</code> into <code className="rounded bg-sand px-1 font-mono text-[12px]">ui.apps/src/main/content</code>.
      </p>

      {bad.length > 0 && (
        <p role="status" className="mt-3 flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-[13px] text-warning">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            <strong>{bad.length} of {items.length} {items.length === 1 ? 'dialog' : 'dialogs'} {bad.length === 1 ? 'has' : 'have'} problems</strong> ({bad.map((b) => b.component.name || 'Untitled').join(', ')}). The details are listed under {bad.length === 1 ? 'that dialog' : 'each dialog'} below, each with a button that opens the place to fix it.
            {' '}<button type="button" className="cursor-pointer font-bold underline" onClick={() => { setOpenId(bad[0].component.id); setTimeout(() => document.getElementById(`export-${bad[0].component.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0) }}>Show the problems</button>.
            You can still export them anyway; the ZIP’s README lists what is wrong.
          </span>
        </p>
      )}

      <ul aria-label="Dialogs to export" className="mt-4 divide-y divide-hairline border-y border-hairline">
        {items.map((e) => (
          <li key={e.component.id} id={`export-${e.component.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
            <div className="min-w-0 flex-1 basis-72">
              <p className="flex flex-wrap items-center gap-2">
                <strong className="text-[15px] font-extrabold tracking-tight text-ink-strong">{e.component.name || 'Untitled component'}</strong>
                {e.edited && <span className="rounded-md bg-accent-tint px-1.5 py-0.5 text-[11px] font-bold text-accent-text">hand-edited XML</span>}
                {e.format === 'inline' && <span className="rounded-md bg-sand px-1.5 py-0.5 text-[11px] font-bold text-ink">inline cq:dialog</span>}
              </p>
              <code className="mt-0.5 block truncate text-[12px] text-ink-muted" title={e.aemPath}>{e.aemPath}</code>
              <div className="mt-1.5"><Checks e={e} /></div>
              {(() => {
                const list = problemsOf(e)
                if (!list.length) return null
                const errors = list.filter((p) => p.level === 'error').length
                return (
                  <details className="mt-2 text-[13px]" open={openId === e.component.id} onToggle={(ev) => { const o = (ev.currentTarget as HTMLDetailsElement).open; setOpenId((cur) => (o ? e.component.id : cur === e.component.id ? null : cur)) }}>
                    <summary className={`cursor-pointer font-bold ${errors ? 'text-danger' : 'text-warning'}`}>{errors ? `${errors} ${errors === 1 ? 'problem' : 'problems'} to fix` : `${list.length} to review`}{errors && list.length > errors ? `, ${list.length - errors} to review` : ''}</summary>
                    <ul className="mt-1.5 space-y-1.5">
                      {list.map((p, i) => (
                        <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className={`text-[11px] font-bold ${p.level === 'error' ? 'text-danger' : 'text-warning'}`}><span className="sr-only">{p.level}: </span>{p.where}</span>
                          <span className="min-w-0 flex-1 basis-60 text-ink">{p.message}{p.detail && <> <code className="text-[11px] text-ink-muted">{p.detail}</code></>}</span>
                          {onGoTo && <button type="button" className="cursor-pointer text-[12px] font-bold text-accent-text underline" onClick={() => onGoTo(e.component.id, p.view)} aria-label={`Fix in ${VIEW_LABEL[p.view]}: ${p.message}`}>Fix in {VIEW_LABEL[p.view]}</button>}
                        </li>
                      ))}
                    </ul>
                    {e.edited && !readOnly && (confirmId === e.component.id ? (
                      <p role="alert" className="mt-2 flex flex-wrap items-center gap-2">Discard the hand edits to {e.component.name || 'this component'}’s XML?
                        <Button size="sm" variant="outline" className="!border-danger !text-danger" onClick={() => resetXml(e.component.id)}>Discard and regenerate</Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>Keep edits</Button>
                      </p>
                    ) : (
                      <div className="mt-2">
                        <Button size="sm" variant="outline" onClick={() => setConfirmId(e.component.id)}>Reset to generated XML</Button>
                        <span className="ml-2 text-[12px] text-ink-muted">This XML has hand edits. Regenerating from the dialog usually clears structure problems.</span>
                      </div>
                    ))}
                  </details>
                )
              })()}
            </div>
            <Button size="sm" variant="outline" onClick={() => { downloadText(e.filename, e.xml, 'application/xml'); flash(`Downloaded ${e.filename}.`) }} aria-label={`Download XML for ${e.component.name || 'component'}`}>
              <Download size={14} aria-hidden="true" />Download XML
            </Button>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={zip}><FileArchive size={16} aria-hidden="true" />Download all as ZIP</Button>
        <Button variant="outline" onClick={() => { downloadText(`${slug(project.name)}.aemora.json`, exportProjectJson(project)); flash('Downloaded the project JSON.') }}><FileJson size={16} aria-hidden="true" />Download project JSON</Button>
        <span role="status" className="text-[13px] font-semibold text-ink-muted">{notice}</span>
      </div>
      <p className="mt-3 max-w-[70ch] text-[12px] text-ink-muted">The project JSON is the complete project: components, mappings, dialog layout, XML edits and screenshots. Import it on the Projects page to carry on editing. It never contains a Figma token.</p>
    </section>
  )
}
