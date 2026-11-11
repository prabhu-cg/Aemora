import { useEffect, useMemo, useRef, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import type { ComponentDef, Property } from '../../components/schema'
import type { ResolvedField } from '../../mapping/engine'
import type { ComponentDialog } from '../../dialog/schema'
import type { Project } from '../../projects/schema'
import { effectiveContent, generateForProject } from '../../markup/effective'
import { readDesign } from '../../markup/layers'
import { isInteractionState } from '../../inputs/designmd/convert'
import { renderHtl } from '../../markup/render/render'
import { buildModel, defaultSamples, type SampleValue } from '../../markup/render/samples'
import { paintFrame, STATES, type Background, type PreviewState } from '../paintFrame'

const ZOOMS = [{ v: '1', label: '100%' }, { v: '1.5', label: '150%' }, { v: '2', label: '200%' }, { v: '3', label: '300%' }]

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * Shows what the generated HTL and CSS look like, next to the design they came from.
 * The HTL is rendered here with sample values, and shown in a frame that cannot run script.
 */
export function ComponentPreview({ project, component, fields, dialog }: { project: Project; component: ComponentDef; fields: ResolvedField[]; dialog?: ComponentDialog }) {
  const { html, css, edited } = useMemo(() => {
    const { result } = generateForProject(project, component, fields)
    return {
      html: effectiveContent(project, component, result, 'htl'),
      css: effectiveContent(project, component, result, 'css'),
      edited: ['htl', 'css'].filter((k) => project.markup?.[component.id]?.files?.[k]?.edited),
    }
  }, [project, component, fields])

  const [samples, setSamples] = useState<Record<string, SampleValue>>(() => defaultSamples(component.properties))
  const [state, setState] = useState<PreviewState>('default')
  const [bg, setBg] = useState<Background>('light')
  const [zoom, setZoom] = useState('1')
  const [height, setHeight] = useState(260)
  const [loads, setLoads] = useState(0)
  const frame = useRef<HTMLIFrameElement>(null)

  const rendered = useMemo(() => renderHtl(html, buildModel(component.properties, samples)), [html, component.properties, samples])
  const states = useMemo(() => {
    const pseudo = STATES.filter((s) => css.includes(s.pseudo)).map((s) => ({ id: s.id as PreviewState, label: s.label }))
    // States the design has that are set with a class (selected, active, error ...) come after the pseudo-class ones.
    const named = [...new Set([...css.matchAll(/\.is-([a-z0-9][a-z0-9-]*)/g)].map((m) => m[1]))].map((n) => ({ id: `is-${n}` as PreviewState, label: n.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()) }))
    return [...pseudo, ...named]
  }, [css])
  const shownState: PreviewState = states.some((s) => s.id === state) ? state : 'default'

  useEffect(() => {
    const doc = frame.current?.contentDocument
    if (!doc) return
    const needed = paintFrame(doc, { css, body: rendered.body, state: shownState, bg, zoom })
    if (needed !== null) setHeight(clamp(needed, 260, 800))
  }, [css, rendered, shownState, bg, zoom, loads])

  // Without a layer structure there is nothing to draw but a plain wrapper, and it must not pass for the design.
  const noLayers = !readDesign(component)?.tree
  // A property left out of the dialog cannot be set by authors, so it keeps its default here and has no control.
  const leftOut = new Set(dialog?.excluded ?? [])
  const editable = component.properties.filter((p) => !leftOut.has(p.id) && ['string', 'text', 'richtext', 'link', 'enum', 'boolean', 'number'].includes(p.type))
  const set = (key: string, v: SampleValue) => setSamples((s) => ({ ...s, [key]: v }))
  // A field for hover, focus, disabled ... (from an import made before those were skipped) changes nothing here: the State buttons do.
  const options = editable.filter((p) => p.type === 'enum' && !isInteractionState({ name: p.label || p.key, variantOptions: p.allowedValues }))
  const content = editable.filter((p) => ['string', 'text', 'richtext', 'link', 'number'].includes(p.type))
  const toggles = editable.filter((p) => p.type === 'boolean')

  return (
    <section aria-label="Component preview">
      <p className="max-w-[70ch] text-[13px] text-ink-muted">
        The generated HTL and CSS, rendered with the sample values below{edited.length ? ` and your hand edits to the ${edited.map((k) => k.toUpperCase()).join(' and ')}` : ''}. Fonts and pictures from the design are not loaded here, so text uses a fallback font and icons, avatars and images show as dashed boxes.
      </p>

      {noLayers && (
        <div role="note" className="mt-4 rounded-lg border border-warning bg-warning-soft p-3 text-[13px] text-warning">
          <p className="font-bold">This preview is not the design.</p>
          <p className="mt-1">
            {component.origin.kind === 'figma-rest'
              ? 'This component came from the Figma API, which brings its fields and text but not its layers, colors or spacing, so only a plain wrapper with its text fields can be drawn.'
              : 'This component has no layer structure from the design, so only a plain wrapper with its text fields can be drawn.'}{' '}
            To get the design itself, bring it in with the DesignMD plugin (the DesignMD tab).
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <h3 className="text-[13px] font-extrabold text-ink-strong">Generated</h3>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {states.length > 0 && (
            <span role="group" aria-label="State" className="flex flex-wrap gap-1">
              {[{ id: 'default' as PreviewState, label: 'Default' }, ...states].map((s) => (
                <button key={s.id} type="button" aria-pressed={shownState === s.id} onClick={() => setState(s.id)}
                  className={`h-7 cursor-pointer rounded-md border px-2 text-[12px] font-bold ${shownState === s.id ? 'border-accent bg-accent-tint text-accent-text' : 'border-hairline-strong bg-surface text-ink hover:bg-sand'}`}>{s.label}</button>
              ))}
            </span>
          )}
          <label className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">Zoom
            <select value={zoom} onChange={(e) => setZoom(e.target.value)} className="h-7 rounded-md border border-hairline-strong bg-surface px-1.5 text-[12px]">
              {ZOOMS.map((z) => <option key={z.v} value={z.v}>{z.label}</option>)}
            </select>
          </label>
          <button
            type="button" aria-pressed={bg === 'dark'} aria-label="Dark background" title={bg === 'dark' ? 'Dark background on' : 'Dark background off'}
            onClick={() => setBg((b) => (b === 'dark' ? 'light' : 'dark'))}
            className={`inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border ${bg === 'dark' ? 'border-ink-strong bg-ink-strong text-surface' : 'border-hairline-strong bg-surface text-ink hover:bg-sand'}`}
          >{bg === 'dark' ? <Moon size={14} aria-hidden="true" /> : <Sun size={14} aria-hidden="true" />}</button>
        </div>
      </div>
      {/* No scripts can run in this frame: the sandbox has no allow-scripts, and the content is cleaned before it is shown. */}
      <iframe ref={frame} title="Generated component preview" sandbox="allow-same-origin" onLoad={() => setLoads((n) => n + 1)} style={{ height }} className="mt-2 block w-full rounded-md border border-hairline bg-white" />

      {rendered.problems.length > 0 && (
        <ul role="status" aria-label="Preview limits" className="mt-3 space-y-1">
          {rendered.problems.map((p, i) => <li key={i} className="rounded-lg bg-warning-soft p-2.5 text-[13px] text-warning">{p}</li>)}
        </ul>
      )}

      {editable.length > 0 && (
        <fieldset className="mt-5 rounded-lg border border-hairline p-4">
          <legend className="px-1 text-[13px] font-extrabold text-ink-strong">Sample values</legend>
          <div className="space-y-5">
            <SampleGroup title="Options" items={options} samples={samples} onChange={set} cols="sm:grid-cols-2 lg:grid-cols-3" />
            <SampleGroup title="Content" items={content} samples={samples} onChange={set} cols="sm:grid-cols-2" />
            <SampleGroup title="Show or hide" items={toggles} samples={samples} onChange={set} cols="flex flex-wrap" />
          </div>
          <p className="mt-4 text-[12px] text-ink-muted">These only change the preview. They are not saved and not part of the export.</p>
        </fieldset>
      )}

    </section>
  )
}

/** One kind of sample value, with a small heading. Nothing is shown for a kind the component does not have. */
function SampleGroup({ title, items, samples, onChange, cols }: { title: string; items: Property[]; samples: Record<string, SampleValue>; onChange: (key: string, v: SampleValue) => void; cols: string }) {
  if (!items.length) return null
  const toggles = cols.startsWith('flex')
  return (
    <section aria-label={title}>
      <h4 className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-ink-muted">{title}</h4>
      <div className={toggles ? `${cols} gap-2` : `grid items-start gap-x-4 gap-y-3 ${cols}`}>
        {items.map((p) => <Control key={p.id} property={p} value={samples[p.key]} onChange={(v) => onChange(p.key, v)} />)}
      </div>
    </section>
  )
}

function Control({ property: p, value, onChange }: { property: Property; value: SampleValue | undefined; onChange: (v: SampleValue) => void }) {
  const id = `pv-${p.id}`
  const field = 'mt-1 w-full rounded-lg border border-hairline-strong bg-surface px-3 text-[13px] font-normal'
  if (p.type === 'boolean') {
    return (
      <label className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-[13px] font-bold ${value === true ? 'border-accent bg-accent-tint text-accent-text' : 'border-hairline-strong bg-surface text-ink-strong hover:bg-sand'}`}>
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />{p.label}
      </label>
    )
  }
  // Long copy needs room to read and edit. It spans the whole row.
  const long = p.type === 'text' || p.type === 'richtext'
  return (
    <div className={long ? 'sm:col-span-full' : undefined}>
      <label htmlFor={id} className="block text-[13px] font-bold text-ink-strong">{p.label}</label>
      {long ? (
        <textarea id={id} value={String(value ?? '')} rows={3} spellCheck={false} onChange={(e) => onChange(e.target.value)} className={`${field} resize-y py-2 leading-relaxed`} />
      ) : p.type === 'enum' ? (
        <select id={id} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={`${field} h-9`}>
          {p.allowedValues.map((v) => <option key={v}>{v}</option>)}
        </select>
      ) : (
        <input id={id} type={p.type === 'number' ? 'number' : 'text'} value={String(value ?? '')} spellCheck={false}
          onChange={(e) => onChange(p.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} className={`${field} h-9`} />
      )}
    </div>
  )
}
