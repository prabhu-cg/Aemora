import { useRef } from 'react'
import { ExternalLink, ImagePlus, ImageOff } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { figmaOpenUrl } from '../inputs/figma/previews'
import type { Asset, ComponentDef } from './schema'

/**
 * The picture a component came from: a Figma render, or the screenshot someone annotated.
 * It is for reference only. Fields are never read from it.
 */
export function DesignPreview({ component, assets, readOnly = false, onRemove, onAdd }: { component: ComponentDef; assets: Asset[]; readOnly?: boolean; onRemove?: () => void; /** Given to show the design as a pane next to the dialog preview, with a way to add or replace the image. */ onAdd?: (file: File) => void }) {
  const asset = assets.find((a) => a.id === component.previewAssetId)
  const pane = !!onAdd
  const picker = useRef<HTMLInputElement>(null)
  const chooser = pane && !readOnly && (
    <>
      <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-label="Design image file"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onAdd(f) }} />
      <Button size="sm" variant="outline" onClick={() => picker.current?.click()}><ImagePlus size={14} aria-hidden="true" />{asset ? 'Replace image' : 'Add design image'}</Button>
    </>
  )
  if (!asset && pane) {
    return (
      <section aria-label="Design preview" className="rounded-xl border border-dashed border-hairline-strong p-5">
        <h3 className="text-base">Design preview</h3>
        <p className="mt-2 max-w-[48ch] text-[13px] text-ink-muted">
          {readOnly ? 'This component has no design image.' : 'There is no design image for this component yet. Components imported from JSON or text do not have one. Add a screenshot or export of the design (PNG, JPG or WebP) to compare it with the dialog.'}
        </p>
        {chooser && <div className="mt-3">{chooser}</div>}
      </section>
    )
  }
  if (!asset) return null
  const fromFigma = component.origin.kind === 'figma-rest' && asset.name.endsWith('(Figma preview).png') // an image added by hand is not a Figma render
  const open = fromFigma ? figmaOpenUrl(component.origin.ref) : null
  const marked = component.properties.filter((p) => p.origin.assetId === asset.id && p.origin.region)

  const Wrap = pane ? 'section' : 'details'
  return (
    <Wrap {...(pane ? { 'aria-label': 'Design preview' } : { open: true })} className={pane ? 'rounded-xl border border-hairline' : 'mt-4 rounded-lg border border-hairline'}>
      {pane ? <h3 className="px-4 py-2.5 text-base">Design preview</h3> : <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-extrabold text-ink-strong">Design preview</summary>}
      <div className="border-t border-hairline p-4">
        <figure>
          <div className="relative inline-block max-w-full overflow-hidden rounded-md border border-hairline bg-sand">
            <img src={asset.dataUrl} alt={fromFigma ? `Figma render of ${component.name}` : `Screenshot used for ${component.name}`} className="block max-h-[34rem] w-auto max-w-full object-contain" />
            {marked.map((p, i) => (
              <span key={p.id} className="pointer-events-none absolute border-2 border-accent bg-accent/10" style={{ left: `${p.origin.region!.x}%`, top: `${p.origin.region!.y}%`, width: `${p.origin.region!.w}%`, height: `${p.origin.region!.h}%` }}>
                <span className="absolute -left-px -top-px rounded-br bg-accent px-1 text-[10px] font-extrabold text-on-accent tabular">{i + 1}</span>
              </span>
            ))}
          </div>
          <figcaption className="mt-2 max-w-[70ch] text-[12px] text-ink-muted">
            {fromFigma
              ? 'A picture Figma rendered when this component was imported. It does not update by itself, and nothing in Aemora is read from it.'
              : 'The screenshot you annotated. The numbered boxes are the regions you marked.'}
          </figcaption>
        </figure>
        {marked.length > 0 && <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink">{marked.map((p, i) => <li key={p.id}><span className="tabular font-bold text-accent-text">{i + 1}</span> {p.label}</li>)}</ol>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {open && <a href={open} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-hairline-strong bg-surface px-3 text-[13px] font-bold text-ink-strong hover:bg-sand">Open in Figma<ExternalLink size={13} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>}
          {chooser}
          {!readOnly && onRemove && <Button size="sm" variant="ghost" onClick={onRemove}><ImageOff size={14} aria-hidden="true" />Remove preview</Button>}
        </div>
      </div>
    </Wrap>
  )
}
