import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, CircleAlert, ClipboardCopy, Download, FileCode2, RotateCcw, Wand2 } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { downloadText } from '../../../lib/download'
import { kebab } from '../../../lib/kebab'
import type { ComponentDef } from '../../components/schema'
import type { ComponentDialog } from '../../dialog/schema'
import type { ResolvedField } from '../../mapping/engine'
import type { Project } from '../../projects/schema'
import { generateXml, type XmlFormat } from '../build'
import { formatXml } from '../format'
import { validateAll } from '../validate'
import { XmlEditor } from './XmlEditor'

interface Props {
  project: Project
  component: ComponentDef
  dialog: ComponentDialog
  fields: ResolvedField[]
  readOnly?: boolean
  /** Save or clear the stored hand-edited XML for this component. */
  onStore: (entry: { xml: string; base: string; format: XmlFormat } | null) => Promise<unknown> | void
}

const Badge = ({ ok, warn, label }: { ok: boolean; warn?: boolean; label: string }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold ${ok ? (warn ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success') : 'bg-danger-soft text-danger'}`}>
    {ok ? (warn ? <AlertTriangle size={13} aria-hidden="true" /> : <CheckCircle2 size={13} aria-hidden="true" />) : <CircleAlert size={13} aria-hidden="true" />}{label}
  </span>
)

export function XmlPanel({ project, component, dialog, fields, readOnly = false, onStore }: Props) {
  const stored = project.generatedXml?.[component.id]
  const [format, setFormat] = useState<XmlFormat>(stored?.format ?? 'standalone')
  const [editing, setEditing] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [notice, setNotice] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [draft, setDraft] = useState<string | null>(null)

  const folder = project.components.length === 1 && project.aemComponentName ? project.aemComponentName : kebab(component.name, 'component')
  const generated = useMemo(
    () => generateXml({ component, dialog, fields, projectName: project.name, componentFolder: folder, format }),
    [component, dialog, fields, project.name, folder, format],
  )
  const edited = !!stored?.edited
  const shown = draft ?? (edited ? stored!.xml : generated)
  const stale = edited && stored!.base !== generated
  const validation = useMemo(() => validateAll(shown, component, dialog, fields, !!project.aemComponentName || project.components.length > 1), [shown, component, dialog, fields, project.aemComponentName, project.components.length])

  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(''), 2500) }
  const change = (xml: string) => {
    setDraft(xml)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      // Only drop the local draft if nothing newer has been typed while the save ran.
      void Promise.resolve(onStore({ xml, base: edited ? stored!.base : generated, format })).finally(() => setDraft((d) => (d === xml ? null : d)))
    }, 350)
  }
  const reset = () => { clearTimeout(timer.current); setDraft(null); setConfirmReset(false); onStore(null); setNotice(''); flash(edited ? 'Reset to the generated version.' : 'Regenerated from the current dialog.') }

  const copy = async () => {
    try { await navigator.clipboard.writeText(shown); flash('Copied the XML.') } catch { flash('Copy was blocked by the browser. Select the text and copy it instead.') }
  }
  const filename = format === 'standalone' ? `${folder}.cq_dialog.content.xml` : `${folder}.content.xml`
  const target = `/apps/${kebab(project.name, '<project>')}/components/${folder}/${format === 'standalone' ? '_cq_dialog/.content.xml' : '.content.xml'}`
  const v = validation
  const aemErrors = v.aem?.filter((i) => i.level === 'error').length ?? 0
  const aemWarn = v.aem?.filter((i) => i.level === 'warning').length ?? 0
  const genErrors = v.generator.filter((i) => i.level === 'error').length
  const genWarn = v.generator.length - genErrors

  const doFormat = () => {
    try { change(formatXml(shown)); flash('Formatted.') } catch (e) { flash(e instanceof Error ? e.message : 'Could not format the XML.') }
  }

  return (
    <section aria-label="Dialog XML">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <fieldset className="flex items-center gap-4" disabled={edited || readOnly}>
          <legend className="sr-only">Output format</legend>
          {([['standalone', 'Standalone _cq_dialog file'], ['inline', 'Inline cq:dialog']] as const).map(([id, label]) => (
            <label key={id} className="flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-ink-strong">
              <input type="radio" name="xml-format" checked={format === id} onChange={() => { setFormat(id); setDraft(null) }} />{label}
            </label>
          ))}
        </fieldset>
        <fieldset className="flex items-center gap-4" disabled={readOnly}>
          <legend className="sr-only">Mode</legend>
          {([[false, 'Read-only'], [true, 'Edit XML']] as const).map(([val, label]) => (
            <label key={label} className="flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-ink-strong">
              <input type="radio" name="xml-mode" checked={editing === val} onChange={() => setEditing(val)} />{label}
            </label>
          ))}
        </fieldset>
      </div>
      {edited && !readOnly && <p className="mt-1 text-[12px] text-ink-muted">The output format is locked while the XML has hand edits. Reset to the generated version to change it.</p>}

      <p className="mt-3 text-[13px] text-ink-muted"><FileCode2 size={14} className="mr-1 inline" aria-hidden="true" />Save as <code className="rounded bg-sand px-1 py-0.5 font-mono text-[12px] text-ink-strong">{target}</code></p>

      {stale && (
        <p role="status" className="mt-3 rounded-lg bg-warning-soft p-3 text-[13px] text-warning">
          <strong>This XML has hand edits, and the dialog design has changed since.</strong> The XML below does not include the newer design changes. Reset to the generated version to pick them up.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2" role="toolbar" aria-label="XML actions">
        <Button size="sm" variant="outline" onClick={copy}><ClipboardCopy size={14} aria-hidden="true" />Copy</Button>
        <Button size="sm" variant="outline" onClick={() => downloadText(filename, shown, 'application/xml')}><Download size={14} aria-hidden="true" />Download</Button>
        <Button size="sm" variant="outline" onClick={doFormat} disabled={!editing || readOnly}><Wand2 size={14} aria-hidden="true" />Format</Button>
        {confirmReset ? (
          <span role="alert" className="flex items-center gap-2 text-[13px]">Discard your edits?
            <Button size="sm" variant="outline" className="!border-danger !text-danger" onClick={reset}>Discard</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>Keep</Button>
          </span>
        ) : (
          <Button size="sm" variant="outline" disabled={readOnly} onClick={() => (edited ? setConfirmReset(true) : reset())}>
            <RotateCcw size={14} aria-hidden="true" />{edited ? 'Reset to generated version' : 'Regenerate'}
          </Button>
        )}
        <span role="status" className="text-[13px] font-semibold text-ink-muted">{notice}</span>
      </div>

      <div className="mt-3">
        <XmlEditor value={shown} onChange={change} readOnly={!editing || readOnly} label={editing ? 'Edit dialog XML' : 'Dialog XML (read-only)'} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2" aria-label="Validation summary" role="group">
        <Badge ok={v.syntax.ok} label={v.syntax.ok ? 'XML syntax: well-formed' : 'XML syntax: not well-formed'} />
        <Badge ok={genErrors === 0} warn={genErrors === 0 && genWarn > 0} label={`Generator: ${genErrors ? `${genErrors} to fix` : genWarn ? `${genWarn} to review` : 'no problems'}`} />
        <Badge ok={!!v.aem && aemErrors === 0} warn={!!v.aem && aemErrors === 0 && aemWarn > 0} label={v.aem ? `AEM structure: ${aemErrors ? `${aemErrors} to fix` : aemWarn ? `${aemWarn} to review` : 'no problems'}` : 'AEM structure: not checked'} />
      </div>

      <div className="mt-4 divide-y divide-hairline border-y border-hairline">
        <section aria-label="XML syntax validation" className="py-3">
          <h3 className="text-base">1. XML syntax</h3>
          <p className="text-[12px] text-ink-muted">Is the text well-formed XML? Checked with the browser's XML parser. DOCTYPE and ENTITY declarations are refused.</p>
          {v.syntax.ok ? <p className="mt-1 flex items-center gap-1.5 text-[13px] text-success"><CheckCircle2 size={14} aria-hidden="true" />Well-formed.</p>
            : <p role="alert" className="mt-1 text-[13px] font-semibold text-danger">{v.syntax.line ? `Line ${v.syntax.line}${v.syntax.column ? `, column ${v.syntax.column}` : ''}: ` : ''}{v.syntax.message}</p>}
        </section>
        <section aria-label="Generator validation" className="py-3">
          <h3 className="text-base">2. Generator checks</h3>
          <p className="text-[12px] text-ink-muted">Is Aemora's own model complete and consistent: properties, field settings and the dialog layout? {edited && 'This checks the model, not your hand edits.'}</p>
          {v.generator.length === 0 ? <p className="mt-1 flex items-center gap-1.5 text-[13px] text-success"><CheckCircle2 size={14} aria-hidden="true" />No problems.</p> : (
            <ul className="mt-1 space-y-1">
              {v.generator.map((i, k) => <li key={k} className={`text-[13px] ${i.level === 'error' ? 'text-danger' : 'text-warning'}`}><span className="sr-only">{i.level}: </span>{i.message}</li>)}
            </ul>
          )}
        </section>
        <section aria-label="AEM compatibility validation" className="py-3">
          <h3 className="text-base">3. AEM compatibility (static)</h3>
          <p className="text-[12px] text-ink-muted">Does the XML follow the Granite UI structure Aemora knows? <strong>This is not a test in AEM.</strong> Only a real Cloud Service environment can confirm the dialog works, so test it on a development instance before relying on it.</p>
          {!v.aem ? <p className="mt-1 text-[13px] text-ink-muted">Not checked: fix the XML syntax first.</p>
            : v.aem.length === 0 ? <p className="mt-1 flex items-center gap-1.5 text-[13px] text-success"><CheckCircle2 size={14} aria-hidden="true" />No structural problems found.</p> : (
              <ul className="mt-1 space-y-1">
                {v.aem.map((i, k) => <li key={k} className={`text-[13px] ${i.level === 'error' ? 'text-danger' : 'text-warning'}`}><span className="sr-only">{i.level}: </span>{i.message} <code className="text-[11px] text-ink-muted">{i.path}</code></li>)}
              </ul>
            )}
        </section>
      </div>
    </section>
  )
}
