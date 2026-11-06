import { Layers } from 'lucide-react'
import type { ComponentDef } from '../schema'
import type { ComponentDialog } from '../../dialog/schema'

/**
 * Explains the "group" setting on properties and shows where the properties currently land in the dialog.
 * Groups are a starting layout, not a rule: nothing here can fail, and the Dialog tab can change all of it.
 */
export function GroupsNote({ component, dialog, onShowDialog }: { component: ComponentDef; dialog: ComponentDialog; onShowDialog: () => void }) {
  const label = (id: string) => component.properties.find((p) => p.id === id)?.label || 'Untitled'
  const contents = (t: ComponentDialog['tabs'][number]) => t.items.map((i) => (i.kind === 'field' ? label(i.id) : `Section “${i.title}” (${i.fieldIds.map(label).join(', ')})`)).join(' · ')
  const grouped = component.properties.some((p) => p.group.trim())
  return (
    <section aria-label="How groups become dialog tabs" className="mt-4 rounded-lg border border-hairline bg-sand/50 p-4 text-[13px]">
      <h3 className="flex items-center gap-2 text-[13px] font-extrabold text-ink-strong"><Layers size={15} aria-hidden="true" />How groups lay out the dialog</h3>
      <p className="mt-1.5 max-w-[70ch] text-ink">
        A property’s <strong>group</strong> decides where it starts in the AEM dialog. It is a starting layout, not a rule, so nothing can fail because of it.
      </p>
      <ul className="mt-2 max-w-[70ch] list-disc space-y-1 pl-5 text-ink-muted">
        <li>Group <code className="rounded bg-surface px-1 font-mono text-[12px]">Link</code> puts the property in a tab called “Link”.</li>
        <li>Group <code className="rounded bg-surface px-1 font-mono text-[12px]">Style › Spacing</code> puts it in a section called “Spacing” inside the “Style” tab.</li>
        <li>No group puts it in a tab called “Properties”.</li>
        <li>Set a group from a property’s Edit panel. Tabs and sections appear in the order they are first used.</li>
      </ul>
      <p className="mt-3 font-bold text-ink-strong">{grouped ? 'Where your properties are now' : 'No groups are set, so everything sits together'}</p>
      <ul aria-label="Current dialog layout" className="mt-1 space-y-1.5">
        {dialog.tabs.map((t) => (
          <li key={t.id}>
            <span className="font-bold text-ink-strong">Tab “{t.title}”</span>
            <span className="text-ink-muted">{contents(t) ? `: ${contents(t)}` : ': empty'}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-ink-muted">
        This shows the dialog as it is now, including any changes made in the Dialog tab. <button type="button" onClick={onShowDialog} className="cursor-pointer font-bold text-accent-text underline">Open the Dialog tab</button> to move, rename or regroup.
      </p>
    </section>
  )
}
