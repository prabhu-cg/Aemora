import { node, b, s, type AemNode } from '../aem/nodes'
import { RESOURCE_TYPES } from '../aem/resourceTypes'
import { toKey } from '../components/detect'
import { kebab } from '../../lib/kebab'
import type { ComponentDef } from '../components/schema'
import type { ComponentDialog, Section, Tab } from '../dialog/schema'
import type { ResolvedField } from '../mapping/engine'
import { fieldToNodes, nodeName } from '../mapping/nodes'
import { serializeDocument } from './serialize'

const PRIMARY = 'nt:unstructured'
const typed = (rt: string, rest: Record<string, ReturnType<typeof s> | ReturnType<typeof b> | undefined> = {}) =>
  ({ 'jcr:primaryType': s(PRIMARY), 'sling:resourceType': s(rt), ...rest })
const items = (children: AemNode[]) => node('items', { 'jcr:primaryType': s(PRIMARY) }, children)

/** Sibling node names must be unique. They never affect saved data (the `name` property does), so we can suffix them. */
function unique(taken: Set<string>, base: string): string {
  let name = base || 'node'
  for (let i = 2; taken.has(name); i++) name = `${base}${i}`
  taken.add(name)
  return name
}

function fieldNodes(ids: string[], byId: Map<string, ResolvedField>, taken: Set<string>): AemNode[] {
  const out: AemNode[] = []
  for (const id of ids) {
    const f = byId.get(id)
    if (!f) continue
    const nodes = fieldToNodes(f)
    // The main node and its @TypeHint sibling must keep their relative names unique among everything here.
    for (const n of nodes) out.push({ ...n, name: unique(taken, n.name) })
  }
  return out
}

function section(sec: Section, byId: Map<string, ResolvedField>, taken: Set<string>): AemNode {
  const inner = new Set<string>()
  return node(unique(taken, nodeName(toKey(sec.title) ? `section${toKey(sec.title)[0].toUpperCase()}${toKey(sec.title).slice(1)}` : 'section')),
    typed(RESOURCE_TYPES.fieldset, { 'jcr:title': s(sec.title) }),
    [items(fieldNodes(sec.fieldIds, byId, inner))])
}

function tabNode(tab: Tab, index: number, byId: Map<string, ResolvedField>, taken: Set<string>): AemNode {
  const column = new Set<string>()
  const children: AemNode[] = []
  for (const it of tab.items) {
    if (it.kind === 'field') children.push(...fieldNodes([it.id], byId, column))
    else children.push(section(it, byId, column))
  }
  const name = unique(taken, nodeName(toKey(tab.title) || `tab${index + 1}`))
  return node(name, typed(RESOURCE_TYPES.container, { 'jcr:title': s(tab.title), margin: b(true) }), [
    node('layout', typed(RESOURCE_TYPES.layoutFixedColumns, { margin: b(false) })),
    items([node('column', typed(RESOURCE_TYPES.container), [items(children)])]),
  ])
}

/** The dialog node: title, content container, tabs, one container per tab, fields inside. */
export function buildDialogNode(dialog: ComponentDialog, fields: ResolvedField[], name = 'jcr:root'): AemNode {
  const byId = new Map(fields.map((f) => [f.propertyId, f]))
  const taken = new Set<string>()
  const tabs = dialog.tabs.map((t, i) => tabNode(t, i, byId, taken))
  return node(name, typed(RESOURCE_TYPES.dialog, { 'jcr:title': s(dialog.title) }), [
    node('content', typed(RESOURCE_TYPES.container), [
      items([node('tabs', typed(RESOURCE_TYPES.tabs, { maximized: b(true) }), [items(tabs)])]),
    ]),
  ])
}

export type XmlFormat = 'standalone' | 'inline'

export interface GenerateInput {
  component: ComponentDef
  dialog: ComponentDialog
  fields: ResolvedField[]
  projectName?: string
  /** The component's folder name under /apps/<project>/components. Defaults to the component name in kebab-case. */
  componentFolder?: string
  format?: XmlFormat
}

export function approachNotes(component: ComponentDef): string[] {
  return component.children.map((c) =>
    c.approach === 'expose-properties'
      ? `Nested "${c.name}": this dialog exposes selected properties${c.exposedKeys.length ? ` (${c.exposedKeys.join(', ')})` : ''}. No separate component is created.`
      : `Nested "${c.name}": authored as an independent component; this dialog references it.`,
  )
}

/**
 * Complete dialog XML. "standalone" is the file that goes in <component>/_cq_dialog/.content.xml.
 * "inline" puts the same dialog under a cq:dialog node in the component's own .content.xml.
 */
export function generateXml({ component, dialog, fields, projectName, componentFolder, format = 'standalone' }: GenerateInput): string {
  const where = format === 'standalone' ? '_cq_dialog/.content.xml' : '.content.xml (cq:dialog node)'
  const comment = [
    `Aemora: AEM Cloud Service Touch UI dialog for "${component.name}".`,
    `Place this at: /apps/${kebab(projectName ?? '', '<project>')}/components/${componentFolder || kebab(component.name, '<component>')}/${where}`,
    'Granite UI / Coral only. No clientlibs, custom widgets or scripts.',
    'Generated deterministically from the dialog layout. Not yet tested on a running AEM instance.',
    ...approachNotes(component),
  ]
  if (format === 'inline') {
    const dlg = buildDialogNode(dialog, fields, 'cq:dialog')
    const root = node('jcr:root', { 'jcr:primaryType': s('cq:Component'), 'jcr:title': s(component.name || 'Component') }, [dlg])
    return serializeDocument(root, { comment })
  }
  return serializeDocument(buildDialogNode(dialog, fields), { comment })
}
