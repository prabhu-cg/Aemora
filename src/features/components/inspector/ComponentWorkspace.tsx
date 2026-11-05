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
import { resolveComponent } from '../../mapping/engine'
import { pruneMappings, resetMapping, setConstraint, setFieldType, setMultifield, setOverrides, addSubfield, patchSubfield, removeSubfield } from '../../mapping/ops'
import { validateFields } from '../../mapping/validate'
import { FieldPanel, type FieldActions } from '../../mapping/ui/FieldPanel'
import { MappingView } from '../../mapping/ui/MappingView'
import type { Mapping } from '../../mapping/schema'
import { resolveDialog, placeField, validateDialog, pruneDialogs } from '../../dialog/ops'
import type { ComponentDialog } from '../../dialog/schema'
import { DialogEditor, type Target } from '../../dialog/ui/DialogEditor'
import { DialogPreview } from '../../preview/ui/DialogPreview'
import { XmlPanel } from '../../xml/ui/XmlPanel'
import { PropertyList } from './PropertyList'
import { PropertyPanel } from './PropertyPanel'
import { ChildrenEditor, StandardSuggestions, UnsupportedList } from './Extras'

type Undo = { kind: 'property'; property: Property; index: number } | { kind: 'unsupported'; item: Unsupported }

export function ComponentWorkspace({ project, readOnly = false }: { project: Project; readOnly?: boolean }) {
  // In a read-only project every write is a no-op, whatever calls it. The controls are disabled as well.
  const mutate: typeof mutateProject = readOnly ? async () => project : mutateProject
  const [selectedId, setSelectedId] = useState('')
  const [propId, setPropId] = useState('')
  const [error, setError] = useState('')
  const [undo, setUndo] = useState<Undo | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [view, setView] = useState<'properties' | 'fields' | 'dialog' | 'preview' | 'xml'>('properties')
  const [fieldPropId, setFieldPropId] = useState('')
  const [dialogSelected, setDialogSelected] = useState('')
  const [lastFieldProp, setLastFieldProp] = useState<Property | undefined>(undefined)
  const [lastProperty, setLastProperty] = useState<Property | undefined>(undefined)

  const components = project.components
  const component = components.find((c) => c.id === selectedId) ?? components[0]
  const issues = useMemo(() => (component ? validateComponent(component) : []), [component])
  const fields = useMemo(() => (component ? resolveComponent(component, project.mappings) : []), [component, project.mappings])
  const fieldIssues = useMemo(() => validateFields(fields), [fields])

  if (!component) return <p className="text-ink-muted">No components yet. Bring in a design above.</p>
  const property = component.properties.find((p) => p.id === propId)
  // Keep showing the last property while the panel slides out.
  if (property && property !== lastProperty) setLastProperty(property)
  const shownProperty = property ?? lastProperty
  const fieldProperty = component.properties.find((p) => p.id === fieldPropId)
  if (fieldProperty && fieldProperty !== lastFieldProp) setLastFieldProp(fieldProperty)
  const shownFieldProperty = fieldProperty ?? lastFieldProp

  const edit = (fn: (c: ComponentDef) => ComponentDef) =>
    mutate(project.id, (p) => {
      const components = p.components.map((c) => (c.id === component.id ? fn(c) : c))
      return { ...p, components, mappings: pruneMappings(p.mappings, components) }
    })
      .then(() => setError(''))
      .catch(() => setError('Could not save that change to this browser. It was not applied.'))

  const editMappings = (fn: (ms: Mapping[], c: ComponentDef, p: Property) => Mapping[], propertyId: string) =>
    mutate(project.id, (pr) => {
      const c = pr.components.find((x) => x.id === component.id)
      const prop = c?.properties.find((x) => x.id === propertyId)
      return c && prop ? { ...pr, mappings: fn(pr.mappings, c, prop) } : pr
    }).then(() => setError('')).catch(() => setError('Could not save that change to this browser. It was not applied.'))

  const actionsFor = (propertyId: string): FieldActions => ({
    setFieldType: async (t) => {
      // Computed against the freshly stored mapping, inside the save, so it can never be stale.
      const result = { dropped: [] as string[] }
      await editMappings((ms, c, p) => { const r = setFieldType(ms, c, p, t); result.dropped = r.dropped; return r.mappings }, propertyId)
      return result.dropped
    },
    setOverrides: (patch) => { editMappings((ms, c, p) => setOverrides(ms, c, p, patch), propertyId) },
    setConstraint: (key, value) => { editMappings((ms, c, p) => setConstraint(ms, c, p, key, value), propertyId) },
    setMultifield: (patch) => { editMappings((ms, c, p) => setMultifield(ms, c, p, patch), propertyId) },
    addSubfield: () => { editMappings((ms, c, p) => addSubfield(ms, c, p), propertyId) },
    patchSubfield: (id, patch) => { editMappings((ms, c, p) => patchSubfield(ms, c, p, id, patch), propertyId) },
    removeSubfield: (id) => { editMappings((ms, c, p) => removeSubfield(ms, c, p, id), propertyId) },
    reset: () => { editMappings((ms) => resetMapping(ms, propertyId), propertyId) },
  })
  const fieldErrors = fieldIssues.filter((i) => i.level === 'error').length
  const storedDialog = project.dialog?.components?.[component.id]
  const dialog = resolveDialog(component, storedDialog)
  const dialogErrors = validateDialog(dialog).filter((i) => i.level === 'error').length

  /** Apply a change to the freshly stored dialog. The first edit stores the layout the user was looking at. */
  const commitDialog = (fn: (d: ComponentDialog) => ComponentDialog) =>
    mutate(project.id, (pr) => {
      const c = pr.components.find((x) => x.id === component.id)
      if (!c) return pr
      const current = resolveDialog(c, pr.dialog.components[c.id])
      return { ...pr, dialog: { components: { ...pr.dialog.components, [c.id]: fn(current) } } }
    }).then(() => setError('')).catch(() => setError('Could not save that change to this browser. It was not applied.'))

  const addDialogField = async (target: Target): Promise<string | undefined> => {
    const made = { id: '' }
    try {
      await mutate(project.id, (pr) => {
        const c = pr.components.find((x) => x.id === component.id)
        if (!c) return pr
        const added = addProperty(c, { label: 'New field' })
        made.id = added.property.id
        const current = resolveDialog(c, pr.dialog.components[c.id])
        const next = placeField(resolveDialog(added.component, current), added.property.id, target)
        return { ...pr, components: pr.components.map((x) => (x.id === c.id ? added.component : x)), dialog: { components: { ...pr.dialog.components, [c.id]: next } } }
      })
      setError('')
      return made.id || undefined
    } catch {
      setError('Could not add the field. Nothing was changed.')
      return undefined
    }
  }
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
            <input className="mt-1 h-9 w-full rounded-lg border border-hairline-strong bg-surface px-3 text-base font-extrabold tracking-tight" defaultValue={component.name} readOnly={readOnly} aria-invalid={!component.name.trim()}
              onChange={(e) => { const name = e.target.value; edit((c) => patchComponent(c, { name })) }} />
          </label>
          <label className="text-[13px] font-bold text-ink-strong">Type
            <select disabled={readOnly} className="mt-1 block h-9 rounded-lg border border-hairline-strong bg-surface px-2 text-sm" value={component.type} onChange={(e) => { const type = e.target.value as ComponentDef['type']; edit((c) => patchComponent(c, { type })) }}>
              {COMPONENT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          {confirmDelete ? (
            <span role="alert" className="flex items-center gap-2 text-[13px]">
              Delete “{component.name}” and its properties?
              <Button size="sm" variant="outline" className="!border-danger !text-danger" onClick={() => { setConfirmDelete(false); setPropId(''); mutate(project.id, (p) => { const components = p.components.filter((c) => c.id !== component.id); return { ...p, components, mappings: pruneMappings(p.mappings, components), dialog: pruneDialogs(p.dialog, components), generatedXml: Object.fromEntries(Object.entries(p.generatedXml ?? {}).filter(([id]) => components.some((c) => c.id === id))) } }).catch(() => setError('Could not delete the component.')) }}>Delete</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </span>
          ) : (
            <Button variant="ghost" size="sm" disabled={readOnly} onClick={() => setConfirmDelete(true)} aria-label={`Delete component ${component.name}`}><Trash2 size={15} aria-hidden="true" />Delete</Button>
          )}
        </div>
        <label className="mt-3 block text-[13px] font-bold text-ink-strong">Description
          <input className="mt-1 h-9 w-full rounded-lg border border-hairline-strong bg-surface px-3 text-sm font-normal" defaultValue={component.description} readOnly={readOnly} placeholder="What this component is for"
            onChange={(e) => { const description = e.target.value; edit((c) => patchComponent(c, { description })) }} />
        </label>

        {error && <p role="alert" className="mt-3 rounded-lg bg-danger-soft p-3 text-[13px] font-semibold text-danger">{error}</p>}

        <div role="tablist" aria-label="Component view" className="mt-6 flex gap-1 border-b border-hairline">
          {([['properties', 'Properties'], ['fields', 'AEM fields'], ['dialog', 'Dialog'], ['preview', 'Preview'], ['xml', 'XML']] as const).map(([id, label]) => (
            <button key={id} role="tab" type="button" aria-selected={view === id} onClick={() => { setView(id); setPropId(''); setFieldPropId(''); setDialogSelected('') }}
              className={`-mb-px h-9 cursor-pointer border-b-2 px-3 text-[14px] font-bold ${view === id ? 'border-accent text-accent-text' : 'border-transparent text-ink hover:text-ink-strong'}`}>
              {label}{id === 'fields' && fieldErrors > 0 && <span className="ml-2 text-[12px] font-semibold text-danger">{fieldErrors} to fix</span>}{id === 'dialog' && dialogErrors > 0 && <span className="ml-2 text-[12px] font-semibold text-danger">{dialogErrors} to fix</span>}
            </button>
          ))}
        </div>

        {view === 'xml' ? (
          <div role="tabpanel" className="mt-4">
            <XmlPanel
              readOnly={readOnly}
              key={component.id} project={project} component={component} dialog={dialog} fields={fields}
              onStore={(entry) => mutate(project.id, (pr) => {
                const rest = { ...(pr.generatedXml ?? {}) }
                if (entry) rest[component.id] = { xml: entry.xml, base: entry.base, format: entry.format, edited: true, generatedAt: new Date().toISOString() }
                else delete rest[component.id]
                return { ...pr, generatedXml: rest }
              }).catch(() => setError('Could not save your XML edits to this browser. They were not applied.'))}
            />
          </div>
        ) : view === 'preview' ? (
          <div role="tabpanel" className="mt-4">
            <DialogPreview key={component.id} component={component} dialog={dialog} fields={fields} />
          </div>
        ) : view === 'dialog' ? (
          <div role="tabpanel" className="mt-4">
            <DialogEditor
              readOnly={readOnly}
              component={component} dialog={dialog} stored={!!storedDialog} fields={fields} fieldIssues={fieldIssues} groups={groups}
              selectedId={dialogSelected} onSelect={setDialogSelected} onChange={(fn) => { void commitDialog(fn) }}
              onAddField={addDialogField}
              onRebuild={() => { setDialogSelected(''); mutate(project.id, (pr) => { const rest = { ...pr.dialog.components }; delete rest[component.id]; return { ...pr, dialog: { components: rest } } }) }}
              actionsFor={actionsFor}
            />
          </div>
        ) : view === 'fields' ? (
          <div role="tabpanel" className="mt-4">
            <MappingView
              readOnly={readOnly}
              component={component} fields={fields} issues={fieldIssues} selectedId={fieldPropId} onSelect={setFieldPropId}
              onFieldType={(pid, t) => { void actionsFor(pid).setFieldType(t) }}
              onResetAll={() => { mutate(project.id, (pr) => ({ ...pr, mappings: pr.mappings.filter((m) => m.componentId !== component.id) })) }}
            />
          </div>
        ) : (
        <div role="tabpanel">
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base">Properties <span className="tabular text-ink-muted">({component.properties.length})</span></h3>
          <div className="flex items-center gap-3">
            {issues.length > 0 && (
              <span role="status" className={`text-[13px] font-semibold ${errors ? 'text-danger' : 'text-warning'}`}>
                {errors ? `${errors} to fix` : ''}{errors && warnings ? ', ' : ''}{warnings ? `${warnings} to review` : ''}
              </span>
            )}
            <Button size="sm" disabled={readOnly} onClick={() => {
              const added = addProperty(component, { label: 'New property' })
              edit(() => added.component); setPropId(added.property.id)
            }}><Plus size={15} aria-hidden="true" />Add property</Button>
          </div>
        </div>

        {suggestedCount > 0 && !readOnly && (
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
            <PropertyList component={component} issues={issues} selectedId={propId} onSelect={setPropId} onMove={(from, to) => edit((c) => moveProperty(c, from, to))} readOnly={readOnly} />
          ) : (
            <p className="rounded-lg border border-dashed border-hairline-strong p-4 text-ink-muted">No properties yet. Add one, or start from the standard properties below.</p>
          )}
        </div>
        {groups.length > 0 && <p className="mt-2 text-[12px] text-ink-muted">Groups: {groups.join(' · ')}. Each group becomes a tab (or a section) in the dialog.</p>}

        {!readOnly && <StandardSuggestions component={component} onAdd={(props) => edit((c) => addSuggested(c, props))} />}

        <UnsupportedList
          readOnly={readOnly}
          items={component.unsupported}
          onPromote={(id) => { const r = promoteUnsupported(component, id); if (r) { edit(() => r.component); setPropId(r.property.id) } }}
          onDismiss={(id) => { const item = component.unsupported.find((u) => u.id === id); if (item) { setUndo({ kind: 'unsupported', item }); edit((c) => dismissUnsupported(c, id)) } }}
        />
        <ChildrenEditor readOnly={readOnly} component={component} siblings={components} onChange={(i, patch) => edit((c) => patchChild(c, i, patch))} />
        </div>
        )}
      </div>

      {shownFieldProperty && view === 'fields' && (
        <FieldPanel
          readOnly={readOnly}
          open={!!fieldProperty}
          property={shownFieldProperty}
          field={fields.find((f) => f.propertyId === shownFieldProperty.id) ?? resolveComponent({ ...component, properties: [shownFieldProperty] }, project.mappings)[0]}
          issues={fieldIssues.filter((i) => i.propertyId === shownFieldProperty.id)}
          groups={groups}
          actions={actionsFor(shownFieldProperty.id)}
          onClose={() => setFieldPropId('')}
        />
      )}

      {shownProperty && view === 'properties' && (
        <PropertyPanel
          readOnly={readOnly}
          open={!!property}
          component={component}
          property={shownProperty}
          issues={issues.filter((i) => i.propertyId === shownProperty.id)}
          onChange={(patch: PropertyPatch) => edit((c) => patchProperty(c, shownProperty.id, patch))}
          onRemove={() => {
            const r = removeProperty(component, shownProperty.id)
            if (r) { setUndo({ kind: 'property', property: r.removed, index: r.index }); setPropId(''); edit(() => r.component) }
          }}
          onClose={() => setPropId('')}
        />
      )}
    </div>
  )
}
