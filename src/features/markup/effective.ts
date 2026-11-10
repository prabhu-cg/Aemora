import { kebab } from '../../lib/kebab'
import type { ComponentDef } from '../components/schema'
import type { ResolvedField } from '../mapping/engine'
import type { Project } from '../projects/schema'
import { generateMarkup } from './index'
import type { MarkupFileKind, MarkupResult } from './types'

/** The markup of one component as the project is set up: its settings, folder name and dialog field names. */
export function generateForProject(project: Project, component: ComponentDef, fields: ResolvedField[]): { result: MarkupResult; folder: string } {
  const folder = project.components.length === 1 && project.aemComponentName ? project.aemComponentName : kebab(component.name, 'component')
  const jcrNames = Object.fromEntries(fields.map((f) => [f.key, f.name.replace(/^\.\//, '')]))
  return { result: generateMarkup(component, { ...project.markupSettings, folder }, jcrNames), folder }
}

/** What a file contains once hand edits are applied: this is what gets exported and previewed. */
export function effectiveContent(project: Project, component: ComponentDef, result: MarkupResult, kind: MarkupFileKind): string {
  const stored = project.markup?.[component.id]?.files?.[kind]
  return stored?.edited ? stored.content : result.files.find((f) => f.kind === kind)!.content
}
