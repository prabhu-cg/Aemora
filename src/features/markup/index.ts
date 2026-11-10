import { kebab } from '../../lib/kebab'
import type { ComponentDef } from '../components/schema'
import { generateComponentXml, generateEditConfig } from './componentXml'
import { generateCss } from './css'
import { generateFallbackHtl, generateHtl } from './htl'
import { generateModel } from './java'
import { readDesign } from './layers'
import { pascal } from './naming'
import { buildStructure, type Node } from './structure'
import { DEFAULT_MARKUP_OPTIONS, type MarkupFile, type MarkupNote, type MarkupOptions, type MarkupResult } from './types'

export { DEFAULT_MARKUP_OPTIONS } from './types'
export type { MarkupFile, MarkupNote, MarkupOptions, MarkupResult } from './types'

function uniqueNotes(notes: MarkupNote[]): MarkupNote[] {
  const seen = new Set<string>()
  return notes.filter((n) => { const k = `${n.level}|${n.layer ?? ''}|${n.message}`; if (seen.has(k)) return false; seen.add(k); return true })
}

/**
 * HTL, CSS, Sling Model and component XML for one component. Pure and deterministic.
 * @param jcrNames JCR property name per property key, when the dialog uses a name other than the key.
 */
export function generateMarkup(component: ComponentDef, options: Partial<MarkupOptions> = {}, jcrNames: Record<string, string> = {}): MarkupResult {
  const o = { ...DEFAULT_MARKUP_OPTIONS, ...options }
  const folder = o.folder ?? kebab(component.name, 'component')
  const block = `${o.cssPrefix ? `${kebab(o.cssPrefix)}-` : ''}${folder}`
  const modelClass = `${pascal(component.name)}Model`
  const modelFqn = `${o.javaPackage}.${modelClass}`
  const notes: MarkupNote[] = []
  const design = readDesign(component)
  const st = design ? buildStructure(design, component.properties, notes) : null

  const files: MarkupFile[] = []
  let css = ''
  if (st && design) {
    if (design.treeTruncated) notes.push({ level: 'warning', message: 'The layer structure was cut off by the plugin, so the markup may be incomplete.' })
    // Text layers a variant hides (an icon-only look): the root keeps their text as its accessible name.
    const hidden: Node[] = []
    for (const d of design.variantDiffs) for (const l of d.layers) {
      const n = st.byPath.get(l.path)
      if (n && l.changes.visible === false && n.layer.type === 'TEXT' && n.layer.role === 'label') hidden.push(n)
    }
    const htl = generateHtl(st, component, block, modelFqn, hidden, notes)
    css = generateCss(st, block, notes)
    files.push({ kind: 'htl', name: `${folder}.html`, content: htl })
  } else {
    notes.push({ level: 'warning', message: 'This component has no layer structure from the design, so only a simple wrapper with its text fields was generated and there is no styling.' })
    files.push({ kind: 'htl', name: `${folder}.html`, content: generateFallbackHtl(component, block, modelFqn) })
    css = `.${block} {\n  display: block;\n}\n`
  }
  files.push({ kind: 'css', name: `${folder}.css`, content: css })
  files.push({ kind: 'model', name: `${modelClass}.java`, content: generateModel(component.properties, jcrNames, o.javaPackage, modelClass) })
  files.push({ kind: 'component', name: '.content.xml', content: generateComponentXml(component.name, component.description, o.group) })
  files.push({ kind: 'editConfig', name: '_cq_editConfig.xml', content: generateEditConfig() })

  return { files, notes: uniqueNotes(notes), folder, blockClass: block, modelClass, fallback: !st }
}
