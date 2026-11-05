import { newId } from '../../lib/id'
import type { ComponentDef } from '../components/schema'
import type { Project } from '../projects/schema'
import type { ImportResult, Warning } from './types'

/** Pure: returns the project with the import merged in. Name clashes get a numeric suffix, nothing is overwritten. */
export function applyImport(project: Project, result: ImportResult): { project: Project; notes: Warning[] } {
  const notes: Warning[] = []
  const names = new Set(project.components.map((c) => c.name.toLowerCase()))
  const added: ComponentDef[] = result.components.map((c) => {
    let name = c.name
    for (let i = 2; names.has(name.toLowerCase()); i++) name = `${c.name} ${i}`
    if (name !== c.name) notes.push({ level: 'info', where: c.name, message: `A component named "${c.name}" already exists. Added as "${name}".` })
    names.add(name.toLowerCase())
    return { ...c, id: newId(), name }
  })
  const assetIds = new Set(project.assets.map((a) => a.id))
  return {
    project: {
      ...project,
      components: [...project.components, ...added],
      assets: [...project.assets, ...result.assets.filter((a) => !assetIds.has(a.id))],
      inputSource: result.source,
    },
    notes,
  }
}
