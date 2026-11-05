import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { PageFrame } from './PageFrame'
import { db } from '../../features/projects/db'
import { validateComponent } from '../../features/components/validate'

export function ComponentsPage() {
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), [])
  const withComponents = (projects ?? []).filter((p) => p.components.length)
  return (
    <PageFrame title="Components" lede="Every component detected or added across your projects. Open one to edit its properties.">
      {projects === undefined ? null : withComponents.length === 0 ? (
        <p className="text-ink-muted">No components yet. Open a project and bring in a design to see them here. <Link to="/app" className="font-bold text-accent-text underline">Go to projects</Link></p>
      ) : (
        <div className="space-y-8">
          {withComponents.map((p) => (
            <section key={p.id} aria-label={p.name}>
              <h2 className="text-base">{p.name}</h2>
              <ul className="mt-2 divide-y divide-hairline border-y border-hairline">
                {p.components.map((c) => {
                  const errors = validateComponent(c).filter((i) => i.level === 'error').length
                  return (
                    <li key={c.id}>
                      <Link to={`/app/generator/${p.id}`} className="flex flex-wrap items-center gap-3 py-2.5 hover:bg-ink-strong/[0.03]">
                        <strong className="text-ink-strong">{c.name || 'Untitled component'}</strong>
                        <span className="rounded-md bg-sand px-1.5 py-0.5 text-[12px] font-bold text-ink">{c.type}</span>
                        <span className="tabular text-[13px] text-ink-muted">{c.properties.length} properties</span>
                        {errors > 0 && <span className="text-[13px] font-semibold text-danger">{errors} to fix</span>}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </PageFrame>
  )
}
