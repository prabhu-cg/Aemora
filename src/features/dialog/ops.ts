import { newId } from '../../lib/id'
import type { ComponentDef } from '../components/schema'
import type { ComponentDialog, Section, Tab, TabItem } from './schema'

export const DEFAULT_TAB = 'Properties'
export const GROUP_SEPARATOR = '›'

/** "Tab › Section" (a plain ">" also works). */
export function parseGroup(group: string): { tab: string; section: string } {
  const [tab = '', section = ''] = group.split(/[›>]/).map((s) => s.trim())
  return { tab, section }
}

const field = (id: string): TabItem => ({ kind: 'field', id })

/**
 * Deterministic starting layout from the groups on the properties. Tabs and sections appear in the
 * order they are first used. Properties with no group go in a "Properties" tab.
 */
export function buildDialog(component: Pick<ComponentDef, 'name' | 'properties'>): ComponentDialog {
  const tabs: Tab[] = []
  // Ids come from the titles, so the same component always builds the same dialog. The screen
  // and a save made a moment later then agree on which tab or section is meant.
  const tabFor = (title: string) => {
    let t = tabs.find((x) => x.title === title)
    if (!t) { t = { id: `auto-tab-${tabs.length}`, title, items: [] }; tabs.push(t) }
    return t
  }
  for (const p of component.properties) {
    const { tab, section } = parseGroup(p.group)
    const t = tabFor(tab || DEFAULT_TAB)
    if (!section) { t.items.push(field(p.id)); continue }
    let s = t.items.find((i): i is Section => i.kind === 'section' && i.title === section)
    if (!s) { s = { kind: 'section', id: `auto-sec-${t.id}-${t.items.filter((i) => i.kind === 'section').length}`, title: section, fieldIds: [] }; t.items.push(s) }
    s.fieldIds.push(p.id)
  }
  if (!tabs.length) tabs.push({ id: 'auto-tab-0', title: DEFAULT_TAB, items: [] })
  return { title: component.name, tabs, excluded: [] }
}

/** Every property id placed somewhere in the dialog. */
export function placedIds(d: ComponentDialog): string[] {
  return d.tabs.flatMap((t) => t.items.flatMap((i) => (i.kind === 'field' ? [i.id] : i.fieldIds)))
}

/**
 * Bring a stored dialog in step with its component: drop references to properties that no longer
 * exist, and place new properties by their group (or in the first tab). Nothing else changes.
 */
export function reconcile(d: ComponentDialog, component: Pick<ComponentDef, 'properties'>): ComponentDialog {
  const live = new Set(component.properties.map((p) => p.id))
  const seen = new Set<string>()
  const keep = (id: string) => live.has(id) && !seen.has(id) && !!seen.add(id)
  const tabs: Tab[] = d.tabs.map((t) => ({
    ...t,
    items: t.items.flatMap((i): TabItem[] => (i.kind === 'field' ? (keep(i.id) ? [i] : []) : [{ ...i, fieldIds: i.fieldIds.filter(keep) }])),
  }))
  const excluded = d.excluded.filter((id) => live.has(id))
  const out: ComponentDialog = { ...d, tabs, excluded }
  const missing = component.properties.filter((p) => !seen.has(p.id) && !excluded.includes(p.id))
  if (!missing.length) return out
  let next = out
  for (const p of missing) {
    const { tab, section } = parseGroup(p.group)
    const t = next.tabs.find((x) => x.title === tab) ?? next.tabs[0]
    const s = section ? t.items.find((i): i is Section => i.kind === 'section' && i.title === section) : undefined
    next = placeField(next, p.id, { tabId: t.id, sectionId: s?.id })
  }
  return next
}

export function resolveDialog(component: Pick<ComponentDef, 'name' | 'properties'>, stored?: ComponentDialog): ComponentDialog {
  return stored ? reconcile(stored, component) : buildDialog(component)
}

// ---- locating ----

export interface Place { tabId: string; sectionId?: string; index: number }

export function locate(d: ComponentDialog, propertyId: string): Place | null {
  for (const t of d.tabs) {
    for (let i = 0; i < t.items.length; i++) {
      const it = t.items[i]
      if (it.kind === 'field' && it.id === propertyId) return { tabId: t.id, index: i }
      if (it.kind === 'section') {
        const j = it.fieldIds.indexOf(propertyId)
        if (j >= 0) return { tabId: t.id, sectionId: it.id, index: j }
      }
    }
  }
  return null
}

export interface Container { key: string; label: string; tabId: string; sectionId?: string }

