import { useState } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertTriangle, ArrowDown, ArrowUp, CircleAlert, EyeOff, GripVertical, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import type { ComponentDef } from '../../components/schema'
import type { ResolvedField } from '../../mapping/engine'
import type { FieldIssue } from '../../mapping/validate'
import { FieldForm, type FieldActions } from '../../mapping/ui/FieldPanel'
import { FIELD_TYPES } from '../../mapping/fieldTypes'
import {
  addSection, addTab, containerKey, containers, excludeField, includeField, locate, moveItem, moveSection, moveTab, placeField,
  removeSection, removeTab, renameSection, renameTab, setTitle, validateDialog,
} from '../ops'
import type { ComponentDialog, Section, Tab } from '../schema'

export type Target = { tabId: string; sectionId?: string }

interface Props {
  component: ComponentDef
  dialog: ComponentDialog
  stored: boolean
  fields: ResolvedField[]
  fieldIssues: FieldIssue[]
  groups: string[]
  selectedId: string
  onSelect: (propertyId: string) => void
  onChange: (fn: (d: ComponentDialog) => ComponentDialog) => void
  onAddField: (target: Target) => Promise<string | undefined>
  onRebuild: () => void
  actionsFor: (propertyId: string) => FieldActions
  readOnly?: boolean
}

const iconBtn = 'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-ink-strong/5 hover:text-ink-strong disabled:opacity-30 disabled:pointer-events-none cursor-pointer'
const titleInput = 'h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 font-extrabold tracking-tight text-ink-strong hover:border-hairline-strong focus:border-hairline-strong aria-[invalid=true]:border-danger'

