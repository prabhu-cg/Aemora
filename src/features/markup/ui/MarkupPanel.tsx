import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, CircleAlert, ClipboardCopy, Download, FileCode2, Info, RotateCcw, Settings2 } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { downloadText } from '../../../lib/download'
import { kebab } from '../../../lib/kebab'
import type { ComponentDef } from '../../components/schema'
import type { ResolvedField } from '../../mapping/engine'
import type { MarkupSettings, Project } from '../../projects/schema'
import type { EditorLanguage } from '../../xml/format'
import { XmlEditor } from '../../xml/ui/XmlEditor'
import { generateMarkup } from '../index'
import { markupTarget } from '../paths'
import type { MarkupFileKind } from '../types'
import { validateMarkup } from '../validate'

interface Props {
  project: Project
  component: ComponentDef
  fields: ResolvedField[]
  readOnly?: boolean
  /** Save or clear the stored hand-edited content of one file. */
  onStore: (kind: MarkupFileKind, entry: { content: string; base: string } | null) => Promise<unknown> | void
  onSettings: (patch: Partial<MarkupSettings>) => Promise<unknown> | void
}

const FILES: { kind: MarkupFileKind; label: string }[] = [
  { kind: 'htl', label: 'HTL' },
  { kind: 'css', label: 'CSS' },
  { kind: 'model', label: 'Sling Model' },
  { kind: 'component', label: '.content.xml' },
  { kind: 'editConfig', label: 'Edit config' },
]

const SETTING_RULES = {
  cssPrefix: { label: 'CSS prefix', ok: (v: string) => /^[a-z][a-z0-9-]*$|^$/.test(v), hint: 'Lowercase letters, numbers and hyphens, e.g. cmp. May be empty.' },
  javaPackage: { label: 'Java package', ok: (v: string) => /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(v), hint: 'Lowercase, dot separated, e.g. com.acme.core.models.' },
  group: { label: 'Component group', ok: (v: string) => v.trim().length > 0, hint: 'The group name shown in the AEM editor.' },
} as const

const languageFor = (k: MarkupFileKind): EditorLanguage => (k === 'htl' || k === 'component' || k === 'editConfig' ? 'xml' : 'plain')
const mimeFor = (k: MarkupFileKind) => (k === 'htl' ? 'text/html' : k === 'css' ? 'text/css' : k === 'model' ? 'text/x-java-source' : 'application/xml')

