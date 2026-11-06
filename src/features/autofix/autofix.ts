import { toKey } from '../components/detect'
import { uniqueKey } from '../components/ops'
import type { ComponentDef, Property } from '../components/schema'
import { KEY_PATTERN } from '../components/validate'
import { removeSection, removeTab } from '../dialog/ops'
import type { ComponentDialog } from '../dialog/schema'
import type { Project } from '../projects/schema'

/**
 * Fixes that have exactly one sensible answer and lose nothing the author wrote.
 * Anything that needs a decision (which choices a select offers, which fields go in a tab) is not here:
 * the problem list sends people to the place where they decide.
 */
export interface Fix { componentId: string; componentName: string; message: string }

const humanize = (key: string) => {
  const s = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').trim()
  return s ? s[0].toUpperCase() + s.slice(1) : ''
}

export function fixProperties(component: ComponentDef): { component: ComponentDef; notes: string[] } {
  const notes: string[] = []
  let c = component
  const set = (id: string, patch: Partial<Property>) => { c = { ...c, properties: c.properties.map((p) => (p.id === id ? { ...p, ...patch } : p)) } }

  // 1. Keys first, since labels and duplicates build on them.
  for (const original of component.properties) {
    const p = c.properties.find((x) => x.id === original.id)!
    if (!p.key.trim()) {
      const key = uniqueKey(c, toKey(p.label), p.id)
      set(p.id, { key }); notes.push(`Gave “${p.label || 'a property'}” the field name ${key}.`)
    } else if (!KEY_PATTERN.test(p.key)) {
      const key = uniqueKey(c, toKey(p.key), p.id)
      set(p.id, { key }); notes.push(`Changed the invalid field name “${p.key}” to ${key}.`)
    }
  }
  const seen = new Set<string>()
  for (const original of component.properties) {
    const p = c.properties.find((x) => x.id === original.id)!
    if (seen.has(p.key)) {
      const key = uniqueKey(c, p.key, p.id)
      set(p.id, { key }); notes.push(`Renamed the repeated field name “${p.key}” to ${key}.`)
    }
    seen.add(c.properties.find((x) => x.id === original.id)!.key)
  }

  for (const original of component.properties) {
    const p = c.properties.find((x) => x.id === original.id)!
    if (!p.label.trim()) { const label = humanize(p.key) || 'Property'; set(p.id, { label }); notes.push(`Gave ${p.key} the label “${label}”.`) }
    if (p.type === 'enum') {
      const values = [...new Set(p.allowedValues)]
      if (values.length !== p.allowedValues.length) { set(p.id, { allowedValues: values }); notes.push(`Removed repeated choices from “${p.label || p.key}”.`) }
      const now = c.properties.find((x) => x.id === p.id)!
      if (now.defaultValue !== null && now.allowedValues.length && !now.allowedValues.includes(String(now.defaultValue))) {
        set(p.id, { defaultValue: null }); notes.push(`Cleared the default of “${p.label || p.key}”, which was not one of its choices.`)
      }
    }
    if (p.type === 'hidden' && p.required) { set(p.id, { required: false }); notes.push(`Made the hidden field “${p.label || p.key}” optional, since authors cannot fill it in.`) }
  }
  return { component: c, notes }
}

export function fixDialog(component: Pick<ComponentDef, 'name'>, dialog: ComponentDialog): { dialog: ComponentDialog; notes: string[] } {
  const notes: string[] = []
  let d = dialog
  if (!d.title.trim()) { d = { ...d, title: component.name.trim() || 'Component' }; notes.push('Gave the dialog a title.') }
  // Empty containers carry nothing, so removing them loses nothing.
  for (const s of d.tabs.flatMap((t) => t.items).flatMap((i) => (i.kind === 'section' && !i.fieldIds.length ? [i] : []))) { d = removeSection(d, s.id); notes.push(`Removed the empty section “${s.title || 'Untitled'}”.`) }
  for (const t of d.tabs) if (!t.items.length && d.tabs.length > 1) { d = removeTab(d, t.id); notes.push(`Removed the empty tab “${t.title || 'Untitled'}”.`) }
  d = { ...d, tabs: d.tabs.map((t, i) => { if (t.title.trim()) return t; notes.push(`Named tab ${i + 1} “Tab ${i + 1}”.`); return { ...t, title: `Tab ${i + 1}` } }) }
  d = { ...d, tabs: d.tabs.map((t) => ({ ...t, items: t.items.map((i) => { if (i.kind !== 'section' || i.title.trim()) return i; notes.push('Named an untitled section “Section”.'); return { ...i, title: 'Section' } }) })) }
  return { dialog: d, notes }
}

/** Applies every safe fix to one component. Returns the same project object when there was nothing to fix. */
export function autoFixComponent(project: Project, componentId: string): { project: Project; fixes: Fix[] } {
  const original = project.components.find((c) => c.id === componentId)
  if (!original) return { project, fixes: [] }
  const a = fixProperties(original)
  const stored = project.dialog.components[componentId]
  const b = stored ? fixDialog(a.component, stored) : null
  const notes = [...a.notes, ...(b?.notes ?? [])]
  if (!notes.length) return { project, fixes: [] }
  return {
    project: {
      ...project,
      components: project.components.map((c) => (c.id === componentId ? a.component : c)),
      dialog: b ? { components: { ...project.dialog.components, [componentId]: b.dialog } } : project.dialog,
    },
    fixes: notes.map((message) => ({ componentId, componentName: original.name, message })),
  }
}

export function autoFixProject(project: Project): { project: Project; fixes: Fix[] } {
  let p = project
  const fixes: Fix[] = []
  for (const c of project.components) { const r = autoFixComponent(p, c.id); p = r.project; fixes.push(...r.fixes) }
  return { project: p, fixes }
}