export function DialogEditor(p: Props) {
  const { component, dialog, fields, fieldIssues, selectedId, onSelect, onChange } = p
  const ro = !!p.readOnly
  const [confirmRebuild, setConfirmRebuild] = useState(false)
  const byId = new Map(fields.map((f) => [f.propertyId, f]))
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const issues = validateDialog(dialog)
  const selected = component.properties.find((x) => x.id === selectedId)
  const selectedField = selected ? byId.get(selected.id) : undefined
  const excluded = dialog.excluded.map((id) => component.properties.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x)
  const issuesOf = (id: string) => fieldIssues.filter((i) => i.propertyId === id)

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const a = String(active.id), o = String(over.id)
    const tabOfSection = (d: ComponentDialog, sid: string) => d.tabs.find((t) => t.items.some((i) => i.kind === 'section' && i.id === sid))!
    if (a.startsWith('f:')) {
      const pid = a.slice(2)
      onChange((d) => {
        if (o.startsWith('f:')) {
          const at = locate(d, o.slice(2))
          return at ? placeField(d, pid, { tabId: at.tabId, sectionId: at.sectionId }, at.index) : d
        }
        if (o.startsWith('s:')) return placeField(d, pid, { tabId: tabOfSection(d, o.slice(2)).id, sectionId: o.slice(2) })
        if (o.startsWith('sec:')) return placeField(d, pid, { tabId: tabOfSection(d, o.slice(4)).id, sectionId: o.slice(4) })
        if (o.startsWith('tab:')) return placeField(d, pid, { tabId: o.slice(4) })
        return d
      })
    } else if (a.startsWith('s:')) {
      const sid = a.slice(2)
      onChange((d) => {
        if (o.startsWith('s:')) { const t = tabOfSection(d, o.slice(2)); return moveSection(d, sid, t.id, t.items.findIndex((i) => i.id === o.slice(2))) }
        if (o.startsWith('f:')) {
          const at = locate(d, o.slice(2))
          if (!at) return d
          const t = d.tabs.find((x) => x.id === at.tabId)!
          const idx = at.sectionId ? t.items.findIndex((i) => i.id === at.sectionId) : at.index
          return moveSection(d, sid, t.id, idx)
        }
        if (o.startsWith('tab:')) return moveSection(d, sid, o.slice(4))
        return d
      })
    }
  }

  const add = async (target: Target) => { const id = await p.onAddField(target); if (id) onSelect(id) }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="min-w-0 flex-1 basis-56 text-[13px] font-bold text-ink-strong">Dialog title
            <input className="mt-1 h-9 w-full rounded-lg border border-hairline-strong bg-surface px-3 text-sm font-normal" defaultValue={dialog.title} aria-invalid={!dialog.title.trim()} readOnly={ro}
              onChange={(e) => { const v = e.target.value; onChange((d) => setTitle(d, v)) }} />
          </label>
          {p.stored && !ro && (confirmRebuild ? (
            <span role="alert" className="flex flex-wrap items-center gap-2 text-[13px]">
              Rebuild from property groups? Your tab, section and order changes will be replaced.
              <Button size="sm" variant="outline" className="!border-danger !text-danger" onClick={() => { setConfirmRebuild(false); p.onRebuild() }}>Rebuild</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmRebuild(false)}>Cancel</Button>
            </span>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setConfirmRebuild(true)}><RotateCcw size={14} aria-hidden="true" />Rebuild from groups</Button>
          ))}
        </div>
        {!p.stored && <p className="mt-2 text-[13px] text-ink-muted">This layout was built from the property groups. Edit anything and it becomes yours.</p>}
        {issues.length > 0 && (
          <ul aria-label="Dialog problems" className="mt-3 space-y-1">
            {issues.map((i, k) => (
              <li key={k} className={`flex items-start gap-1.5 text-[13px] ${i.level === 'error' ? 'text-danger' : 'text-warning'}`}>
                {i.level === 'error' ? <CircleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />}{i.message}
              </li>
            ))}
          </ul>
        )}

        <DndContext sensors={ro ? [] : sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <div className="mt-5 space-y-8">
            {dialog.tabs.map((t, i) => (
              <TabBlock key={t.id} tab={t} index={i} count={dialog.tabs.length} byId={byId} issuesOf={issuesOf} selectedId={selectedId} onSelect={onSelect} onChange={onChange} onAdd={add} ro={ro} />
            ))}
          </div>
        </DndContext>
        <div className="mt-4">
          <Button variant="outline" size="sm" disabled={ro} onClick={() => onChange((d) => addTab(d).dialog)}><Plus size={14} aria-hidden="true" />Add tab</Button>
        </div>

        {excluded.length > 0 && (
          <section aria-label="Not in the dialog" className="mt-8">
            <h3 className="flex items-center gap-1.5 text-base"><EyeOff size={16} aria-hidden="true" />Not in the dialog</h3>
            <p className="mt-1 text-[13px] text-ink-muted">These properties are kept but will not appear in the generated dialog.</p>
            <ul className="mt-2 divide-y divide-hairline border-y border-hairline">
              {excluded.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 py-2">
                  <span><strong className="text-ink-strong">{x.label || x.key}</strong> <code className="text-[12px] text-ink-muted">{x.key}</code></span>
                  <Button size="sm" variant="outline" disabled={ro} onClick={() => onChange((d) => includeField(d, x.id))} aria-label={`Add ${x.label || x.key} to the dialog`}>Add to dialog</Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <section aria-label="Field configuration" className="min-w-0 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:self-start xl:overflow-y-auto xl:border-l xl:border-hairline xl:pl-6">
        {selected && selectedField ? (
          <div>
            <h3 className="text-base">{selected.label || selected.key}</h3>
            <p className="mb-4 mt-0.5 text-[12px] text-ink-muted">{FIELD_TYPES[selectedField.fieldType].label} · {selected.key}</p>
            <div className="mb-4">
              <label htmlFor="field-location" className="mb-1 block text-[13px] font-bold text-ink-strong">Location in the dialog</label>
              {(() => {
                const at = locate(dialog, selected.id)
                const here = at ? containerKey(at) : ''
                return (
                  <select id="field-location" disabled={ro} className="h-9 w-full rounded-lg border border-hairline-strong bg-surface px-3 text-ink-strong" value={here}
                    onChange={(e) => { const c = containers(dialog).find((x) => x.key === e.target.value); if (c) onChange((d) => placeField(d, selected.id, c)) }}>
                    {!at && <option value="">Not in the dialog</option>}
                    {containers(dialog).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                )
              })()}
              <p className="mt-1 text-[12px] text-ink-muted">Or drag the field in the list.</p>
            </div>
            <FieldForm key={selected.id} inline readOnly={ro} property={selected} field={selectedField} issues={issuesOf(selected.id)} groups={p.groups} actions={p.actionsFor(selected.id)} />
            {!ro && locate(dialog, selected.id) && (
              <div className="mt-4 border-t border-hairline pt-4">
                <Button variant="outline" size="sm" onClick={() => onChange((d) => excludeField(d, selected.id))}><EyeOff size={14} aria-hidden="true" />Remove from dialog</Button>
                <p className="mt-1 text-[12px] text-ink-muted">The property stays; it just will not be a dialog field.</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-ink-muted">Select a field in the list to configure it: label, name, default, validation and where it sits in the dialog.</p>
        )}
      </section>
    </div>
  )
}

interface BlockCtx {
  byId: Map<string, ResolvedField>
  issuesOf: (id: string) => FieldIssue[]
  selectedId: string
  onSelect: (id: string) => void
  onChange: Props['onChange']
  onAdd: (t: Target) => void
  ro: boolean
}

function Droppable({ id, children, empty }: { id: string; children: React.ReactNode; empty: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return <div ref={setNodeRef} className={`${empty ? 'min-h-12' : ''} rounded-md ${isOver ? 'bg-accent-tint' : ''}`}>{children}</div>
}

function TabBlock({ tab, index, count, ...ctx }: { tab: Tab; index: number; count: number } & BlockCtx) {
  const ids = tab.items.map((i) => (i.kind === 'field' ? `f:${i.id}` : `s:${i.id}`))
  return (
    <section aria-label={`Tab ${tab.title || index + 1}`}>
      <div className="flex items-center gap-1 border-b border-hairline pb-1.5">
        <input aria-label={`Tab ${index + 1} title`} aria-invalid={!tab.title.trim()} className={`${titleInput} text-base`} defaultValue={tab.title} readOnly={ctx.ro} placeholder="Tab title" onChange={(e) => { const v = e.target.value; ctx.onChange((d) => renameTab(d, tab.id, v)) }} />
        <button type="button" className={iconBtn} aria-label={`Move tab ${tab.title || index + 1} up`} disabled={ctx.ro || index === 0} onClick={() => ctx.onChange((d) => moveTab(d, tab.id, -1))}><ArrowUp size={15} aria-hidden="true" /></button>
        <button type="button" className={iconBtn} aria-label={`Move tab ${tab.title || index + 1} down`} disabled={ctx.ro || index === count - 1} onClick={() => ctx.onChange((d) => moveTab(d, tab.id, 1))}><ArrowDown size={15} aria-hidden="true" /></button>
        <button type="button" className={iconBtn} aria-label={`Remove tab ${tab.title || index + 1}`} title={count < 2 ? 'The last tab cannot be removed' : 'Its fields move to the neighbouring tab'} disabled={ctx.ro || count < 2} onClick={() => ctx.onChange((d) => removeTab(d, tab.id))}><Trash2 size={15} aria-hidden="true" /></button>
      </div>
      <Droppable id={`tab:${tab.id}`} empty={!tab.items.length}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul aria-label={`Items in ${tab.title || 'tab'}`} className="mt-1">
            {tab.items.map((it, i) => it.kind === 'field'
              ? <FieldRow key={it.id} propertyId={it.id} container={`tab:${tab.id}`} first={i === 0} last={i === tab.items.length - 1} {...ctx} />
              : <SectionBlock key={it.id} section={it} tabId={tab.id} first={i === 0} last={i === tab.items.length - 1} {...ctx} />)}
          </ul>
        </SortableContext>
        {!tab.items.length && <p className="px-2 py-3 text-[13px] text-ink-muted">No fields. Drag one here or add a field.</p>}
      </Droppable>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="outline" disabled={ctx.ro} onClick={() => ctx.onChange((d) => addSection(d, tab.id).dialog)}><Plus size={14} aria-hidden="true" />Add section</Button>
        <Button size="sm" variant="outline" disabled={ctx.ro} onClick={() => ctx.onAdd({ tabId: tab.id })} aria-label={`Add field to ${tab.title || 'tab'}`}><Plus size={14} aria-hidden="true" />Add field</Button>
      </div>
    </section>
  )
}

function SectionBlock({ section, tabId, first, last, ...ctx }: { section: Section; tabId: string; first: boolean; last: boolean } & BlockCtx) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: `s:${section.id}`, data: { kind: 'section' } })
  const ids = section.fieldIds.map((id) => `f:${id}`)
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`my-2 rounded-lg bg-sand/70 p-2 ${isDragging ? 'relative z-10 shadow-[0_8px_24px_-6px_#1010141f]' : ''}`}>
      <div className="flex items-center gap-1">
        <button ref={setActivatorNodeRef} type="button" disabled={ctx.ro} className={`${iconBtn} cursor-grab touch-none`} aria-label={`Reorder section ${section.title}. Press space, then use the arrow keys.`} {...attributes} {...listeners}><GripVertical size={16} aria-hidden="true" /></button>
        <input aria-label={`Section title: ${section.title || 'untitled'}`} aria-invalid={!section.title.trim()} className={titleInput} defaultValue={section.title} readOnly={ctx.ro} placeholder="Section title" onChange={(e) => { const v = e.target.value; ctx.onChange((d) => renameSection(d, section.id, v)) }} />
        <button type="button" className={iconBtn} aria-label={`Move section ${section.title} up`} disabled={ctx.ro || first} onClick={() => ctx.onChange((d) => moveItem(d, section.id, -1))}><ArrowUp size={15} aria-hidden="true" /></button>
        <button type="button" className={iconBtn} aria-label={`Move section ${section.title} down`} disabled={ctx.ro || last} onClick={() => ctx.onChange((d) => moveItem(d, section.id, 1))}><ArrowDown size={15} aria-hidden="true" /></button>
        <button type="button" className={iconBtn} aria-label={`Remove section ${section.title}`} disabled={ctx.ro} title="Its fields stay, in the tab" onClick={() => ctx.onChange((d) => removeSection(d, section.id))}><Trash2 size={15} aria-hidden="true" /></button>
      </div>
      <Droppable id={`sec:${section.id}`} empty={!section.fieldIds.length}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul aria-label={`Fields in ${section.title || 'section'}`} className="ml-6 mt-1">
            {section.fieldIds.map((id, i) => <FieldRow key={id} propertyId={id} container={`sec:${section.id}`} first={i === 0} last={i === section.fieldIds.length - 1} {...ctx} />)}
          </ul>
        </SortableContext>
        {!section.fieldIds.length && <p className="ml-6 px-2 py-2 text-[13px] text-ink-muted">Empty section. Drag a field here or add one.</p>}
      </Droppable>
      <div className="ml-6 mt-1"><Button size="sm" variant="ghost" disabled={ctx.ro} onClick={() => ctx.onAdd({ tabId, sectionId: section.id })} aria-label={`Add field to ${section.title || 'section'}`}><Plus size={14} aria-hidden="true" />Add field</Button></div>
    </li>
  )
}

function FieldRow({ propertyId, container, first, last, byId, issuesOf, selectedId, onSelect, onChange, ro }: { propertyId: string; container: string; first: boolean; last: boolean } & BlockCtx) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: `f:${propertyId}`, data: { kind: 'field', container } })
  const f = byId.get(propertyId)
  if (!f) return null
  const issues = issuesOf(propertyId)
  const errors = issues.filter((i) => i.level === 'error')
  const name = f.label || f.key
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1 rounded-md ${propertyId === selectedId ? 'bg-ink-strong/5' : 'hover:bg-ink-strong/[0.03]'} ${isDragging ? 'relative z-10 bg-bg shadow-[0_8px_24px_-6px_#1010141f]' : ''}`}>
      <button ref={setActivatorNodeRef} type="button" disabled={ro} className={`${iconBtn} cursor-grab touch-none`} aria-label={`Reorder ${name}. Press space, then use the arrow keys.`} {...attributes} {...listeners}><GripVertical size={16} aria-hidden="true" /></button>
      <button type="button" onClick={() => onSelect(propertyId)} aria-pressed={propertyId === selectedId} aria-label={`Select ${name}`} className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-x-3 gap-y-0.5 py-2 pr-1 text-left">
        <span className="min-w-0 basis-32 truncate font-bold text-ink-strong">{name}</span>
        <span className="text-[12px] text-ink-muted">{FIELD_TYPES[f.fieldType].label}</span>
        {f.required && <span className="rounded-md bg-sand px-1.5 py-0.5 text-[11px] font-bold text-ink">required</span>}
        {errors.length > 0 ? <span className="flex items-center gap-1 text-[12px] font-semibold text-danger"><CircleAlert size={13} aria-hidden="true" />{errors[0].message}</span>
          : issues.length > 0 ? <span className="flex items-center gap-1 text-[12px] font-semibold text-warning"><AlertTriangle size={13} aria-hidden="true" />{issues[0].message}</span> : null}
      </button>
      <button type="button" className={iconBtn} aria-label={`Move ${name} up`} disabled={ro || first} onClick={() => onChange((d) => moveItem(d, propertyId, -1))}><ArrowUp size={15} aria-hidden="true" /></button>
      <button type="button" className={iconBtn} aria-label={`Move ${name} down`} disabled={ro || last} onClick={() => onChange((d) => moveItem(d, propertyId, 1))}><ArrowDown size={15} aria-hidden="true" /></button>
    </li>
  )
}
