import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, Download, FileUp, History, Trash2 } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { downloadText } from '../../../lib/download'
import { MAX_IMPORT_BYTES, ProjectError, exportBackupJson } from '../../projects/repo'
import { MAX_SNAPSHOTS, createSnapshot, deleteSnapshot, listSnapshots, restoreFromText, restoreSnapshot, snapshotJson, type RestoreMode } from '../service'

const kindLabel = { manual: 'Saved by you', auto: 'Automatic', 'before-restore': 'Before a restore' } as const
const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`)

function ModeChoice({ name, mode, onMode }: { name: string; mode: RestoreMode; onMode: (m: RestoreMode) => void }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="sr-only">How to restore</legend>
      <label className="flex cursor-pointer items-start gap-2 text-[13px]"><input type="radio" name={name} className="mt-0.5" checked={mode === 'copies'} onChange={() => onMode('copies')} /><span><strong className="text-ink-strong">Add as copies.</strong> Keeps every project you have now. Restored ones are added next to them.</span></label>
      <label className="flex cursor-pointer items-start gap-2 text-[13px]"><input type="radio" name={name} className="mt-0.5" checked={mode === 'replace'} onChange={() => onMode('replace')} /><span><strong className="text-ink-strong">Replace everything.</strong> Your projects are swapped for the backup. A restore point of your current projects is saved first.</span></label>
    </fieldset>
  )
}

export function BackupSection() {
  const snaps = useLiveQuery(() => listSnapshots(), [])
  const [label, setLabel] = useState('')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [openId, setOpenId] = useState<number | 'file' | null>(null)
  const [mode, setMode] = useState<RestoreMode>('copies')
  const [fileText, setFileText] = useState('')
  const [fileName, setFileName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const run = async (fn: () => Promise<string>) => {
    try { setMsg({ tone: 'ok', text: await fn() }) } catch (e) { setMsg({ tone: 'error', text: e instanceof ProjectError ? e.message : 'That did not work. Nothing was changed.' }) }
  }
  const summary = (r: { restored: unknown[]; skipped: unknown[]; mode: RestoreMode }) =>
    `${r.mode === 'replace' ? 'Replaced your projects with the backup' : 'Restored'}: ${r.restored.length} project${r.restored.length === 1 ? '' : 's'}${r.mode === 'copies' ? ' added' : ''}.${r.skipped.length ? ` ${r.skipped.length} could not be read and ${r.skipped.length === 1 ? 'was' : 'were'} skipped.` : ''}${r.mode === 'replace' ? ' A restore point of the previous projects was saved.' : ''}`

  const pickFile = async (f?: File) => {
    if (!f) return
    if (f.size > MAX_IMPORT_BYTES) return setMsg({ tone: 'error', text: 'That file is larger than 10 MB.' })
    setFileText(await f.text()); setFileName(f.name); setOpenId('file'); setMode('copies'); setMsg(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <section aria-label="Backup and restore" className="mt-6 rounded-xl border border-hairline p-5">
      <h2 className="flex items-center gap-2 text-base"><Archive size={16} aria-hidden="true" />Backup and restore</h2>
      <p className="mt-1 max-w-[68ch] text-[13px] text-ink-muted">Your projects live only in this browser. Clearing site data would remove them. Save restore points here, or download a backup file to keep somewhere safe.</p>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-[13px] font-bold text-ink-strong">Name (optional)
          <input className="mt-1 block h-9 w-56 rounded-lg border border-hairline-strong bg-surface px-3 text-sm font-normal" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Before the big refactor" maxLength={80} />
        </label>
        <Button onClick={() => run(async () => { const s = await createSnapshot('manual', label); setLabel(''); return `Saved a restore point of ${s!.projectCount} project${s!.projectCount === 1 ? '' : 's'}.` })}><History size={16} aria-hidden="true" />Save a restore point</Button>
        <Button variant="outline" onClick={() => run(async () => { downloadText(`aemora-backup-${new Date().toISOString().slice(0, 10)}.json`, await exportBackupJson()); return 'Downloaded a backup file.' })}><Download size={16} aria-hidden="true" />Download a backup file</Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()}><FileUp size={16} aria-hidden="true" />Restore from a file</Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Choose a backup file to restore" onChange={(e) => void pickFile(e.target.files?.[0])} />
      </div>

      {msg && <p role={msg.tone === 'error' ? 'alert' : 'status'} className={`mt-3 rounded-lg p-3 text-[13px] font-semibold ${msg.tone === 'error' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'}`}>{msg.text}</p>}

      {openId === 'file' && (
        <div role="group" aria-label="Restore from file" className="mt-4 space-y-3 rounded-lg bg-sand p-4">
          <p className="text-[13px] text-ink-strong">Restore from <strong>{fileName}</strong></p>
          <ModeChoice name="file-mode" mode={mode} onMode={setMode} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => run(async () => { const r = await restoreFromText(fileText, mode); setOpenId(null); return summary(r) })}>Restore</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpenId(null)}>Cancel</Button>
          </div>
        </div>
      )}

      <h3 className="mt-6 text-[13px] font-extrabold text-ink-strong">Restore points <span className="font-normal text-ink-muted">(the newest {MAX_SNAPSHOTS} are kept)</span></h3>
      {snaps === undefined ? null : snaps.length === 0 ? (
        <p className="mt-2 text-[13px] text-ink-muted">None yet. One is made automatically when you open Aemora after changing something, and you can save one at any time.</p>
      ) : (
        <ul aria-label="Restore points" className="mt-2 divide-y divide-hairline border-y border-hairline">
          {snaps.map((s) => (
            <li key={s.id} className="py-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="flex flex-wrap items-center gap-2"><strong className="text-[14px] text-ink-strong">{s.label}</strong><span className="rounded-md bg-sand px-1.5 py-0.5 text-[11px] font-bold text-ink">{kindLabel[s.kind]}</span></p>
                  <p className="text-[12px] text-ink-muted"><time dateTime={s.createdAt}>{new Date(s.createdAt).toLocaleString()}</time> · <span className="tabular">{s.projectCount} project{s.projectCount === 1 ? '' : 's'} · {kb(s.bytes)}</span></p>
                </div>
                <Button size="sm" variant="outline" aria-label={`Restore ${s.label}`} onClick={() => { setOpenId(s.id); setMode('copies'); setMsg(null) }}>Restore…</Button>
                <Button size="sm" variant="ghost" aria-label={`Download ${s.label}`} onClick={() => run(async () => { downloadText(`aemora-restore-point-${s.createdAt.slice(0, 10)}.json`, await snapshotJson(s.id)); return 'Downloaded the restore point.' })}><Download size={14} aria-hidden="true" /></Button>
                <Button size="sm" variant="ghost" aria-label={`Delete ${s.label}`} onClick={() => run(async () => { await deleteSnapshot(s.id); return 'Deleted the restore point.' })}><Trash2 size={14} aria-hidden="true" /></Button>
              </div>
              {openId === s.id && (
                <div role="group" aria-label={`Restore ${s.label}`} className="mt-3 space-y-3 rounded-lg bg-sand p-4">
                  <ModeChoice name={`mode-${s.id}`} mode={mode} onMode={setMode} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => run(async () => { const r = await restoreSnapshot(s.id, mode); setOpenId(null); return summary(r) })}>Restore</Button>
                    <Button size="sm" variant="ghost" onClick={() => setOpenId(null)}>Cancel</Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
