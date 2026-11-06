import { node, s, type AemNode } from '../aem/nodes'
import { kebab } from '../../lib/kebab'
import type { ResolvedField } from './engine'

/**
 * Conditional fields, written the way Granite UI dialogs conventionally do it:
 *   - the field that decides gets  granite:class="cq-dialog-checkbox-showhide"  (or  ...-dropdown-showhide)
 *     and a  granite:data  child naming the CSS class of what it controls;
 *   - the field that is shown conditionally gets  granite:class="hide <that class>"  and, for a select,
 *     granite:data showhidetargetvalue="<choice>".
 * A script in the AEM project reads those markers. Aemora writes the markup and no script.
 */
export interface ShowHidePlan {
  /** Controllers by property id. */
  controllers: Map<string, { kind: 'checkbox' | 'dropdown'; target: string }>
  /** Conditionally shown fields by property id. */
  targets: Map<string, { cls: string; value?: string }>
}

const isController = (f: ResolvedField) => f.fieldType === 'checkbox' || f.fieldType === 'switch' || f.fieldType === 'select'

/** Only conditions that make sense are planned: the controller is in the dialog, can decide, and (for a select) names a real choice. */
export function planShowHide(placed: ResolvedField[]): ShowHidePlan {
  const byId = new Map(placed.map((f) => [f.propertyId, f]))
  const controllers: ShowHidePlan['controllers'] = new Map()
  const targets: ShowHidePlan['targets'] = new Map()
  const taken = new Set<string>()
  for (const f of placed) {
    const w = f.showWhen
    const c = w && w.propertyId !== f.propertyId ? byId.get(w.propertyId) : undefined
    if (!w || !c || !isController(c)) continue
    if (c.fieldType === 'select' && (!w.value || !c.allowedValues.includes(w.value))) continue
    let cls = controllers.get(c.propertyId)?.target
    if (!cls) {
      const base = `${kebab(c.key, 'field')}-showhide-target`
      cls = base
      for (let i = 2; taken.has(cls); i++) cls = `${base}-${i}`
      taken.add(cls)
      controllers.set(c.propertyId, { kind: c.fieldType === 'select' ? 'dropdown' : 'checkbox', target: cls })
    }
    targets.set(f.propertyId, { cls, value: c.fieldType === 'select' ? w.value : 'true' })
  }
  return { controllers, targets }
}

/** Adds the markers to a field's main node. Nodes without a role are returned untouched. */
export function applyShowHide(n: AemNode, propertyId: string, plan: ShowHidePlan): AemNode {
  const ctl = plan.controllers.get(propertyId)
  const tgt = plan.targets.get(propertyId)
  if (!ctl && !tgt) return n
  const classes = [ctl && `cq-dialog-${ctl.kind}-showhide`, tgt && 'hide', tgt?.cls].filter(Boolean).join(' ')
  const data = node('granite:data', {
    'jcr:primaryType': s('nt:unstructured'),
    ...(ctl ? { [`cq-dialog-${ctl.kind}-showhide-target`]: s(`.${ctl.target}`) } : {}),
    ...(tgt?.value ? { showhidetargetvalue: s(tgt.value) } : {}),
  })
  return { ...n, props: { ...n.props, 'granite:class': s(classes) }, children: [...n.children, data] }
}
