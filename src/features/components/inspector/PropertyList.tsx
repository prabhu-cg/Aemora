import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertTriangle, ArrowDown, ArrowUp, CircleAlert, GripVertical } from 'lucide-react'
import type { ComponentDef, Property } from '../schema'
import { issuesFor, type Issue } from '../validate'

interface Props {
  component: ComponentDef
  issues: Issue[]
  selectedId: string
  onSelect: (id: string) => void
  onMove: (from: number, to: number) => void
}

const iconBtn = 'inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-sand hover:text-ink-strong disabled:opacity-30 disabled:pointer-events-none cursor-pointer'

export function PropertyList({ component, issues, selectedId, onSelect, onMove }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const ids = component.properties.map((p) => p.id)
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    onMove(ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)))
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul aria-label={`Properties of ${component.name}`} className="border-y border-hairline">
          {component.properties.map((p, i) => (
            <Row key={p.id} property={p} index={i} last={i === ids.length - 1} issues={issuesFor(issues, p.id)} selected={p.id === selectedId} onSelect={onSelect} onMove={onMove} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function Row({ property: p, index, last, issues, selected, onSelect, onMove }: {
  property: Property; index: number; last: boolean; issues: Issue[]; selected: boolean; onSelect: (id: string) => void; onMove: Props['onMove']
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: p.id })
  const errors = issues.filter((i) => i.level === 'error')
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1 border-t border-hairline first:border-t-0 ${selected ? 'bg-ink-strong/5' : 'bg-bg hover:bg-ink-strong/[0.03]'} ${isDragging ? 'relative z-10 shadow-[0_8px_24px_-6px_#1010141f]' : ''}`}
    >
      <button ref={setActivatorNodeRef} type="button" className={`${iconBtn} cursor-grab touch-none`} aria-label={`Reorder ${p.label}. Press space, then use the arrow keys.`} {...attributes} {...listeners}>
        <GripVertical size={16} aria-hidden="true" />
      </button>
      <button
        type="button" onClick={() => onSelect(p.id)} aria-pressed={selected} aria-label={`Edit ${p.label}`}
        className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-x-3 gap-y-0.5 py-2.5 pr-2 text-left"
      >
        <span className="min-w-0 basis-44 truncate font-bold text-ink-strong">{p.label}</span>
        <code className="min-w-0 truncate text-[12px] text-ink-muted">{p.key}</code>
        <span className="text-[13px] text-ink">{p.type}</span>
        {p.required && <span className="rounded-md bg-sand px-1.5 py-0.5 text-[11px] font-bold text-ink">required</span>}
        {p.origin.suggested && <span className="rounded-md bg-accent-tint px-1.5 py-0.5 text-[11px] font-bold text-accent-text">suggested</span>}
        {p.group && <span className="truncate rounded-md border border-hairline px-1.5 py-0.5 text-[11px] text-ink-muted">{p.group}</span>}
        {errors.length > 0 ? (
          <span className="flex items-center gap-1 text-[12px] font-semibold text-danger"><CircleAlert size={13} aria-hidden="true" />{errors[0].message}</span>
        ) : issues.length > 0 ? (
          <span className="flex items-center gap-1 text-[12px] font-semibold text-warning"><AlertTriangle size={13} aria-hidden="true" />{issues[0].message}</span>
        ) : null}
      </button>
      <button type="button" className={iconBtn} aria-label={`Move ${p.label} up`} disabled={index === 0} onClick={() => onMove(index, index - 1)}><ArrowUp size={15} aria-hidden="true" /></button>
      <button type="button" className={iconBtn} aria-label={`Move ${p.label} down`} disabled={last} onClick={() => onMove(index, index + 1)}><ArrowDown size={15} aria-hidden="true" /></button>
    </li>
  )
}
