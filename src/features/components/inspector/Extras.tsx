import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { suggestMissingProperties } from '../detect'
import type { ChildLink, ComponentDef, Property, Unsupported } from '../schema'

/** Standard properties for this component type that are not there yet. Nothing is added until chosen. */
export function StandardSuggestions({ component, onAdd }: { component: ComponentDef; onAdd: (props: Property[]) => void }) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const suggestions = suggestMissingProperties(component)
  if (!suggestions.length) return null
  const toggle = (key: string) => setPicked((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n })
  return (
    <div className="mt-3">
      <Button variant="outline" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
        Standard {component.type} properties ({suggestions.length})
      </Button>
      {open && (
        <fieldset className="mt-2 rounded-lg border border-hairline p-3">
          <legend className="px-1 text-[13px] font-bold text-ink-strong">Add the ones authors should control</legend>
          <ul className="grid gap-1 sm:grid-cols-2">
            {suggestions.map((s) => (
              <li key={s.key}>
                <label className="flex cursor-pointer items-start gap-2 rounded-md p-1.5 text-[13px] hover:bg-sand">
                  <input type="checkbox" className="mt-0.5" checked={picked.has(s.key)} onChange={() => toggle(s.key)} />
                  <span><strong className="text-ink-strong">{s.label}</strong> <span className="text-ink-muted">{s.type}{s.allowedValues.length ? ` · ${s.allowedValues.join(', ')}` : ''}</span></span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <Button size="sm" disabled={!picked.size} onClick={() => { onAdd(suggestions.filter((s) => picked.has(s.key))); setPicked(new Set()); setOpen(false) }}>Add {picked.size || ''} selected</Button>
            <Button size="sm" variant="ghost" onClick={() => setPicked(new Set(suggestions.map((s) => s.key)))}>Select all</Button>
          </div>
        </fieldset>
      )}
    </div>
  )
}

export function UnsupportedList({ items, onPromote, onDismiss }: { items: Unsupported[]; onPromote: (id: string) => void; onDismiss: (id: string) => void }) {
  if (!items.length) return null
  return (
    <section aria-label="Unsupported items" className="mt-8">
      <h3 className="text-base">Unsupported, kept for reference</h3>
      <p className="mt-1 text-[13px] text-ink-muted">These came with the input but have no AEM field. They are kept until you decide: turn one into a property, or dismiss it.</p>
      <ul className="mt-2 divide-y divide-hairline border-y border-hairline">
        {items.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1 basis-64">
              <p className="font-bold text-ink-strong">{u.name}{u.rawType && <span className="ml-2 font-normal text-ink-muted">{u.rawType}</span>}</p>
              <p className="text-[13px] text-ink-muted">{u.reason}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => onPromote(u.id)} aria-label={`Turn ${u.name} into a property`}>Make a property</Button>
            <Button size="sm" variant="ghost" onClick={() => onDismiss(u.id)} aria-label={`Dismiss ${u.name}`}>Dismiss</Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

const APPROACH_HELP = {
  'expose-properties': 'This dialog shows selected properties of the nested component. No separate component is created.',
  'reference-component': 'The nested component is authored on its own and this dialog points at it.',
} as const

/** V1 distinction: expose selected child properties, or reference an independently authored component. */
export function ChildrenEditor({ component, siblings, onChange }: { component: ComponentDef; siblings: ComponentDef[]; onChange: (index: number, patch: Partial<ChildLink>) => void }) {
  if (!component.children.length) return null
  return (
    <section aria-label="Nested components" className="mt-8">
      <h3 className="text-base">Nested components</h3>
      <p className="mt-1 text-[13px] text-ink-muted">Choose how each nested component appears in this dialog. The choice is recorded in the generated configuration.</p>
      <ul className="mt-2 divide-y divide-hairline border-y border-hairline">
        {component.children.map((ch, i) => {
          const match = siblings.find((s) => s.id !== component.id && s.name.toLowerCase() === ch.name.toLowerCase())
          const name = `approach-${component.id}-${i}`
          return (
            <li key={`${ch.name}-${i}`} className="py-3">
              <p className="font-bold text-ink-strong">{ch.name}</p>
              <fieldset className="mt-1">
                <legend className="sr-only">How {ch.name} appears</legend>
                {(['expose-properties', 'reference-component'] as const).map((a) => (
                  <label key={a} className="flex cursor-pointer items-start gap-2 py-1 text-[13px]">
                    <input type="radio" name={name} className="mt-0.5" checked={ch.approach === a} onChange={() => onChange(i, { approach: a })} />
                    <span><strong className="text-ink-strong">{a === 'expose-properties' ? 'Expose selected properties' : 'Reference a component'}</strong><br /><span className="text-ink-muted">{APPROACH_HELP[a]}</span></span>
                  </label>
                ))}
              </fieldset>
              {ch.approach === 'expose-properties' && (
                match ? (
                  <fieldset className="mt-1 pl-6">
                    <legend className="text-[12px] font-bold text-ink-strong">Properties of {match.name} to show</legend>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      {match.properties.map((p) => (
                        <label key={p.id} className="flex items-center gap-1.5 text-[13px]">
                          <input type="checkbox" checked={ch.exposedKeys.includes(p.key)} onChange={(e) => onChange(i, { exposedKeys: e.target.checked ? [...ch.exposedKeys, p.key] : ch.exposedKeys.filter((k) => k !== p.key) })} />{p.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : (
                  <label className="mt-1 block pl-6 text-[12px] font-bold text-ink-strong">Property names to show (comma separated)
                    <input className="mt-1 block h-8 w-full max-w-sm rounded-lg border border-hairline-strong bg-surface px-2 text-[13px] font-normal" defaultValue={ch.exposedKeys.join(', ')}
                      onBlur={(e) => onChange(i, { exposedKeys: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })} />
                  </label>
                )
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