/** Every place a field can live, for "Move to" choices. */
export function containers(d: ComponentDialog): Container[] {
  return d.tabs.flatMap((t) => [
    { key: `tab:${t.id}`, label: t.title || 'Untitled tab', tabId: t.id },
    ...t.items.filter((i): i is Section => i.kind === 'section').map((s) => ({ key: `sec:${s.id}`, label: `${t.title || 'Untitled tab'} ${GROUP_SEPARATOR} ${s.title || 'Untitled section'}`, tabId: t.id, sectionId: s.id })),
  ])
}

export const containerKey = (c: { tabId: string; sectionId?: string }) => (c.sectionId ? `sec:${c.sectionId}` : `tab:${c.tabId}`)

// ---- pure edits (each returns a new dialog) ----

const mapTabs = (d: ComponentDialog, fn: (t: Tab) => Tab): ComponentDialog => ({ ...d, tabs: d.tabs.map(fn) })

export function setTitle(d: ComponentDialog, title: string): ComponentDialog { return { ...d, title } }

export function addTab(d: ComponentDialog, title = 'New tab'): { dialog: ComponentDialog; tab: Tab } {
  const tab: Tab = { id: newId(), title, items: [] }
  return { dialog: { ...d, tabs: [...d.tabs, tab] }, tab }
}

export const renameTab = (d: ComponentDialog, tabId: string, title: string) => mapTabs(d, (t) => (t.id === tabId ? { ...t, title } : t))

export function moveTab(d: ComponentDialog, tabId: string, delta: -1 | 1): ComponentDialog {
  const i = d.tabs.findIndex((t) => t.id === tabId)
  const j = i + delta
  if (i < 0 || j < 0 || j >= d.tabs.length) return d
  const tabs = [...d.tabs]
  ;[tabs[i], tabs[j]] = [tabs[j], tabs[i]]
  return { ...d, tabs }
}

/** The last tab cannot be removed. Its content moves to the neighbouring tab, never discarded. */
export function removeTab(d: ComponentDialog, tabId: string): ComponentDialog {
  const i = d.tabs.findIndex((t) => t.id === tabId)
  if (i < 0 || d.tabs.length < 2) return d
  const target = d.tabs[i - 1] ?? d.tabs[i + 1]
  const gone = d.tabs[i]
  return { ...d, tabs: d.tabs.filter((t) => t.id !== tabId).map((t) => (t.id === target.id ? { ...t, items: [...t.items, ...gone.items] } : t)) }
}

export function addSection(d: ComponentDialog, tabId: string, title = 'New section'): { dialog: ComponentDialog; section: Section } {
  const section: Section = { kind: 'section', id: newId(), title, fieldIds: [] }
  return { dialog: mapTabs(d, (t) => (t.id === tabId ? { ...t, items: [...t.items, section] } : t)), section }
}

export const renameSection = (d: ComponentDialog, sectionId: string, title: string) =>
  mapTabs(d, (t) => ({ ...t, items: t.items.map((i) => (i.kind === 'section' && i.id === sectionId ? { ...i, title } : i)) }))

/** Removing a section keeps its fields: they take its place in the tab. */
export function removeSection(d: ComponentDialog, sectionId: string): ComponentDialog {
  return mapTabs(d, (t) => ({ ...t, items: t.items.flatMap((i): TabItem[] => (i.kind === 'section' && i.id === sectionId ? i.fieldIds.map(field) : [i])) }))
}

function removeFieldEverywhere(d: ComponentDialog, propertyId: string): ComponentDialog {
  return mapTabs(d, (t) => ({
    ...t,
    items: t.items.flatMap((i): TabItem[] => (i.kind === 'field' ? (i.id === propertyId ? [] : [i]) : [{ ...i, fieldIds: i.fieldIds.filter((x) => x !== propertyId) }])),
  }))
}

const clamp = (n: number, max: number) => Math.min(Math.max(n, 0), max)

/** Put a property into a tab or section at an index (default: the end). It leaves its old place first. */
export function placeField(d: ComponentDialog, propertyId: string, target: { tabId: string; sectionId?: string }, index?: number): ComponentDialog {
  const base = removeFieldEverywhere(d, propertyId)
  return mapTabs(base, (t) => {
    if (t.id !== target.tabId) return t
    if (!target.sectionId) {
      const items = [...t.items]
      items.splice(index === undefined ? items.length : clamp(index, items.length), 0, field(propertyId))
      return { ...t, items }
    }
    return { ...t, items: t.items.map((i) => {
      if (i.kind !== 'section' || i.id !== target.sectionId) return i
      const ids = [...i.fieldIds]
      ids.splice(index === undefined ? ids.length : clamp(index, ids.length), 0, propertyId)
      return { ...i, fieldIds: ids }
    }) }
  })
}

