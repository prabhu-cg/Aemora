import { useEffect, useRef, useState, type DragEvent, type PointerEvent } from 'react'
import { ClipboardPaste, Plus, Trash2, Upload } from 'lucide-react'
import { imageFrom, readClipboardImage } from '../clipboardImage'
import { Button } from '../../../components/ui/Button'
import { TextField } from '../../../components/ui/Field'
import { newId } from '../../../lib/id'
import { inferPropertyType } from '../../components/detect'
import { COMPONENT_TYPES, PROPERTY_TYPES, type Asset } from '../../components/schema'
import { readScreenshot } from '../screenshot'
import { InputError, type ImportResult } from '../types'
import { buildScreenshotResult, clampRegion, emptyDraft, newDraftProperty, type Draft, type Region } from '../screenshotDraft'

const sel = 'h-9 rounded-lg border border-hairline-strong bg-surface px-2 text-[13px] text-ink-strong'
const num = 'h-8 w-16 rounded-lg border border-hairline-strong bg-surface px-2 text-[13px] tabular'

export function ScreenshotPanel({ onResult, incoming }: { onResult: (r: ImportResult) => void; /** An image pasted while another tab was showing. */ incoming?: { file: File; n: number } | null }) {
  const [asset, setAsset] = useState<Asset | null>(null)
  const [regions, setRegions] = useState<Region[]>([])
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [errors, setErrors] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const [rubber, setRubber] = useState<Region | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [over, setOver] = useState(false)
  const pick = async (f?: File) => {
    if (!f) return
    try {
      setAsset(await readScreenshot(f)); setRegions([]); setErrors([])
    } catch (e) {
      setErrors([e instanceof InputError ? e.message : 'Could not read that image.'])
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  useEffect(() => {
    if (!incoming) return
    let live = true
    readScreenshot(incoming.file)
      .then((a) => { if (live) { setAsset(a); setRegions([]); setErrors([]) } })
      .catch((e) => { if (live) setErrors([e instanceof InputError ? e.message : 'Could not read that image.']) })
    return () => { live = false }
  }, [incoming])

  const pasteButton = async () => {
    try {
      const f = await readClipboardImage()
      if (f) await pick(f)
      else setErrors(['There is no image on the clipboard. Copy a screenshot first, then try again.'])
    } catch {
      setErrors(['The browser did not allow reading the clipboard. Copy a screenshot, then press ⌘V or Ctrl+V while this panel is open.'])
    }
  }
  const drop = (e: DragEvent) => {
    e.preventDefault(); setOver(false)
    const f = imageFrom(e.dataTransfer)
    if (f) void pick(f)
    else setErrors(['That is not an image. Drop a PNG, JPG or WebP screenshot.'])
  }

  const pct = (e: PointerEvent) => {
    const r = frame.current!.getBoundingClientRect()
    return { x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)), y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)) }
  }
  const down = (e: PointerEvent) => { start.current = pct(e); (e.target as Element).setPointerCapture?.(e.pointerId) }
  const move = (e: PointerEvent) => {
    if (!start.current) return
    const p = pct(e), s = start.current
    setRubber({ id: 'tmp', x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
  }
  const up = () => {
    if (rubber && rubber.w > 1.5 && rubber.h > 1.5) {
      const r = clampRegion({ ...rubber, id: newId() })
      setRegions((rs) => [...rs, r]); setSelected(r.id)
    }
    start.current = null; setRubber(null)
  }

  const setRegion = (id: string, patch: Partial<Region>) => setRegions((rs) => rs.map((r) => (r.id === id ? clampRegion({ ...r, ...patch }) : r)))
  const removeRegion = (id: string) => {
    setRegions((rs) => rs.filter((r) => r.id !== id))
    setDraft((d) => ({ ...d, properties: d.properties.map((p) => (p.regionId === id ? { ...p, regionId: '' } : p)) }))
  }
  const setProp = (id: string, patch: Partial<Draft['properties'][number]>) =>
    setDraft((d) => ({ ...d, properties: d.properties.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))

  const missing = [!asset && 'a screenshot', !draft.name.trim() && 'a component name', !draft.properties.some((p) => p.name.trim()) && 'at least one named property'].filter((x): x is string => !!x)
  const ready = missing.length === 0

  const review = () => {
    try { onResult(buildScreenshotResult(draft, regions, asset)); setErrors([]) }
    catch (e) { setErrors(e instanceof InputError ? e.issues : ['Could not build the component.']) }
  }

  return (
    <div>
      <p className="mb-3 max-w-[70ch] text-[13px] text-ink-muted">
        Upload a screenshot, mark the parts of it that authors will control, and describe each property yourself. Aemora does not read text or Figma data from images, so everything here is entered by hand.
      </p>
      <div className="flex flex-col gap-8">
        <div>
          {asset ? (
            <>
              <div
                ref={frame}
                className="relative w-full touch-none select-none overflow-hidden rounded-lg border border-hairline-strong bg-sand"
                onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
                style={{ cursor: 'crosshair' }}
              >
                <img src={asset.dataUrl} alt="Uploaded screenshot to annotate" className="block w-full" draggable={false} />
                {[...regions, ...(rubber ? [rubber] : [])].map((r, i) => (
                  <div
                    key={r.id}
                    className={`pointer-events-none absolute border-2 ${r.id === selected ? 'border-accent bg-accent/15' : 'border-accent-text bg-accent/5'}`}
                    style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }}
                  >
                    {r.id !== 'tmp' && <span className="absolute -top-px -left-px rounded-br-md bg-accent px-1.5 text-[11px] font-extrabold text-on-accent tabular">{i + 1}</span>}
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[12px] text-ink-muted">Drag on the image to mark a region. You can also add regions and set their position with the numbers on the right.</p>
            </>
          ) : (
            <button
              type="button" onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={drop}
              className={`flex h-44 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-ink hover:bg-sand ${over ? 'border-accent bg-accent/5' : 'border-hairline-strong'}`}
            >
              <Upload size={22} aria-hidden="true" />
              <span className="font-bold text-ink-strong">Choose a screenshot</span>
              <span className="text-[13px] text-ink-muted">or drop one here. PNG, JPG or WebP, up to 8 MB</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Choose a screenshot" onChange={(e) => pick(e.target.files?.[0])} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {asset && <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>Replace image</Button>}
            <Button size="sm" variant="outline" onClick={pasteButton}><ClipboardPaste size={14} aria-hidden="true" />Paste from clipboard</Button>
            <span className="text-[12px] text-ink-muted">or press ⌘V / Ctrl+V anywhere in this panel</span>
          </div>

          {regions.length > 0 && (
            <ul aria-label="Regions" className="mt-4 space-y-1.5">
              {regions.map((r, i) => (
                <li key={r.id} className={`flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[13px] ${r.id === selected ? 'border-accent' : 'border-hairline'}`} onClick={() => setSelected(r.id)}>
                  <strong className="w-5 tabular">{i + 1}</strong>
                  {(['x', 'y', 'w', 'h'] as const).map((k) => (
                    <label key={k} className="flex items-center gap-1 text-ink-muted">{k.toUpperCase()}
                      <input type="number" min={0} max={100} step={1} className={num} aria-label={`Region ${i + 1} ${k}`} value={Math.round(r[k] * 10) / 10} onChange={(e) => setRegion(r.id, { [k]: Number(e.target.value) })} />
                    </label>
                  ))}
                  <span className="text-ink-muted">%</span>
                  <button type="button" aria-label={`Remove region ${i + 1}`} className="ml-auto rounded-full p-1.5 text-ink-muted hover:bg-sand cursor-pointer" onClick={() => removeRegion(r.id)}><Trash2 size={15} aria-hidden="true" /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-1">
            <Button size="sm" variant="outline" disabled={!asset} aria-describedby="region-help" onClick={() => { const r = { id: newId(), x: 10, y: 10, w: 30, h: 20 }; setRegions((rs) => [...rs, r]); setSelected(r.id) }}><Plus size={14} aria-hidden="true" />Add region</Button>
            <p id="region-help" className="min-w-0 max-w-[52ch] flex-1 basis-60 text-[12px] text-ink-muted">
              {asset
                ? 'A region is a box you draw on the screenshot around something authors will edit, such as a title or a button label. Link a property to it with the Region menu below, and the box is kept with that property as a visual reference. It does not change the XML.'
                : 'Choose a screenshot first. Regions are boxes you draw on it around the parts authors will edit.'}
            </p>
          </div>
        </div>

        <div>
          <div className="flex flex-col gap-3">
            <TextField label="Component name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Card" />
            <label className="block text-[13px] font-bold text-ink-strong">Component type
              <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as Draft['type'] })} className={`${sel} mt-1 block w-full`}>
                <option value="auto">Detect from name</option>
                {COMPONENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>

          <h3 className="mt-5 text-[13px] font-extrabold text-ink-strong">Properties</h3>
          <ul aria-label="Properties" className="mt-2 space-y-3">
            {draft.properties.map((p, i) => (
              <li key={p.id} className="rounded-lg border border-hairline p-3">
                <div className="flex gap-2">
                  <input aria-label={`Property ${i + 1} name`} placeholder="Name" value={p.name} className={`${sel} min-w-0 flex-1`}
                    onChange={(e) => setProp(p.id, { name: e.target.value, ...(p.type === 'string' ? { type: inferPropertyType(e.target.value) } : {}) })} />
                  <select aria-label={`Property ${i + 1} type`} value={p.type} onChange={(e) => setProp(p.id, { type: e.target.value as typeof p.type })} className={sel}>
                    {PROPERTY_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                  <button type="button" aria-label={`Remove property ${i + 1}`} className="rounded-full p-1.5 text-ink-muted hover:bg-sand cursor-pointer" onClick={() => setDraft({ ...draft, properties: draft.properties.filter((x) => x.id !== p.id) })}><Trash2 size={15} aria-hidden="true" /></button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={p.required} onChange={(e) => setProp(p.id, { required: e.target.checked })} />Required</label>
                  <input aria-label={`Property ${i + 1} default`} placeholder="Default" value={p.defaultValue} onChange={(e) => setProp(p.id, { defaultValue: e.target.value })} className={`${sel} w-28`} />
                  {p.type === 'enum' && <input aria-label={`Property ${i + 1} allowed values`} placeholder="small, medium, large" value={p.values} onChange={(e) => setProp(p.id, { values: e.target.value })} className={`${sel} min-w-0 flex-1`} />}
                  <select aria-label={`Property ${i + 1} region`} value={p.regionId} onChange={(e) => setProp(p.id, { regionId: e.target.value })} className={sel}>
                    <option value="">No region</option>
                    {regions.map((r, k) => <option key={r.id} value={r.id}>Region {k + 1}</option>)}
                  </select>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-2"><Button size="sm" variant="outline" onClick={() => setDraft({ ...draft, properties: [...draft.properties, newDraftProperty()] })}><Plus size={14} aria-hidden="true" />Add property</Button></div>

          {errors.length > 0 && (
            <ul role="alert" className="mt-4 list-disc space-y-0.5 rounded-lg bg-danger-soft p-3 pl-7 text-[13px] text-danger">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          )}
          <div className="mt-4">
            <Button onClick={review} disabled={!ready} aria-describedby={ready ? undefined : 'screenshot-missing-hint'}>Review component</Button>
            {!ready && <p id="screenshot-missing-hint" className="mt-2 text-[12px] text-ink-muted">Still needed: {missing.join(', ')}.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
