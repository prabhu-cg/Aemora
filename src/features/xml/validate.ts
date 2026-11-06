import { ALLOWED_RESOURCE_TYPES, RESOURCE_TYPES } from '../aem/resourceTypes'
import type { ComponentDef } from '../components/schema'
import { validateComponent } from '../components/validate'
import type { ComponentDialog } from '../dialog/schema'
import { validateDialog } from '../dialog/ops'
import type { ResolvedField } from '../mapping/engine'
import { validateFields } from '../mapping/validate'

/**
 * Three separate checks, never blended:
 *  1. XML syntax: is the text well-formed XML?
 *  2. Generator: is Aemora's own model complete and consistent?
 *  3. AEM compatibility: does the XML follow Granite UI structure conventions we know of?
 * None of them runs the dialog in AEM. Only a real Cloud Service environment can do that.
 */

export interface SyntaxResult { ok: boolean; message?: string; line?: number; column?: number }

export const FORBIDDEN_DECLARATIONS = /<!DOCTYPE|<!ENTITY/i

export function parseXml(xml: string): { doc: Document | null; result: SyntaxResult } {
  if (!xml.trim()) return { doc: null, result: { ok: false, message: 'The XML is empty.' } }
  // External entities and DTDs are never needed for a dialog and are a classic attack vector.
  if (FORBIDDEN_DECLARATIONS.test(xml)) return { doc: null, result: { ok: false, message: 'DOCTYPE and ENTITY declarations are not allowed in dialog XML.' } }
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const err = doc.getElementsByTagName('parsererror')[0]
  if (!err) return { doc, result: { ok: true } }
  const text = (err.textContent ?? '').replace(/\s+/g, ' ').trim()
  const m = /line\s*(?:number\s*)?(\d+)[^\d]+(?:column|col)\s*(?:number\s*)?(\d+)/i.exec(text)
  return { doc: null, result: { ok: false, message: text.replace(/^This page contains the following errors:\s*/i, '') || 'The XML is not well-formed.', line: m ? Number(m[1]) : undefined, column: m ? Number(m[2]) : undefined } }
}

export const checkSyntax = (xml: string): SyntaxResult => parseXml(xml).result

// ---- layer 2: the generator's own model ----

export interface GeneratorIssue { level: 'error' | 'warning'; message: string; propertyId?: string; source: 'property' | 'field' | 'dialog' | 'component' }

export function checkGenerator(component: ComponentDef, dialog: ComponentDialog, fields: ResolvedField[], hasComponentName: boolean): GeneratorIssue[] {
  const out: GeneratorIssue[] = []
  for (const i of validateComponent(component)) out.push({ level: i.level, message: i.message, propertyId: i.propertyId, source: 'property' })
  for (const i of validateFields(fields)) out.push({ level: i.level, message: i.message, propertyId: i.propertyId, source: 'field' })
  // A condition on a field that is not in the dialog can never fire.
  const inDialog = new Set(dialog.tabs.flatMap((t) => t.items.flatMap((i) => (i.kind === 'field' ? [i.id] : i.fieldIds))))
  for (const f of fields) {
    if (f.showWhen && inDialog.has(f.propertyId) && !inDialog.has(f.showWhen.propertyId) && fields.some((x) => x.propertyId === f.showWhen!.propertyId)) {
      out.push({ level: 'error', message: `“${f.label}” is only shown when another field has a value, but that field is not in the dialog.`, propertyId: f.propertyId, source: 'dialog' })
    }
  }
  for (const f of fields) {
    if (f.showWhen && f.required && inDialog.has(f.propertyId)) {
      out.push({ level: 'warning', message: `“${f.label}” is required but only sometimes shown. AEM may still ask for it while it is hidden, so consider making it optional.`, propertyId: f.propertyId, source: 'field' })
    }
  }
  for (const i of validateDialog(dialog)) out.push({ level: i.level, message: i.message, source: 'dialog' })
  if (!hasComponentName) out.push({ level: 'warning', message: 'The project has no AEM component name, so the target path in the file header uses a placeholder.', source: 'component' })
  return out
}

// ---- layer 3: AEM / Granite UI structure ----

export interface AemIssue { level: 'error' | 'warning'; code: string; message: string; path: string }

