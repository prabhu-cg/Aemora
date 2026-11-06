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

export interface ShowWhenSuggestion { targetId: string; controllerId: string; targetLabel: string; controllerLabel: string }

const LEAD = /^(?:show|display|enable|use|has|with|include)\s+/i
const words = (t: string) => t.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

/**
 * Obvious pairs only: a checkbox or switch labelled "Show icon left" and another field labelled "Left icon" (same words, any order).
 * These are offered, never applied by themselves, and skipped once a field already has a condition.
 */
export function suggestShowWhen(fields: ResolvedField[]): ShowWhenSuggestion[] {
  const out: ShowWhenSuggestion[] = []
  const used = new Set<string>()
  for (const c of fields) {
    if (c.fieldType !== 'checkbox' && c.fieldType !== 'switch') continue
    if (!LEAD.test(c.label.trim())) continue
    const rest = words(c.label.trim().replace(LEAD, ''))
    if (!rest.length) continue
    const key = [...rest].sort().join(' ')
    for (const t of fields) {
      if (t.propertyId === c.propertyId || t.showWhen || used.has(t.propertyId)) continue
      if (t.fieldType === 'checkbox' || t.fieldType === 'switch' || t.fieldType === 'hidden') continue
      if ([...words(t.label)].sort().join(' ') !== key) continue
      used.add(t.propertyId)
      out.push({ targetId: t.propertyId, controllerId: c.propertyId, targetLabel: t.label, controllerLabel: c.label })
      break
    }
  }
  return out
}
