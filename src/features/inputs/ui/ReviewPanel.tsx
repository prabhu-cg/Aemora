import { useState } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { newId } from '../../../lib/id'
import { inferPropertyType, toKey, toLabel } from '../../components/detect'
import type { ImportResult } from '../types'

const badge = 'rounded-md bg-sand px-1.5 py-0.5 text-[12px] font-bold text-ink'

export function ReviewPanel({ result, onChange, onAdd, onDiscard, busy }: {
  result: ImportResult
  onChange: (r: ImportResult) => void
  onAdd: () => void
  onDiscard: () => void
  busy: boolean
}) {
  const [target, setTarget] = useState(0)

  /** Turn a line the parser could not read into a property, by hand. */
  const adopt = (line: number) => {
    const u = result.uncertain.find((x) => x.line === line)
    if (!u) return
    const name = u.text.replace(/^[-*•\s]+/, '').slice(0, 80) || 'Property'
    const comps = result.components.map((c, i) => i === target
      ? { ...c, properties: [...c.properties, {
          id: newId(), key: toKey(name), label: toLabel(name), type: inferPropertyType(name), required: false, defaultValue: null,
          allowedValues: [], description: '', group: '', origin: { kind: 'clipboard' as const, ref: `line ${line}`, suggested: false },
        }] }
      : c)
    onChange({ ...result, components: comps, uncertain: result.uncertain.filter((x) => x.line !== line) })
  }

  return (
    <section aria-label="Import review" className="mt-6 rounded-xl border border-hairline-strong">
      <div className="border-b border-hairline px-5 py-3">
        <h3 className="text-base font-extrabold tracking-tight">Review what was found</h3>
        <p className="text-[13px] text-ink-muted">Nothing is added to the project until you confirm.</p>
      </div>
      <div className="space-y-5 p-5">
        {result.warnings.length > 0 && (
          <ul aria-label="Warnings" className="space-y-1.5">
            {result.warnings.map((w, i) => (
              <li key={i} className={`flex gap-2 rounded-lg p-2.5 text-[13px] ${w.level === 'warning' ? 'bg-warning-soft text-warning' : 'bg-info-soft text-info'}`}>
                {w.level === 'warning' ? <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> : <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />}
                <span><span className="sr-only">{w.level}: </span>{w.where && <strong>{w.where}. </strong>}{w.message}</span>
              </li>
            ))}
          </ul>
        )}

        {result.uncertain.length > 0 && (
          <div>
            <h4 className="text-[13px] font-extrabold text-ink-strong">Lines that need your attention</h4>
            {result.components.length > 1 && (
              <label className="mt-2 flex items-center gap-2 text-[13px]">Add to
                <select value={target} onChange={(e) => setTarget(Number(e.target.value))} className="h-8 rounded-lg border border-hairline-strong bg-surface px-2">
                  {result.components.map((c, i) => <option key={c.id} value={i}>{c.name}</option>)}
                </select>
              </label>
            )}
            <ul className="mt-2 space-y-1">
              {result.uncertain.map((u) => (
                <li key={u.line} className="flex items-center justify-between gap-3 rounded-lg border border-hairline px-3 py-2 text-[13px]">
                  <span><span className="tabular text-ink-muted">Line {u.line}</span> <code className="ml-2">{u.text}</code></span>
                  <Button size="sm" variant="outline" onClick={() => adopt(u.line)}>Add as property</Button>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[12px] text-ink-muted">Lines you leave here are not imported.</p>
          </div>
        )}

        <ul aria-label="Detected components" className="divide-y divide-hairline border-y border-hairline">
          {result.components.map((c) => (
            <li key={c.id} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-[15px] font-extrabold tracking-tight text-ink-strong">{c.name}</strong>
                <span className={badge}>{c.type}</span>
                <span className="text-[13px] text-ink-muted tabular">{c.properties.length} properties{c.unsupported.length ? `, ${c.unsupported.length} unsupported` : ''}</span>
              </div>
              {c.properties.length > 0 && (
                <p className="mt-1.5 text-[13px] text-ink">{c.properties.map((p) => p.label + (p.origin.suggested ? ' (suggested)' : '')).join(', ')}</p>
              )}
              {c.unsupported.length > 0 && (
                <details className="mt-1.5 text-[13px]">
                  <summary className="cursor-pointer font-bold text-warning">Unsupported ({c.unsupported.length})</summary>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {c.unsupported.map((u) => <li key={u.id}><strong>{u.name}</strong>: {u.reason}</li>)}
                  </ul>
                </details>
              )}
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <Button onClick={onAdd} disabled={busy}>Add {result.components.length} component{result.components.length === 1 ? '' : 's'} to project</Button>
          <Button variant="ghost" onClick={onDiscard}>Discard</Button>
        </div>
      </div>
    </section>
  )
}
