import { useState, type KeyboardEvent } from 'react'
import { Copy, Download, Pencil, Trash2 } from 'lucide-react'
import type { Project } from './schema'
import { Button } from '../../components/ui/Button'
import { relativeTime } from '../../lib/time'

const sourceLabel: Record<Project['inputSource']['kind'], string> = {
  none: 'No input yet', 'figma-rest': 'Figma API', 'figma-plugin': 'Figma plugin', json: 'JSON', screenshot: 'Screenshot', clipboard: 'Clipboard',
}

interface Props {
  project: Project
  onOpen: () => void
  onRename: (name: string) => Promise<void>
  onDuplicate: () => void
  onExport: () => void
  onDelete: () => void
}

const iconBtn = 'inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-sand hover:text-ink-strong cursor-pointer'

export function ProjectRow({ project, onOpen, onRename, onDuplicate, onExport, onDelete }: Props) {
  const [mode, setMode] = useState<'view' | 'rename' | 'confirm-delete'>('view')
  const [draft, setDraft] = useState(project.name)
  const [err, setErr] = useState('')

  async function commit() {
    if (!draft.trim()) return setErr('Name is required')
    try {
      await onRename(draft)
      setMode('view'); setErr('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not rename')
    }
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') { setMode('view'); setDraft(project.name); setErr('') }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline py-3 first:border-t-0">
      <div className="min-w-0 flex-1 basis-64">
        {mode === 'rename' ? (
          <div>
            <input
              autoFocus
              aria-label={`New name for ${project.name}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              className="h-9 w-full max-w-sm rounded-lg border border-hairline-strong bg-surface px-3 font-bold text-ink-strong"
              maxLength={140}
            />
            {err && <p role="alert" className="mt-1 text-[12px] text-danger">{err}</p>}
          </div>
        ) : (
          <button type="button" onClick={onOpen} className="block max-w-full truncate text-left text-[15px] font-extrabold tracking-tight text-ink-strong hover:text-accent-text cursor-pointer">
            {project.name}
          </button>
        )}
        <p className="truncate text-[13px] text-ink-muted">
          {project.description || 'No description'}
        </p>
      </div>
      <div className="flex items-center gap-3 text-[12px] text-ink-muted">
        {project.aemComponentName && <code className="rounded-md bg-sand px-1.5 py-0.5 font-mono text-[12px] text-ink">{project.aemComponentName}</code>}
        <span>{sourceLabel[project.inputSource.kind]}</span>
        <time dateTime={project.updatedAt} className="tabular w-24 text-right">{relativeTime(project.updatedAt)}</time>
      </div>
      <div className="flex items-center gap-1">
        {mode === 'confirm-delete' ? (
          <div role="alert" className="flex items-center gap-2 text-[13px]">
            <span className="text-ink-strong">Delete “{project.name}”? This can’t be undone.</span>
            <Button size="sm" variant="outline" className="!border-danger !text-danger" onClick={onDelete}>Delete</Button>
            <Button size="sm" variant="ghost" onClick={() => setMode('view')}>Cancel</Button>
          </div>
        ) : mode === 'rename' ? (
          <>
            <Button size="sm" onClick={commit}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => { setMode('view'); setDraft(project.name); setErr('') }}>Cancel</Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={onOpen}>Open</Button>
            <button type="button" className={iconBtn} title="Rename" aria-label={`Rename ${project.name}`} onClick={() => { setDraft(project.name); setMode('rename') }}><Pencil size={15} aria-hidden="true" /></button>
            <button type="button" className={iconBtn} title="Duplicate" aria-label={`Duplicate ${project.name}`} onClick={onDuplicate}><Copy size={15} aria-hidden="true" /></button>
            <button type="button" className={iconBtn} title="Export project JSON" aria-label={`Export ${project.name}`} onClick={onExport}><Download size={15} aria-hidden="true" /></button>
            <button type="button" className={iconBtn} title="Delete" aria-label={`Delete ${project.name}`} onClick={() => setMode('confirm-delete')}><Trash2 size={15} aria-hidden="true" /></button>
          </>
        )}
      </div>
    </li>
  )
}
