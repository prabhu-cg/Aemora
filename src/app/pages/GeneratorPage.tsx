import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { PageFrame } from './PageFrame'
import { ProjectView } from './ProjectView'
import { db } from '../../features/projects/db'
import { buttonClass } from '../../components/ui/buttonClass'
import { relativeTime } from '../../lib/time'

export function GeneratorPage() {
  const { projectId } = useParams()
  const project = useLiveQuery(async () => (projectId ? ((await db.projects.get(projectId)) ?? null) : null), [projectId])
  const recent = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().limit(8).toArray(), [])

  if (!projectId) {
    return (
      <PageFrame title="Dialog Generator" lede="Choose a project to work on its input, properties, mapping, dialog structure, preview and XML.">
        {recent === undefined ? null : recent.length === 0 ? (
          <p className="text-ink-muted">You have no projects yet. <Link className="font-bold text-accent-text underline" to="/app">Create one on the Projects page.</Link></p>
        ) : (
          <ul className="rounded-xl border border-hairline px-4" aria-label="Recent projects">
            {recent.map((p) => (
              <li key={p.id} className="flex items-center justify-between border-t border-hairline py-3 first:border-t-0">
                <Link to={`/app/generator/${p.id}`} className="font-extrabold tracking-tight text-ink-strong hover:text-accent-text">{p.name}</Link>
                <time dateTime={p.updatedAt} className="tabular text-[12px] text-ink-muted">{relativeTime(p.updatedAt)}</time>
              </li>
            ))}
          </ul>
        )}
      </PageFrame>
    )
  }

  if (project === undefined) return <PageFrame title="Dialog Generator" lede="Loading project…" />
  if (project === null) {
    return (
      <PageFrame title="Project not found" lede="This project does not exist in this browser. It may have been deleted, or it was created on another device.">
        <Link to="/app" className={buttonClass('outline')}>Back to projects</Link>
      </PageFrame>
    )
  }

  return <ProjectView project={project} />
}
