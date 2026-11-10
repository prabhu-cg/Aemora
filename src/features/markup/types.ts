export interface MarkupOptions {
  /** CSS class prefix, e.g. "cmp" gives cmp-button. */
  cssPrefix: string
  /** Java package for the Sling Model. */
  javaPackage: string
  /** Component group shown in the AEM editor. */
  group: string
  /** Folder name under the project's components. Defaults to the component name. */
  folder?: string
}

export const DEFAULT_MARKUP_OPTIONS: MarkupOptions = { cssPrefix: 'cmp', javaPackage: 'com.example.core.models', group: 'Aemora' }

export type MarkupFileKind = 'htl' | 'css' | 'model' | 'component' | 'editConfig'

export interface MarkupFile {
  kind: MarkupFileKind
  /** File name relative to its AEM folder (the HTL, .content.xml and edit config sit in the component folder, the CSS in a clientlib, the model under core). */
  name: string
  content: string
}

export interface MarkupNote {
  level: 'info' | 'warning'
  message: string
  /** Name of the Figma layer this is about. */
  layer?: string
}

export interface MarkupResult {
  files: MarkupFile[]
  notes: MarkupNote[]
  folder: string
  blockClass: string
  modelClass: string
  /** True when there was no layer structure and only a simple wrapper was generated. */
  fallback: boolean
}
