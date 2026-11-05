import type { ComponentDef } from './schema'

const badge = 'rounded-md bg-sand px-1.5 py-0.5 text-[12px] font-bold text-ink'

export function ComponentList({ components }: { components: ComponentDef[] }) {
  if (!components.length) return <p className="text-ink-muted">No components yet. Bring in a design above.</p>
  return (
    <ul aria-label="Components in this project" className="space-y-3">
      {components.map((c, idx) => (
        <li key={c.id}>
          <details open={idx === 0} className="rounded-xl border border-hairline">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3">
              <strong className="text-[15px] font-extrabold tracking-tight text-ink-strong">{c.name}</strong>
              <span className={badge}>{c.type}</span>
              <span className="tabular text-[13px] text-ink-muted">{c.properties.length} properties{c.unsupported.length ? ` · ${c.unsupported.length} unsupported` : ''}</span>
            </summary>
            <div className="overflow-x-auto border-t border-hairline px-4 py-3">
              {c.description && <p className="mb-2 text-[13px] text-ink-muted">{c.description}</p>}
              {c.properties.length ? (
                <table className="w-full text-left text-[13px]">
                  <caption className="sr-only">Properties of {c.name}</caption>
                  <thead><tr className="text-ink-muted"><th className="py-1 pr-3 font-bold">Label</th><th className="pr-3 font-bold">Key</th><th className="pr-3 font-bold">Type</th><th className="pr-3 font-bold">Required</th><th className="pr-3 font-bold">Default</th><th className="font-bold">Values</th></tr></thead>
                  <tbody>
                    {c.properties.map((p) => (
                      <tr key={p.id} className="border-t border-hairline">
                        <td className="py-1.5 pr-3 font-semibold text-ink-strong">{p.label}{p.origin.suggested && <span className="ml-2 rounded-md bg-accent-tint px-1.5 py-0.5 text-[11px] font-bold text-accent-text">suggested</span>}</td>
                        <td className="pr-3"><code>{p.key}</code></td>
                        <td className="pr-3">{p.type}</td>
                        <td className="pr-3">{p.required ? 'Yes' : 'No'}</td>
                        <td className="pr-3">{p.defaultValue === null ? '—' : String(p.defaultValue)}</td>
                        <td>{p.allowedValues.join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-[13px] text-ink-muted">No properties.</p>}
              {c.children.length > 0 && (
                <p className="mt-3 text-[13px]"><strong className="text-ink-strong">Nested:</strong> {c.children.map((ch) => `${ch.name} (${ch.approach === 'expose-properties' ? 'exposes selected properties' : 'references a component'})`).join(', ')}</p>
              )}
              {c.unsupported.length > 0 && (
                <div className="mt-3 rounded-lg bg-warning-soft p-3 text-[13px] text-warning">
                  <p className="font-bold">Unsupported, kept for reference</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">{c.unsupported.map((u) => <li key={u.id}><strong>{u.name}</strong>: {u.reason}</li>)}</ul>
                </div>
              )}
            </div>
          </details>
        </li>
      ))}
    </ul>
  )
}
