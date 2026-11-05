import { newId } from '../../lib/id'
import type { ComponentDef } from '../components/schema'
import type { Project } from '../projects/schema'
import type { ImportResult, Warning } from './types'

export const MAX_ASSETS = 40

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
  const fresh = result.assets.filter((a) => !assetIds.has(a.id))
  // A project holds a limited number of pictures. Keep what fits and say what was left out.
  const keep = fresh.slice(0, Math.max(0, MAX_ASSETS - project.assets.length))
  const dropped = new Set(fresh.slice(keep.length).map((a) => a.id))
  if (dropped.size) notes.push({ level: 'warning', message: `A project can hold ${MAX_ASSETS} pictures. ${dropped.size} ${dropped.size === 1 ? 'picture was' : 'pictures were'} left out; the components were still added.` })
  const placed = added.map((c) => (c.previewAssetId && dropped.has(c.previewAssetId) ? { ...c, previewAssetId: undefined } : c))
  return {
    project: {
      ...project,
      components: [...project.components, ...placed],
      assets: [...project.assets, ...keep],
      inputSource: result.source,
    },
    notes,
  }
}