const FORM_FIELDS = new Set<string>([
  RESOURCE_TYPES.textfield, RESOURCE_TYPES.textarea, RESOURCE_TYPES.numberfield, RESOURCE_TYPES.checkbox, RESOURCE_TYPES.switch,
  RESOURCE_TYPES.select, RESOURCE_TYPES.pathfield, RESOURCE_TYPES.colorfield, RESOURCE_TYPES.hidden, RESOURCE_TYPES.datepicker,
  RESOURCE_TYPES.fileupload, RESOURCE_TYPES.tagfield, RESOURCE_TYPES.richtext,
])
const TYPE_PREFIXES = new Set(['Boolean', 'Long', 'Double', 'String', 'Decimal', 'Date', 'Name', 'Path'])
const CLASSIC_NODE_TYPES = new Set(['cq:Dialog', 'cq:Widget', 'cq:WidgetCollection', 'cq:Panel', 'cq:TabPanel'])
const CODE_ATTRS = new Set(['extraClientlibs', 'clientlibs', 'jsp', 'script', 'xtype', 'handler'])

const q = (el: Element, a: string) => el.getAttribute(a) ?? ''
const kids = (el: Element) => [...el.children]
const child = (el: Element, name: string) => kids(el).find((c) => c.tagName === name)

export function checkAem(doc: Document): AemIssue[] {
  const out: AemIssue[] = []
  const add = (level: AemIssue['level'], code: string, message: string, path: string) => out.push({ level, code, message, path })
  const root = doc.documentElement
  if (root.tagName !== 'jcr:root') { add('error', 'root', 'The root element must be jcr:root.', root.tagName); return out }
  for (const p of ['jcr', 'nt', 'sling']) if (!root.getAttribute(`xmlns:${p}`)) add('error', 'namespace', `The ${p} namespace is not declared on jcr:root.`, 'jcr:root')

  // Standalone (_cq_dialog/.content.xml) or inline (cq:dialog under the component).
  let dialog: Element = root
  if (q(root, 'sling:resourceType') !== RESOURCE_TYPES.dialog) {
    const inline = child(root, 'cq:dialog')
    if (inline && q(root, 'jcr:primaryType') === 'cq:Component') {
      if (!root.getAttribute('xmlns:cq')) add('error', 'namespace', 'The cq namespace is not declared on jcr:root.', 'jcr:root')
      dialog = inline
    } else add('error', 'dialog-type', `The dialog must have sling:resourceType="${RESOURCE_TYPES.dialog}".`, 'jcr:root')
  }
  if (dialog !== root && q(dialog, 'sling:resourceType') !== RESOURCE_TYPES.dialog) add('error', 'dialog-type', `cq:dialog must have sling:resourceType="${RESOURCE_TYPES.dialog}".`, 'cq:dialog')

  const content = child(dialog, 'content')
  if (!content) add('error', 'content', 'The dialog has no content node.', dialog.tagName)
  else {
    if (q(content, 'sling:resourceType') !== RESOURCE_TYPES.container) add('error', 'content-type', 'The content node should be a Granite container.', 'content')
    const tabs = child(child(content, 'items') ?? content, 'tabs')
    if (!tabs) add('warning', 'tabs', 'The dialog has no tabs node. Aemora always generates one.', 'content/items')
    else if (!kids(child(tabs, 'items') ?? tabs).filter((k) => k.tagName !== 'items').length) add('error', 'tabs-empty', 'The tabs node has no tabs.', 'content/items/tabs')
  }

  const names = new Map<string, string[]>()
  const walk = (el: Element, path: string) => {
    const here = path ? `${path}/${el.tagName}` : el.tagName
    // Every node needs a primary type.
    if (!el.hasAttribute('jcr:primaryType')) add('error', 'primary-type', 'The node has no jcr:primaryType.', here)
    const pt = q(el, 'jcr:primaryType')
    if (CLASSIC_NODE_TYPES.has(pt)) add('error', 'classic-ui', `${pt} is a Classic UI node type. Touch UI dialogs use nt:unstructured.`, here)
    else if (el !== root && el !== dialog && pt && pt !== 'nt:unstructured') add('warning', 'node-type', `Unexpected node type ${pt}. Dialog nodes are nt:unstructured.`, here)

    for (const a of [...el.attributes]) {
      if (a.name.startsWith('xmlns')) continue
      if (CODE_ATTRS.has(a.name)) add('error', 'custom-code', `The "${a.name}" attribute adds clientlibs, scripts or Classic UI behaviour, which the generator never emits.`, here)
      if (/<\s*script|javascript:/i.test(a.value)) add('error', 'script', `The "${a.name}" value contains script content.`, here)
      const m = /^\{(\w+)\}/.exec(a.value)
      if (m && !TYPE_PREFIXES.has(m[1])) add('error', 'value-type', `"{${m[1]}}" is not a known JCR value type prefix.`, `${here}@${a.name}`)
      if (m && m[1] === 'Boolean' && !/^\{Boolean\}(true|false)$/.test(a.value)) add('error', 'value-type', `${a.name} should be {Boolean}true or {Boolean}false.`, `${here}@${a.name}`)
      if (m && (m[1] === 'Long') && !/^\{Long\}-?\d+$/.test(a.value)) add('error', 'value-type', `${a.name} should be a whole number after {Long}.`, `${here}@${a.name}`)
    }

    const rt = q(el, 'sling:resourceType')
    if (rt && !ALLOWED_RESOURCE_TYPES.has(rt)) add('error', 'resource-type', `"${rt}" is not a supported Granite UI or Coral component for generated dialogs.`, here)

    // Sibling names must be unique in a JCR tree.
    const seen = new Set<string>()
    for (const c of kids(el)) { if (seen.has(c.tagName)) add('error', 'duplicate-node', `Two sibling nodes are named "${c.tagName}".`, `${here}/${c.tagName}`); seen.add(c.tagName) }

    if (FORM_FIELDS.has(rt)) {
      const name = q(el, 'name')
      if (!name && rt !== RESOURCE_TYPES.hidden) add('error', 'field-name', 'A field needs a name property.', here)
      else if (name) {
        if (!/^\.\/.+/.test(name)) add('error', 'field-name', `The field name "${name}" should start with ./`, here)
        if (!name.endsWith('@TypeHint')) names.set(name, [...(names.get(name) ?? []), here])
      }
      if (rt === RESOURCE_TYPES.select) {
        const list = child(el, 'items')
        const opts = list ? kids(list) : []
        if (!opts.length) add('error', 'select-items', 'A select needs an items node with at least one choice.', here)
        for (const o of opts) if (!o.hasAttribute('value') || !o.hasAttribute('text')) add('error', 'select-item', 'Each select item needs text and value.', `${here}/items/${o.tagName}`)
      }
      if (rt === RESOURCE_TYPES.fileupload && !el.hasAttribute('fileReferenceParameter')) add('warning', 'fileupload', 'A fileupload normally sets fileReferenceParameter so the asset path is stored.', here)
    }
    if (rt === RESOURCE_TYPES.multifield) {
      const field = child(el, 'field')
      if (!field) add('error', 'multifield-field', 'A multifield needs a field child that defines each item.', here)
      else {
        if (!field.hasAttribute('name')) add('error', 'multifield-field-name', 'The multifield field needs a name so the items are stored.', `${here}/field`)
        else names.set(q(field, 'name'), [...(names.get(q(field, 'name')) ?? []), `${here}/field`])
        if (q(el, 'composite') === '{Boolean}true' && q(field, 'sling:resourceType') !== RESOURCE_TYPES.container) add('error', 'composite', 'A composite multifield needs a container as its field.', `${here}/field`)
      }
    }
    if (rt === RESOURCE_TYPES.tabs && !child(el, 'items')) add('error', 'tabs-items', 'A tabs node needs an items node.', here)

    for (const c of kids(el)) walk(c, here)
  }
  walk(root, '')
  for (const [n, where] of names) if (where.length > 1) add('error', 'duplicate-name', `More than one field saves to ${n}.`, where.join(', '))
  return out
}

export interface ValidationSummary {
  syntax: SyntaxResult
  generator: GeneratorIssue[]
  /** null when the XML could not be parsed, so there is nothing to check. */
  aem: AemIssue[] | null
}

export function validateAll(xml: string, component: ComponentDef, dialog: ComponentDialog, fields: ResolvedField[], hasComponentName: boolean): ValidationSummary {
  const { doc, result } = parseXml(xml)
  return { syntax: result, generator: checkGenerator(component, dialog, fields, hasComponentName), aem: doc ? checkAem(doc) : null }
}
