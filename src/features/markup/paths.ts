import { kebab } from '../../lib/kebab'
import type { MarkupFile } from './types'

/** Where a generated file belongs in an AEM project. */
export function markupTarget(projectName: string, folder: string, javaPackage: string, file: MarkupFile): string {
  const project = kebab(projectName, '<project>')
  if (file.kind === 'model') return `core/src/main/java/${javaPackage.replace(/\./g, '/')}/${file.name}`
  if (file.kind === 'css') return `/apps/${project}/components/${folder}/clientlibs/css/${file.name}`
  return `/apps/${project}/components/${folder}/${file.name}`
}