export const moveField = placeField

/** Move a section to a tab at an index among that tab's items. */
export function moveSection(d: ComponentDialog, sectionId: string, tabId: string, index?: number): ComponentDialog {
  let section: Section | undefined
  const stripped = mapTabs(d, (t) => ({ ...t, items: t.items.filter((i) => { if (i.kind === 'section' && i.id === sectionId) { section = i; return false } return true }) }))
  if (!section) return d
  return mapTabs(stripped, (t) => {
    if (t.id !== tabId) return t
    const items = [...t.items]
    items.splice(index === undefined ? items.length : clamp(index, items.length), 0, section!)
    return { ...t, items }
  })
}

/** Move a field or section one place up or down inside its own container. */
export function moveItem(d: ComponentDialog, id: string, delta: -1 | 1): ComponentDialog {
  return mapTabs(d, (t) => {
    const i = t.items.findIndex((x) => x.id === id)
    if (i >= 0) {
      const j = i + delta
      if (j < 0 || j >= t.items.length) return t
      const items = [...t.items]
      ;[items[i], items[j]] = [items[j], items[i]]
      return { ...t, items }
    }
    return { ...t, items: t.items.map((it) => {
      if (it.kind !== 'section') return it
      const k = it.fieldIds.indexOf(id)
      const j = k + delta
      if (k < 0 || j < 0 || j >= it.fieldIds.length) return it
      const ids = [...it.fieldIds]
      ;[ids[k], ids[j]] = [ids[j], ids[k]]
      return { ...it, fieldIds: ids }
    }) }
  })
}

/** Leave a property out of the dialog. The property itself is untouched. */
export function excludeField(d: ComponentDialog, propertyId: string): ComponentDialog {
  const base = removeFieldEverywhere(d, propertyId)
  return base.excluded.includes(propertyId) ? base : { ...base, excluded: [...base.excluded, propertyId] }
}

export function includeField(d: ComponentDialog, propertyId: string, target?: { tabId: string; sectionId?: string }): ComponentDialog {
  const t = target ?? { tabId: d.tabs[0].id }
  return placeField({ ...d, excluded: d.excluded.filter((x) => x !== propertyId) }, propertyId, t)
}

// ---- validation ----

export interface DialogIssue {
  level: 'error' | 'warning'
  code: 'tab-title-empty' | 'tab-title-duplicate' | 'tab-empty' | 'section-title-empty' | 'section-empty' | 'dialog-title-empty' | 'no-fields'
  message: string
  tabId?: string
  sectionId?: string
}

export function validateDialog(d: ComponentDialog): DialogIssue[] {
  const out: DialogIssue[] = []
  if (!d.title.trim()) out.push({ level: 'error', code: 'dialog-title-empty', message: 'The dialog needs a title.' })
  const titles = new Map<string, number>()
  for (const t of d.tabs) titles.set(t.title.trim().toLowerCase(), (titles.get(t.title.trim().toLowerCase()) ?? 0) + 1)
  for (const t of d.tabs) {
    if (!t.title.trim()) out.push({ level: 'error', code: 'tab-title-empty', message: 'A tab needs a title.', tabId: t.id })
    else if ((titles.get(t.title.trim().toLowerCase()) ?? 0) > 1) out.push({ level: 'warning', code: 'tab-title-duplicate', message: `Two tabs are called "${t.title}". Authors will not be able to tell them apart.`, tabId: t.id })
    if (!t.items.length) out.push({ level: 'warning', code: 'tab-empty', message: `The tab "${t.title || 'Untitled'}" has no fields.`, tabId: t.id })
    for (const i of t.items) {
      if (i.kind !== 'section') continue
      if (!i.title.trim()) out.push({ level: 'error', code: 'section-title-empty', message: 'A section needs a title.', tabId: t.id, sectionId: i.id })
      if (!i.fieldIds.length) out.push({ level: 'warning', code: 'section-empty', message: `The section "${i.title || 'Untitled'}" has no fields.`, tabId: t.id, sectionId: i.id })
    }
  }
  if (!placedIds(d).length) out.push({ level: 'warning', code: 'no-fields', message: 'The dialog has no fields yet.' })
  return out
}

/** Remove stored dialogs for components that no longer exist. */
export function pruneDialogs(store: { components: Record<string, ComponentDialog> }, components: Pick<ComponentDef, 'id'>[]) {
  const live = new Set(components.map((c) => c.id))
  return { components: Object.fromEntries(Object.entries(store.components).filter(([id]) => live.has(id))) }
}
