import { useMemo, useState } from 'react'
import { Plus, Trash2, Undo2 } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import type { Project } from '../../projects/schema'
import { mutateProject } from '../../projects/repo'
import { COMPONENT_TYPES, type ComponentDef, type Property, type Unsupported } from '../schema'
import {
  addProperty, addSuggested, confirmSuggested, dismissUnsupported, groupsOf, insertProperty, moveProperty, patchChild, patchComponent,
  patchProperty, promoteUnsupported, removeProperty, removeSuggested, restoreUnsupported, type PropertyPatch,
} from '../ops'
import { validateComponent } from '../validate'
import { PropertyList } from './PropertyList'
import { PropertyPanel } from './PropertyPanel'
import { ChildrenEditor, StandardSuggestions, UnsupportedList } from './Extras'

type Undo = { kind: 'property'; property: Property; index: number } | { kind: 'unsupported'; item: Unsupported }

export function ComponentWorkspace({ project }: { project: Project }) {
  const [selectedId, setSelectedId] = useState('')
  const [propId, setPropId] = useState('')
  const [error, setError] = useState('')
  const [undo, setUndo] = useState<Undo | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const components = project.components
  const component = components.find((c) => c.id === selectedId) ?? components[0]
  const issues = useMemo(() => (component ? validateComponent(component) : []), [component])

  if (!component) return <p className="text-ink-muted">No components yet. Bring in a design above.</p>
  const property = component.properties.find((p) => p.id === propId)

  const edit = (fn: (c: ComponentDef) => ComponentDef) =>
    mutateProject(project.id, (p) => ({ ...p, components: p.components.map((c) => (c.id === component.id ? fn(c) : c)) }))
      .then(() => setError(''))
      .catch(() => setError('Could not save that change to this browser. It was not applied.'))

  const errors = issues.filter((i) => i.level === 'error').length
  const warnings = issues.length - errors
  const suggestedCount = component.properties.filter((p) => p.origin.suggested).length
  const groups = groupsOf(component)

  return (
    <div className="grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <nav aria-label="Components">
        <ul aria-label="Components in this project" className="flex flex-row flex-wrap gap-1 lg:flex-col">
          {components.map((c) => {
            const n = validateComponent(c).filter((i) => i.level === 'error').length
            return (
              <li key={c.id}>
                <button
                  type="button" aria-current={c.id === component.id ? 'true' : undefined}
                  onClick={() => { setSelectedId(c.id); setPropId(''); setUndo(null); setConfirmDelete(false) }}
                  className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm font-medium ${c.id === component.id ? 'bg-ink-strong/5 font-semibold text-ink-strong' : 'text-ink-muted hover:bg-ink-strong/5 hover:text-ink-strong'}`}
                >
                  <span className="truncate">{c.name}</span>
                  <span className={`tabular text-[12px] ${n ? 'text-danger' : 'text-ink-muted'}`}>{n ? `${n} to fix` : c.properties.length}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <div key={component.id} className="min-w-0">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1 basis-56 text-[13px] font-bold text-ink-strong">Component name
            <input className="mt-1 h-9 w-full rounded-lg border border-hairline-strong bg-surface px-3 text-base font-extrabold tracking-tight" defaultValue={component.name} aria-invalid={!component.name.trim()}
              onChange={(e) => { const name = e.target.value; edit((c) => patchComponent(c, { name })) }} />
          </label>
          <label className="text-[13px] font-bold text-ink-strong">Type
            <select className="mt-1 block h-9 rounded-lg border border-hairline-strong bg-surface px-2 text-sm" value={component.type} onChange={(e) => { const type = e.target.value as ComponentDef['type']; edit((c) => patchComponent(c, { type })) }}>
              {COMPONENT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          {confirmDelete ? (
            <span role="alert" className="flex items-center gap-2 text-[13px]">
              Delete “{component.name}” and its properties?
              <Button size="sm" variant="outline" className="!border-danger !text-danger" onClick={() => { setConfirmDelete(false); setPropId(''); mutateProject(project.id, (p) => ({ ...p, components: p.components.filter((c) => c.id !== component.id) })).catch(() => setError('Could not delete the component.')) }}>Delete</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </span>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} aria-label={`Delete component ${component.name}`}><Trash2 size={15} aria-hidden="true" />Delete</Button>
          )}
        </div>
        <label className="mt-3 block text-[13px] font-bold text-ink-strong">Description
          <input className="mt-1 h-9 w-full rounded-lg border border-hairline-strong bg-surface px-3 text-sm font-normal" defaultValue={component.description} placeholder="What this component is for"
            onChange={(e) => { const description = e.target.value; edit((c) => patchComponent(c, { description })) }} />
        </label>

        {error && <p role="alert" className="mt-3 rounded-lg bg-danger-soft p-3 text-[13px] font-semibold text-danger">{error}</p>}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base">Properties <span className="tabular text-ink-muted">({component.properties.length})</span></h3>
          <div className="flex items-center gap-3">
            {issues.length > 0 && (
              <span role="status" className={`text-[13px] font-semibold ${errors ? 'text-danger' : 'text-warning'}`}>
                {errors ? `${errors} to fix` : ''}{errors && warnings ? ', ' : ''}{warnings ? `${warnings} to review` : ''}
              </span>
            )}
            <Button size="sm" onClick={() => {
              const added = addProperty(component, { label: 'New property' })
              edit(() => added.component); setPropId(added.property.id)
            }}><Plus size={15} aria-hidden="true" />Add property</Button>
          </div>
        </div>

        {suggestedCount > 0 && (
          <div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-accent-tint p-3 text-[13px] text-accent-text">
            <span><strong>{suggestedCount} suggested from detection.</strong> Check them before using them.</span>
            <span className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => edit((c) => confirmSuggested(c))}>Keep all</Button>
              <Button size="sm" variant="ghost" onClick={() => { setPropId(''); edit((c) => removeSuggested(c)) }}>Remove all</Button>
            </span>
          </div>
        )}

        {undo && (
          <p role="status" className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-info-soft p-3 text-[13px] font-semibold text-info">
            <span>{undo.kind === 'property' ? `Removed “${undo.property.label}”.` : `Dismissed “${undo.item.name}”.`}</span>
            <span className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { edit((c) => undo.kind === 'property' ? insertProperty(c, undo.property, undo.index) : restoreUnsupported(c, undo.item)); setUndo(null) }}><Undo2 size={14} aria-hidden="true" />Undo</Button>
              <Button size="sm" variant="ghost" onClick={() => setUndo(null)}>Dismiss</Button>
            </span>
          </p>
        )}

        <div className="mt-3">
          {component.properties.length ? (
            <PropertyList component={component} issues={issues} selectedId={propId} onSelect={setPropId} onMove={(from, to) => edit((c) => moveProperty(c, from, to))} />
          ) : (
            <p className="rounded-lg border border-dashed border-hairline-strong p-4 text-ink-muted">No properties yet. Add one, or start from the standard properties below.</p>
          )}
        </div>
        {groups.length > 0 && <p className="mt-2 text-[12px] text-ink-muted">Groups: {groups.join(' · ')}. Each group becomes a tab (or a section) in the dialog.</p>}

        <StandardSuggestions component={component} onAdd={(props) => edit((c) => addSuggested(c, props))} />

        <UnsupportedList
          items={component.unsupported}
          onPromote={(id) => { const r = promoteUnsupported(component, id); if (r) { edit(() => r.component); setPropId(r.property.id) } }}
          onDismiss={(id) => { const item = component.unsupported.find((u) => u.id === id); if (item) { setUndo({ kind: 'unsupported', item }); edit((c) => dismissUnsupported(c, id)) } }}
        />
        <ChildrenEditor component={component} siblings={components} onChange={(i, patch) => edit((c) => patchChild(c, i, patch))} />
      </div>

      {property && (
        <PropertyPanel
          key={property.id}
          component={component}
          property={property}
          issues={issues.filter((i) => i.propertyId === property.id)}
          onChange={(patch: PropertyPatch) => edit((c) => patchProperty(c, property.id, patch))}
          onRemove={() => {
            const r = removeProperty(component, property.id)
            if (r) { setUndo({ kind: 'property', property: r.removed, index: r.index }); setPropId(''); edit(() => r.component) }
          }}
          onClose={() => setPropId('')}
        />
      )}
    </div>
  )
}