export function MarkupPanel({ project, component, fields, readOnly = false, onStore, onSettings }: Props) {
  const [kind, setKind] = useState<MarkupFileKind>('htl')
  const [editing, setEditing] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [notice, setNotice] = useState('')
  const [drafts, setDrafts] = useState<Partial<Record<MarkupFileKind, string>>>({})
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const settings: MarkupSettings = project.markupSettings
  const stored = useMemo(() => project.markup?.[component.id]?.files ?? {}, [project.markup, component.id])
  const folder = project.components.length === 1 && project.aemComponentName ? project.aemComponentName : kebab(component.name, 'component')
  const jcrNames = useMemo(() => Object.fromEntries(fields.map((f) => [f.key, f.name.replace(/^\.\//, '')])), [fields])
  const generated = useMemo(() => generateMarkup(component, { ...settings, folder }, jcrNames), [component, settings, folder, jcrNames])

  const contentOf = (k: MarkupFileKind) => {
    const g = generated.files.find((f) => f.kind === k)!
    return drafts[k] ?? (stored[k]?.edited ? stored[k]!.content : g.content)
  }
  const file = generated.files.find((f) => f.kind === kind)!
  const edited = !!stored[kind]?.edited
  const shown = contentOf(kind)
  const stale = edited && stored[kind]!.base !== file.content
  const editedKinds = new Set(FILES.filter((f) => stored[f.kind]?.edited).map((f) => f.kind))

  // The checks run on what will actually be exported, hand edits included.
  const problems = useMemo(
    () => validateMarkup({ ...generated, files: generated.files.map((f) => ({ ...f, content: drafts[f.kind] ?? (stored[f.kind]?.edited ? stored[f.kind]!.content : f.content) })) }),
    [generated, drafts, stored],
  )

  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(''), 2500) }
  const change = (content: string) => {
    const k = kind
    setDrafts((d) => ({ ...d, [k]: content }))
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const base = stored[k]?.edited ? stored[k]!.base : file.content
      void Promise.resolve(onStore(k, { content, base })).finally(() => setDrafts((d) => (d[k] === content ? { ...d, [k]: undefined } : d)))
    }, 350)
  }
  const reset = () => {
    clearTimeout(timer.current)
    setDrafts((d) => ({ ...d, [kind]: undefined }))
    setConfirmReset(false)
    void onStore(kind, null)
    flash(edited ? 'Reset to the generated version.' : 'Regenerated from the current design.')
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(shown); flash('Copied.') } catch { flash('Copy was blocked by the browser. Select the text and copy it instead.') }
  }

  const warnings = generated.notes.filter((n) => n.level === 'warning')
  const infos = generated.notes.filter((n) => n.level === 'info')

  return (
    <section aria-label="Component markup">
      <p className="max-w-[70ch] text-[13px] text-ink-muted">
        HTL, CSS, a Sling Model and the component definition, generated from the design. The same design always gives the same files. Edit any file by hand, and regenerate to start over.
      </p>

      <SettingsRow settings={settings} readOnly={readOnly} onChange={onSettings} />

      <div role="group" aria-label="Markup file" className="mt-4 flex flex-wrap gap-1 border-b border-hairline">
        {FILES.map((f) => (
          <button
            key={f.kind} type="button" aria-pressed={kind === f.kind}
            onClick={() => { setKind(f.kind); setConfirmReset(false); setNotice('') }}
            className={`-mb-px h-9 cursor-pointer border-b-2 px-3 text-[14px] font-bold ${kind === f.kind ? 'border-accent text-accent-text' : 'border-transparent text-ink hover:text-ink-strong'}`}
          >
            {f.label}{editedKinds.has(f.kind) && ' '}{editedKinds.has(f.kind) && <span className="ml-1.5 rounded-full bg-warning-soft px-1.5 py-0.5 text-[11px] font-bold text-warning">edited</span>}
          </button>
        ))}
      </div>

      <p className="mt-3 text-[13px] text-ink-muted">
        <FileCode2 size={14} className="mr-1 inline" aria-hidden="true" />Save as{' '}
        <code className="rounded bg-sand px-1 py-0.5 font-mono text-[12px] text-ink-strong">{markupTarget(project.name, folder, settings.javaPackage, file)}</code>
      </p>

      {stale && (
        <p role="status" className="mt-3 rounded-lg bg-warning-soft p-3 text-[13px] text-warning">
          <strong>This file has hand edits, and the design or settings have changed since.</strong> It does not include the newer changes. Reset to the generated version to pick them up.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2" role="toolbar" aria-label="File actions">
        <fieldset className="mr-2 flex items-center gap-3" disabled={readOnly}>
          <legend className="sr-only">Mode</legend>
          {([[false, 'Read-only'], [true, 'Edit']] as const).map(([val, label]) => (
            <label key={label} className="flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-ink-strong">
              <input type="radio" name="markup-mode" checked={editing === val} onChange={() => setEditing(val)} />{label}
            </label>
          ))}
        </fieldset>
        <Button size="sm" variant="outline" onClick={copy}><ClipboardCopy size={14} aria-hidden="true" />Copy</Button>
        <Button size="sm" variant="outline" onClick={() => downloadText(file.name, shown, mimeFor(kind))}><Download size={14} aria-hidden="true" />Download</Button>
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
        <XmlEditor value={shown} onChange={change} readOnly={!editing || readOnly} label={`${editing ? 'Edit' : 'View'} ${FILES.find((f) => f.kind === kind)!.label} (${file.name})`} language={languageFor(kind)} />
      </div>

      <div className="mt-6 divide-y divide-hairline border-y border-hairline">
        <section aria-label="Consistency checks" className="py-3">
          <h3 className="text-base">Consistency checks</h3>
          <p className="text-[12px] text-ink-muted">Are the files well-formed and do they agree with each other: balanced tags, every value the HTL uses has a getter in the model. This is not a test in AEM.</p>
          {problems.length === 0
            ? <p className="mt-1 flex items-center gap-1.5 text-[13px] text-success"><CheckCircle2 size={14} aria-hidden="true" />No problems found.</p>
            : <ul className="mt-1 space-y-1">{problems.map((p, i) => <li key={i} className="flex items-start gap-1.5 text-[13px] text-danger"><CircleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" /><span>{p}</span></li>)}</ul>}
        </section>

        <section aria-label="What was inferred or left out" className="py-3">
          <h3 className="text-base">What was inferred or left out <span className="tabular text-ink-muted">({generated.notes.length})</span></h3>
          <p className="text-[12px] text-ink-muted">These describe the generated version, before any hand edits. Nothing the design contained is dropped without being listed here.</p>
          {generated.notes.length === 0
            ? <p className="mt-1 flex items-center gap-1.5 text-[13px] text-success"><CheckCircle2 size={14} aria-hidden="true" />Nothing to report.</p>
            : (
              <ul className="mt-2 space-y-1.5">
                {[...warnings, ...infos].map((n, i) => (
                  <li key={i} className={`flex gap-2 rounded-lg p-2.5 text-[13px] ${n.level === 'warning' ? 'bg-warning-soft text-warning' : 'bg-info-soft text-info'}`}>
                    {n.level === 'warning' ? <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> : <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />}
                    <span><span className="sr-only">{n.level}: </span>{n.layer && <strong>{n.layer}. </strong>}{n.message}</span>
                  </li>
                ))}
              </ul>
            )}
        </section>
      </div>
    </section>
  )
}

function SettingsRow({ settings, readOnly, onChange }: { settings: MarkupSettings; readOnly: boolean; onChange: (patch: Partial<MarkupSettings>) => Promise<unknown> | void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<MarkupSettings>(settings)
  const keys = Object.keys(SETTING_RULES) as (keyof MarkupSettings)[]
  const set = (k: keyof MarkupSettings, v: string) => {
    setDraft((d) => ({ ...d, [k]: v }))
    if (SETTING_RULES[k].ok(v)) void onChange({ [k]: v })
  }
  return (
    <div className="mt-3">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-bold text-accent-text hover:underline">
        <Settings2 size={14} aria-hidden="true" />Naming settings
        <span className="font-normal text-ink-muted">prefix {settings.cssPrefix || '(none)'} · {settings.javaPackage} · group {settings.group}</span>
      </button>
      {open && (
        <div className="mt-2 grid gap-3 rounded-lg border border-hairline p-3 sm:grid-cols-3">
          {keys.map((k) => {
            const invalid = !SETTING_RULES[k].ok(draft[k])
            return (
              <div key={k}>
                <label htmlFor={`mset-in-${k}`} className="text-[13px] font-bold text-ink-strong">{SETTING_RULES[k].label}</label>
                <input
                  id={`mset-in-${k}`} value={draft[k]} readOnly={readOnly} aria-invalid={invalid} aria-describedby={`mset-${k}`} spellCheck={false}
                  onChange={(e) => set(k, e.target.value)}
                  className={`mt-1 h-9 w-full rounded-lg border bg-surface px-3 font-mono text-[13px] ${invalid ? 'border-danger' : 'border-hairline-strong'}`}
                />
                <span id={`mset-${k}`} className={`mt-1 block text-[12px] ${invalid ? 'text-danger' : 'text-ink-muted'}`}>{invalid ? `Not saved. ${SETTING_RULES[k].hint}` : SETTING_RULES[k].hint}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
