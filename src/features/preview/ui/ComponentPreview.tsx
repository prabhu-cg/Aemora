import { useEffect, useMemo, useRef, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import type { ComponentDef, Property } from '../../components/schema'
import type { ResolvedField } from '../../mapping/engine'
import type { Project } from '../../projects/schema'
import { effectiveContent, generateForProject } from '../../markup/effective'
import { renderHtl } from '../../markup/render/render'
import { buildModel, defaultSamples, type SampleValue } from '../../markup/render/samples'

type PreviewState = 'default' | 'hover' | 'focus' | 'pressed' | 'disabled'
type Background = 'light' | 'dark'
const ZOOMS = [{ v: '1', label: '100%' }, { v: '1.5', label: '150%' }, { v: '2', label: '200%' }, { v: '3', label: '300%' }]

/** The pseudo-class each state stands for. A state button appears only when the CSS styles it. */
const STATES: { id: Exclude<PreviewState, 'default'>; label: string; pseudo: string }[] = [
  { id: 'hover', label: 'Hover', pseudo: ':hover' },
  { id: 'focus', label: 'Focus', pseudo: ':focus-visible' },
  { id: 'pressed', label: 'Pressed', pseudo: ':active' },
  { id: 'disabled', label: 'Disabled', pseudo: ':disabled' },
]

const FRAME_CSS = `html,body{margin:0}body{padding:16px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#fff;color:#101828}body.pv-dark{background:#101828;color:#f2f4f7}body *:empty:not(hr):not(img):not(input):not(br){outline:1px dashed rgba(128,128,128,.7);outline-offset:-1px}`

/** The CSS with each state's pseudo-class swapped for a class, so a state can be shown without hovering. */
function withStateClasses(css: string): string {
  return STATES.reduce((out, s) => out.split(s.pseudo).join(`.is-preview-${s.id}`), css)
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const seen = new WeakSet<Document>()

/**
 * Shows what the generated HTL and CSS look like, next to the design they came from.
 * The HTL is rendered here with sample values, and shown in a frame that cannot run script.
 */
export function ComponentPreview({ project, component, fields }: { project: Project; component: ComponentDef; fields: ResolvedField[] }) {
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
  const available = STATES.filter((s) => css.includes(s.pseudo))
  const shownState = available.some((s) => s.id === state) ? state : 'default'

  useEffect(() => {
    const doc = frame.current?.contentDocument
    const win = doc?.defaultView
    if (!doc?.body || !win) return
    const sheets = [`${FRAME_CSS}body{zoom:${zoom}}`, css, ...(shownState === 'default' ? [] : [withStateClasses(css)])]
    // Stylesheets are set through the CSS object model, which the page's content security policy allows. An inline <style> would be blocked.
    if ('adoptedStyleSheets' in doc && 'CSSStyleSheet' in win) {
      doc.adoptedStyleSheets = sheets.map((text) => { const s = new win.CSSStyleSheet(); s.replaceSync(text); return s })
    } else {
      doc.querySelectorAll('style[data-preview]').forEach((n) => n.remove())
      const style = doc.createElement('style')
      style.setAttribute('data-preview', '')
      style.textContent = sheets.join('\n')
      doc.head.appendChild(style)
    }
    doc.body.className = bg === 'dark' ? 'pv-dark' : ''
    doc.body.replaceChildren(...[...rendered.body.childNodes].map((n) => doc.importNode(n, true)))
    // Icons and pictures are not in the markup, only their names are. Hovering a dashed box says which one.
    doc.querySelectorAll('[data-icon]').forEach((el) => el.setAttribute('title', `Icon: ${el.getAttribute('data-icon')}`))
    const root = doc.body.firstElementChild
    if (root && shownState !== 'default') {
      root.classList.add(`is-preview-${shownState}`)
      if (shownState === 'disabled') root.setAttribute('aria-disabled', 'true')
    }
    if (!seen.has(doc)) {
      seen.add(doc)
      // Links in the markup must not take the frame somewhere else.
      doc.addEventListener('click', (e) => { if ((e.target as Element | null)?.closest?.('a')) e.preventDefault() })
    }
    setHeight(clamp(doc.documentElement.scrollHeight, 260, 800))
  }, [css, rendered, shownState, bg, zoom, loads])

  const asset = project.assets.find((a) => a.id === component.previewAssetId)
  const editable = component.properties.filter((p) => ['string', 'text', 'richtext', 'link', 'enum', 'boolean', 'number'].includes(p.type))
  const set = (key: string, v: SampleValue) => setSamples((s) => ({ ...s, [key]: v }))

  return (
    <section aria-label="Component preview">
      <p className="max-w-[70ch] text-[13px] text-ink-muted">
        The generated HTL and CSS, rendered with the sample values below{edited.length ? ` and your hand edits to the ${edited.map((k) => k.toUpperCase()).join(' and ')}` : ''}. Fonts and pictures from the design are not loaded here, so text uses a fallback font and icons, avatars and images show as dashed boxes.
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <h3 className="text-[13px] font-extrabold text-ink-strong">Generated</h3>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {available.length > 0 && (
            <span role="group" aria-label="State" className="flex gap-1">
              {[{ id: 'default' as const, label: 'Default' }, ...available].map((s) => (
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {editable.map((p) => <Control key={p.id} property={p} value={samples[p.key]} onChange={(v) => set(p.key, v)} />)}
          </div>
          <p className="mt-3 text-[12px] text-ink-muted">These only change the preview. They are not saved and not part of the export.</p>
        </fieldset>
      )}

      {asset && (
        <details className="mt-5 rounded-lg border border-hairline">
          <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-extrabold text-ink-strong">Design</summary>
          <div className="border-t border-hairline bg-sand p-3">
            <img src={asset.dataUrl} alt={`Design of ${component.name}`} className="mx-auto block max-h-96 w-auto max-w-full object-contain" />
          </div>
        </details>
      )}
    </section>
  )
}

function Control({ property: p, value, onChange }: { property: Property; value: SampleValue | undefined; onChange: (v: SampleValue) => void }) {
  const id = `pv-${p.id}`
  const field = 'mt-1 w-full rounded-lg border border-hairline-strong bg-surface px-3 text-[13px] font-normal'
  if (p.type === 'boolean') {
    return <label className="flex cursor-pointer items-center gap-2 pt-6 text-[13px] font-bold text-ink-strong"><input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />{p.label}</label>
  }
  // Long copy needs room to read and edit. It spans the whole row.
  const long = p.type === 'text' || p.type === 'richtext'
  return (
    <div className={long ? 'sm:col-span-2 lg:col-span-3' : undefined}>
      <label htmlFor={id} className="text-[13px] font-bold text-ink-strong">{p.label}</label>
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
