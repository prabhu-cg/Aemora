import { AlertTriangle, CircleAlert, RotateCcw } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import type { ComponentDef } from '../../components/schema'
import { fieldTypeWarning, suggestFieldType, type ResolvedField } from '../engine'
import { FIELD_TYPES, fieldTypeList } from '../fieldTypes'
import type { FieldTypeId } from '../schema'
import type { FieldIssue } from '../validate'

export function MappingView({ component, fields, issues, selectedId, onSelect, onFieldType, onResetAll }: {
  component: ComponentDef
  fields: ResolvedField[]
  issues: FieldIssue[]
  selectedId: string
  onSelect: (propertyId: string) => void
  onFieldType: (propertyId: string, t: FieldTypeId) => void
  onResetAll: () => void
}) {
  if (!fields.length) return <p className="rounded-lg border border-dashed border-hairline-strong p-4 text-ink-muted">Add properties first. Each one becomes an AEM field.</p>
  const edited = fields.filter((f) => f.edited).length
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-ink-muted">Every property gets a suggested Granite field. Change any of them; the choice is yours.</p>
        <Button size="sm" variant="outline" disabled={!edited} onClick={onResetAll}><RotateCcw size={14} aria-hidden="true" />Reset all to suggestions{edited ? ` (${edited})` : ''}</Button>
      </div>
      <ul aria-label={`AEM fields for ${component.name}`} className="border-y border-hairline">
        {fields.map((f) => {
          const p = component.properties.find((x) => x.id === f.propertyId)!
          const mine = issues.filter((i) => i.propertyId === f.propertyId)
          const errors = mine.filter((i) => i.level === 'error')
          const warn = fieldTypeWarning(p, f.fieldType)
          return (
            <li key={f.propertyId} className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline px-2 py-2 first:border-t-0 ${f.propertyId === selectedId ? 'bg-ink-strong/5' : 'hover:bg-ink-strong/[0.03]'}`}>
              <button type="button" onClick={() => onSelect(f.propertyId)} aria-pressed={f.propertyId === selectedId} aria-label={`Configure ${f.label || f.key}`}
                className="flex min-w-0 flex-1 basis-56 cursor-pointer flex-wrap items-center gap-x-3 gap-y-0.5 text-left">
                <span className="min-w-0 basis-40 truncate font-bold text-ink-strong">{f.label || f.key}</span>
                <span className="text-[12px] text-ink-muted">{p.type}</span>
                {f.edited && <span className="rounded-md bg-accent-tint px-1.5 py-0.5 text-[11px] font-bold text-accent-text">edited</span>}
                {f.group && <span className="truncate rounded-md border border-hairline px-1.5 py-0.5 text-[11px] text-ink-muted">{f.group}</span>}
                {errors.length > 0 ? (
                  <span className="flex items-center gap-1 text-[12px] font-semibold text-danger"><CircleAlert size={13} aria-hidden="true" />{errors[0].message}</span>
                ) : (mine.length > 0 || warn) ? (
                  <span className="flex items-center gap-1 text-[12px] font-semibold text-warning"><AlertTriangle size={13} aria-hidden="true" />{(mine[0]?.message) ?? warn}</span>
                ) : null}
              </button>
              <select aria-label={`AEM field type for ${f.label || f.key}`} value={f.fieldType} onChange={(e) => onFieldType(f.propertyId, e.target.value as FieldTypeId)}
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
