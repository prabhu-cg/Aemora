import { ExternalLink, ImageOff } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { figmaOpenUrl } from '../inputs/figma/previews'
import type { Asset, ComponentDef } from './schema'

/**
 * The picture a component came from: a Figma render, or the screenshot someone annotated.
 * It is for reference only. Fields are never read from it.
 */
export function DesignPreview({ component, assets, readOnly = false, onRemove }: { component: ComponentDef; assets: Asset[]; readOnly?: boolean; onRemove?: () => void }) {
  const asset = assets.find((a) => a.id === component.previewAssetId)
  if (!asset) return null
  const fromFigma = component.origin.kind === 'figma-rest'
  const open = fromFigma ? figmaOpenUrl(component.origin.ref) : null
  const marked = component.properties.filter((p) => p.origin.assetId === asset.id && p.origin.region)

  return (
    <details open className="mt-4 rounded-lg border border-hairline">
      <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-extrabold text-ink-strong">Design preview</summary>
      <div className="border-t border-hairline p-4">
        <figure>
          <div className="relative inline-block max-w-full overflow-hidden rounded-md border border-hairline bg-sand">
            <img src={asset.dataUrl} alt={fromFigma ? `Figma render of ${component.name}` : `Screenshot used for ${component.name}`} className="block max-h-80 w-auto max-w-full object-contain" />
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
          {open && <a href={open} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-full border border-hairline-strong bg-surface px-3 text-[13px] font-bold text-ink-strong hover:bg-sand">Open in Figma<ExternalLink size={13} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>}
          {!readOnly && onRemove && <Button size="sm" variant="ghost" onClick={onRemove}><ImageOff size={14} aria-hidden="true" />Remove preview</Button>}
        </div>
      </div>
    </details>
  )
}
