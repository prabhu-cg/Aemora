import { useState } from 'react'
import { AlertTriangle, CircleAlert, Lightbulb, RotateCcw } from 'lucide-react'
import { suggestShowWhen } from '../showhide'
import { Button } from '../../../components/ui/Button'
import type { ComponentDef } from '../../components/schema'
import { fieldTypeWarning, suggestFieldType, type ResolvedField } from '../engine'
import { FIELD_TYPES, fieldTypeList } from '../fieldTypes'
import type { FieldTypeId } from '../schema'
import type { FieldIssue } from '../validate'

export function MappingView({ component, fields, issues, selectedId, onSelect, onFieldType, onResetAll, onShowWhen, readOnly = false }: {
  readOnly?: boolean
  component: ComponentDef
  fields: ResolvedField[]
  issues: FieldIssue[]
  selectedId: string
  onSelect: (propertyId: string) => void
  onFieldType: (propertyId: string, t: FieldTypeId) => void
  onResetAll: () => void
  /** Make `targetId` shown only when `controllerId` is checked. */
  onShowWhen: (targetId: string, controllerId: string) => void
}) {
  const [dismissed, setDismissed] = useState(false)
  if (!fields.length) return <p className="rounded-lg border border-dashed border-hairline-strong p-4 text-ink-muted">Add properties first. Each one becomes an AEM field.</p>
  const edited = fields.filter((f) => f.edited).length
  const suggestions = readOnly || dismissed ? [] : suggestShowWhen(fields, component)
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-ink-muted">Every property gets a suggested Granite field. Change any of them; the choice is yours.</p>
        <Button size="sm" variant="outline" disabled={readOnly || !edited} onClick={onResetAll}><RotateCcw size={14} aria-hidden="true" />Reset all to suggestions{edited ? ` (${edited})` : ''}</Button>
      </div>
      {suggestions.length > 0 && (
        <div role="region" aria-label="Suggested show-only-when rules" className="mb-3 rounded-lg border border-hairline bg-info-soft p-3 text-[13px] text-ink-strong">
          <p className="flex items-center gap-2 font-bold"><Lightbulb size={15} aria-hidden="true" />These look like they belong together</p>
          <p className="mt-1 text-ink-muted">Right now each of these fields is always visible. Make them appear only while their checkbox is checked?</p>
          <ul className="mt-2 space-y-1.5">
            {suggestions.map((s) => (
              <li key={s.targetId} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 basis-56">Show <strong>{s.targetLabel}</strong> only when <strong>{s.controllerLabel}</strong> is checked{s.source === 'design' && <span className="ml-2 rounded-md border border-hairline px-1.5 py-0.5 text-[11px] text-ink-muted">as in the design</span>}</span>
                <Button size="sm" variant="outline" onClick={() => onShowWhen(s.targetId, s.controllerId)} aria-label={`Show ${s.targetLabel} only when ${s.controllerLabel} is checked`}>Apply</Button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            {suggestions.length > 1 && <Button size="sm" onClick={() => suggestions.forEach((s) => onShowWhen(s.targetId, s.controllerId))}>Apply all</Button>}
            <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>Not now</Button>
          </div>
        </div>
      )}
      <ul aria-label={`AEM fields for ${component.name}`} className="border-y border-hairline">
        {fields.map((f) => {
          const p = component.properties.find((x) => x.id === f.propertyId)!
          const mine = issues.filter((i) => i.propertyId === f.propertyId)
          const errors = mine.filter((i) => i.level === 'error')
          const warn = fieldTypeWarning(p, f.fieldType)
          return (
            <li key={f.propertyId} className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline px-2 py-2 first:border-t-0 ${f.propertyId === selectedId ? 'bg-accent-tint' : 'hover:bg-sand'}`}>
              <button type="button" onClick={() => onSelect(f.propertyId)} aria-pressed={f.propertyId === selectedId} aria-label={`Configure ${f.label || f.key}`}
                className="flex min-w-0 flex-1 basis-56 cursor-pointer flex-wrap items-center gap-x-3 gap-y-0.5 text-left">
                <span className="min-w-0 basis-40 truncate font-bold text-ink-strong">{f.label || f.key}</span>
                <span className="text-[12px] text-ink-muted">{p.type}</span>
                {f.edited && <span className="rounded-md bg-accent-tint px-1.5 py-0.5 text-[11px] font-bold text-accent-text">edited</span>}
                {f.group && <span className="truncate rounded-md border border-hairline px-1.5 py-0.5 text-[11px] text-ink-muted">{f.group}</span>}
                {f.showWhen && (() => { const c = fields.find((x) => x.propertyId === f.showWhen!.propertyId); return <span className="truncate rounded-md border border-hairline px-1.5 py-0.5 text-[11px] text-ink-muted">{c ? (c.fieldType === 'select' ? `Shown when ${c.label} is ${f.showWhen!.value ?? '…'}` : `Shown when ${c.label} is checked`) : 'Shown when a missing field…'}</span> })()}
                {errors.length > 0 ? (
                  <span className="flex items-center gap-1 text-[12px] font-semibold text-danger"><CircleAlert size={13} aria-hidden="true" />{errors[0].message}</span>
                ) : (mine.length > 0 || warn) ? (
                  <span className="flex items-center gap-1 text-[12px] font-semibold text-warning"><AlertTriangle size={13} aria-hidden="true" />{(mine[0]?.message) ?? warn}</span>
                ) : null}
              </button>
              <select aria-label={`AEM field type for ${f.label || f.key}`} disabled={readOnly} value={f.fieldType} onChange={(e) => onFieldType(f.propertyId, e.target.value as FieldTypeId)}
                className="h-8 w-52 rounded-lg border border-hairline-strong bg-surface px-2 text-[13px] text-ink-strong">
                {fieldTypeList.map((t) => <option key={t.id} value={t.id}>{t.label}{t.id === suggestFieldType(p) ? ' (suggested)' : ''}</option>)}
              </select>
              <code className="hidden w-52 truncate text-[11px] text-ink-muted xl:block" title={FIELD_TYPES[f.fieldType].resourceType}>{FIELD_TYPES[f.fieldType].resourceType.replace('granite/ui/components/coral/foundation/', '…/')}</code>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
