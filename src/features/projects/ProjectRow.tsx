import { useState } from 'react'
import { Copy, Download, Pencil, Trash2 } from 'lucide-react'
import type { Project } from './schema'
import { Button } from '../../components/ui/Button'
import { ActionMenu } from '../../components/ui/ActionMenu'
import { EditProjectDrawer } from './EditProjectDrawer'
import { relativeTime } from '../../lib/time'

const sourceLabel: Record<Project['inputSource']['kind'], string> = {
  none: 'No input yet', 'figma-rest': 'Figma API', 'figma-plugin': 'Figma plugin', json: 'JSON', screenshot: 'Screenshot', clipboard: 'Clipboard',
}

interface Props {
  project: Project
  onOpen: () => void
  onDuplicate: () => void
  onExport: () => void
  onDelete: () => void
}

export function ProjectRow({ project, onOpen, onDuplicate, onExport, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline py-3 first:border-t-0">
      <div className="min-w-0 flex-1 basis-64">
        <button type="button" onClick={onOpen} className="block max-w-full truncate text-left text-[15px] font-extrabold tracking-tight text-ink-strong hover:text-accent-text cursor-pointer">
          {project.name}
        </button>
        <p className="truncate text-[13px] text-ink-muted">{project.description || 'No description'}</p>
      </div>
      <div className="flex items-center gap-3 text-[12px] text-ink-muted">
        {project.aemComponentName && <code className="rounded-md bg-sand px-1.5 py-0.5 font-mono text-[12px] text-ink">{project.aemComponentName}</code>}
        <span>{sourceLabel[project.inputSource.kind]}</span>
        <time dateTime={project.updatedAt} className="tabular w-24 text-right">{relativeTime(project.updatedAt)}</time>
      </div>
      <div className="flex items-center gap-1">
        {confirming ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-ink-strong">Delete “{project.name}”? This can’t be undone.</span>
            <Button size="sm" variant="outline" className="!border-danger !text-danger" onClick={onDelete}>Delete</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={onOpen}>Open</Button>
            <ActionMenu
              label={`More actions for ${project.name}`}
              items={[
                { label: 'Edit project', icon: <Pencil size={15} />, onSelect: () => setEditing(true) },
                { label: 'Duplicate', icon: <Copy size={15} />, onSelect: onDuplicate },
                { label: 'Export project JSON', icon: <Download size={15} />, onSelect: onExport },
                { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onSelect: () => setConfirming(true) },
              ]}
            />
          </>
        )}
      </div>
      <EditProjectDrawer open={editing} project={project} onClose={() => setEditing(false)} />
    </li>
  )
}
